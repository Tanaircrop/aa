"""Import file `.xlsx` gốc vào SQLite — idempotent, match theo Video_ID.

Chạy lại nhiều lần không tạo trùng: mỗi lần chỉ update dòng đã có hoặc thêm dòng
mới. Dữ liệu coder đã nhập trong app KHÔNG bị ghi đè bởi ô trống của file nguồn.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from ..columns import COLUMNS_BY_KEY, IMPORTABLE_KEYS
from ..models import Account, Coder, CodingEntry, IRREntry, QuickGuide, Video
from . import excel_io
from .entries import recompute
from .quick_guide import seed_defaults

VIDEO_ID_RE = re.compile(r"/video/(\d+)")


def extract_video_id(url: str | None, fallback: str | None = None) -> str | None:
    if url:
        match = VIDEO_ID_RE.search(str(url))
        if match:
            return match.group(1)
        tail = str(url).rstrip("/").rsplit("/", 1)[-1]
        if tail.isdigit():
            return tail
    if fallback:
        return str(fallback).strip()
    return None


def _account_type_from(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in ("1", "influencer", "koc", "influencer/koc", "creator"):
        return 1
    if text in ("2", "brand", "thuong hieu", "thương hiệu"):
        return 2
    try:
        num = int(float(text))
        return num if num in (1, 2) else None
    except (TypeError, ValueError):
        return None


def _pick(raw: dict[str, Any], *needles: str) -> Any:
    """Tìm giá trị trong cột lạ (`_raw`) theo từ khoá chuẩn hoá."""
    for key, value in raw.items():
        norm = excel_io.normalize(key)
        if any(excel_io.normalize(n) in norm for n in needles):
            return value
    return None


def import_accounts(session: Session, path: Path) -> dict[str, int]:
    rows = excel_io.read_sheet(path, excel_io.SHEET_ACCOUNTS)
    existing = {a.handle: a for a in session.exec(select(Account)).all()}
    added = updated = 0

    for row in rows:
        raw = row.get("_raw", {})
        handle = row.get("account_handle") or _pick(raw, "handle", "account", "user")
        if not handle:
            continue
        handle = str(handle).strip().lstrip("@")
        account = existing.get(handle)
        if account is None:
            account = Account(handle=handle)
            added += 1
        else:
            updated += 1

        acc_type = _account_type_from(
            row.get("account_type") or _pick(raw, "accounttype", "loaitaikhoan"))
        if acc_type is not None:
            account.account_type = acc_type

        follower = row.get("follower_count") or _pick(raw, "follower", "nguoitheodoi")
        follower = excel_io.coerce("follower_count", follower)
        if follower is not None:
            account.follower_baseline = follower

        tier = _pick(raw, "tier", "phankhuc", "nhom")
        if tier is not None:
            account.tier = str(tier).strip()

        account.extra = {k: _jsonable(v) for k, v in raw.items() if v is not None}
        session.add(account)
        existing[handle] = account

    session.commit()
    return {"added": added, "updated": updated, "total": len(rows)}


def import_videos(session: Session, path: Path) -> dict[str, int]:
    rows = excel_io.read_sheet(path, excel_io.SHEET_QUEUE)
    existing = {v.video_id: v for v in session.exec(select(Video)).all()}
    added = updated = skipped = 0
    max_stt = max((v.stt or 0 for v in existing.values()), default=0)

    for row in rows:
        raw = row.get("_raw", {})
        url = row.get("url") or _pick(raw, "link", "url")
        video_id = extract_video_id(url, row.get("video_id"))
        if not video_id:
            skipped += 1
            continue

        video = existing.get(video_id)
        if video is None:
            max_stt += 1
            video = Video(video_id=video_id, stt=excel_io.coerce("stt", row.get("stt"))
                          or max_stt)
            added += 1
        else:
            updated += 1
            stt = excel_io.coerce("stt", row.get("stt"))
            if stt is not None:
                video.stt = stt

        for key in ("url", "upload_date", "account_handle", "follower_count",
                    "e1_likes", "e2_comments", "e3_shares", "e4_views"):
            value = excel_io.coerce(key, row.get(key))
            if value is not None:
                setattr(video, key, value)
        if video.account_handle:
            video.account_handle = str(video.account_handle).strip().lstrip("@")

        video.extra = {k: _jsonable(v) for k, v in raw.items() if v is not None}
        session.add(video)
        existing[video_id] = video

    session.commit()
    return {"added": added, "updated": updated, "skipped": skipped,
            "total": len(rows)}


def import_coding(session: Session, path: Path) -> dict[str, int]:
    """Nạp dữ liệu đã nhập dở từ `3_Coding_Sheet`."""
    rows = excel_io.read_sheet(path, excel_io.SHEET_CODING)
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    existing = {e.video_id: e for e in session.exec(select(CodingEntry)).all()}
    added = updated = skipped = 0

    for row in rows:
        video_id = extract_video_id(row.get("url"), row.get("video_id"))
        if not video_id:
            skipped += 1
            continue
        entry = existing.get(video_id)
        if entry is None:
            entry = CodingEntry(video_id=video_id)
            added += 1
        else:
            updated += 1

        touched = dict(entry.touched or {})
        has_coder_input = False
        for key in IMPORTABLE_KEYS:
            if key not in row:
                continue
            value = excel_io.coerce(key, row.get(key))
            if value is None:
                continue  # ô trống trong file không xoá dữ liệu đã có trong app
            setattr(entry, key, value)
            # Chỉ field coder thực sự phải quyết định mới tính là "đã nhập";
            # metadata auto-pull không được làm dòng trống trông như đang code dở.
            if COLUMNS_BY_KEY[key].source == "manual":
                touched[key] = True
                has_coder_input = True

        entry.touched = touched
        entry.started = entry.started or has_coder_input
        recompute(entry)
        session.add(entry)
        existing[video_id] = entry

        if video_id not in videos:
            stt = excel_io.coerce("stt", row.get("stt"))
            video = Video(video_id=video_id, stt=stt, url=row.get("url"),
                          account_handle=row.get("account_handle"))
            session.add(video)
            videos[video_id] = video

    session.commit()
    return {"added": added, "updated": updated, "skipped": skipped,
            "total": len(rows)}


def import_irr(session: Session, path: Path) -> dict[str, int]:
    rows = excel_io.read_sheet(path, excel_io.SHEET_IRR)
    existing = {(e.video_id, e.role): e
                for e in session.exec(select(IRREntry)).all()}
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    added = updated = skipped = 0
    marked_pilot: set[str] = set()

    for row in rows:
        raw = row.get("_raw", {})
        video_id = extract_video_id(row.get("url"), row.get("video_id"))
        role = str(row.get("coder_id") or _pick(raw, "role", "coder") or "").strip().upper()

        # Có mặt trong sheet pilot là đủ để đánh dấu video, kể cả khi dòng chưa
        # gán coder — danh sách pilot thường được liệt kê trước, code sau.
        video = videos.get(video_id) if video_id else None
        if video is not None and not video.in_irr_pilot:
            video.in_irr_pilot = True
            session.add(video)
            marked_pilot.add(video_id)

        if not video_id or role not in ("C1", "C2"):
            skipped += 1
            continue

        entry = existing.get((video_id, role))
        if entry is None:
            entry = IRREntry(video_id=video_id, role=role, coder_id=role)
            added += 1
        else:
            updated += 1

        touched = dict(entry.touched or {})
        for key in IMPORTABLE_KEYS:
            value = excel_io.coerce(key, row.get(key))
            if value is None:
                continue
            setattr(entry, key, value)
            touched[key] = True
        entry.coder_id = role
        entry.touched = touched
        entry.started = entry.started or bool(touched)
        note = _pick(raw, "ghichu", "khacbiet", "diffnote", "note")
        if note:
            entry.diff_notes = str(note).strip()
        recompute(entry)
        session.add(entry)
        existing[(video_id, role)] = entry

    session.commit()
    return {"added": added, "updated": updated, "skipped": skipped,
            "marked_pilot": len(marked_pilot), "total": len(rows)}


def import_quick_guide(session: Session, path: Path) -> dict[str, int]:
    # Sheet này không có cột nào trùng tên với 47 cột chuẩn nên phải ép header
    # về dòng đầu, tránh nhận nhầm một dòng dữ liệu ("X1 | ...") làm header.
    rows = excel_io.read_sheet(path, excel_io.SHEET_GUIDE, header_row=0)
    if not rows:
        return {"added": 0, "updated": 0, "total": 0}

    by_code = {}
    for col in COLUMNS_BY_KEY.values():
        if col.alias:
            by_code[excel_io.normalize(col.alias)] = col.key
        by_code[excel_io.normalize(col.excel.split(" ")[0])] = col.key

    existing = {g.field_key: g for g in session.exec(select(QuickGuide)).all()}
    added = updated = 0
    for row in rows:
        raw = row.get("_raw", {})
        code = _pick(raw, "bien", "code", "ma", "field") or row.get("video_id")
        if not code:
            continue
        norm = excel_io.normalize(str(code).split(" ")[0])
        field_key = by_code.get(norm)
        if not field_key:
            continue

        guide = existing.get(field_key)
        if guide is None:
            guide = QuickGuide(field_key=field_key)
            added += 1
        else:
            updated += 1
        guide.code = str(code).strip()
        guide.label = str(_pick(raw, "ten", "label", "name") or guide.label or "")
        guide.measures = str(_pick(raw, "docaigi", "domuong", "measure", "dinhnghia") or guide.measures or "")
        guide.confused_with = str(_pick(raw, "denham", "confus", "phanbiet")
                                  or guide.confused_with or "")
        guide.example = str(_pick(raw, "vidu", "example") or guide.example or "")
        session.add(guide)
        existing[field_key] = guide

    session.commit()
    return {"added": added, "updated": updated, "total": len(rows)}


def seed_coders(session: Session) -> int:
    existing = {c.coder_id for c in session.exec(select(Coder)).all()}
    added = 0
    for coder_id, name in (("C1", "Coder 1"), ("C2", "Coder 2")):
        if coder_id not in existing:
            session.add(Coder(coder_id=coder_id, name=name))
            added += 1
    session.commit()
    return added


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    return str(value)


def import_workbook(session: Session, path: Path, *,
                    include_coding: bool = True) -> dict[str, Any]:
    """Nạp toàn bộ workbook. An toàn khi chạy lại nhiều lần."""
    report: dict[str, Any] = {"path": str(path)}
    report["coders_seeded"] = seed_coders(session)
    report[excel_io.SHEET_ACCOUNTS] = import_accounts(session, path)
    report[excel_io.SHEET_QUEUE] = import_videos(session, path)
    if include_coding:
        report[excel_io.SHEET_CODING] = import_coding(session, path)
        report[excel_io.SHEET_IRR] = import_irr(session, path)
    report[excel_io.SHEET_GUIDE] = import_quick_guide(session, path)
    report["quick_guide_defaults"] = seed_defaults(session)
    return report
