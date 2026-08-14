"""Đồng bộ Google Sheets (Phase 6 — tuỳ chọn).

Không tự động đồng bộ real-time. Mọi thao tác ghi đều đi qua bước diff:
`pull_preview` / `push_preview` trả về danh sách ô khác nhau, rồi mới
`pull_apply` / `push_apply` khi coder bấm xác nhận.

`gspread` là dependency tuỳ chọn: thiếu nó thì các route sync báo lỗi rõ ràng
thay vì làm app không khởi động được.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlmodel import Session, select

from ..columns import COLUMNS, COLUMNS_BY_KEY, EDITABLE_KEYS, EXCEL_HEADERS
from ..models import AppSetting, CodingEntry, Video
from .entries import recompute, serialize
from .excel_io import coerce, resolve_header

SETTING_CREDENTIALS = "sheets_credentials_path"
SETTING_SPREADSHEET = "sheets_spreadsheet"
SETTING_WORKSHEET = "sheets_worksheet"
DEFAULT_WORKSHEET = "3_Coding_Sheet"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]


class SyncNotConfigured(RuntimeError):
    pass


def get_settings(session: Session) -> dict[str, str]:
    rows = {s.key: s.value for s in session.exec(select(AppSetting)).all()}
    return {
        "credentials_path": rows.get(SETTING_CREDENTIALS, ""),
        "spreadsheet": rows.get(SETTING_SPREADSHEET, ""),
        "worksheet": rows.get(SETTING_WORKSHEET, DEFAULT_WORKSHEET),
    }


def _open_worksheet(session: Session):
    try:
        import gspread  # noqa: PLC0415
        from google.oauth2.service_account import Credentials  # noqa: PLC0415
    except ImportError as exc:
        raise SyncNotConfigured(
            "Thiếu thư viện đồng bộ. Cài bằng: pip install gspread google-auth"
        ) from exc

    config = get_settings(session)
    if not config["credentials_path"] or not config["spreadsheet"]:
        raise SyncNotConfigured(
            "Chưa cấu hình Google Sheets. Vào Dashboard > Cấu hình sync để nhập "
            "đường dẫn file service account .json và ID/URL của spreadsheet, "
            "rồi share sheet cho email service account với quyền Editor."
        )

    creds = Credentials.from_service_account_file(
        config["credentials_path"], scopes=SCOPES)
    client = gspread.authorize(creds)
    key = config["spreadsheet"]
    book = (client.open_by_url(key) if key.startswith("http")
            else client.open_by_key(key))
    return book.worksheet(config["worksheet"] or DEFAULT_WORKSHEET)


def _local_rows(session: Session) -> dict[str, dict[str, Any]]:
    entries = {e.video_id: e for e in session.exec(select(CodingEntry)).all()}
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    out: dict[str, dict[str, Any]] = {}
    for video_id, video in videos.items():
        entry = entries.get(video_id)
        row = {c.key: (getattr(entry, c.key, None) if entry else None)
               for c in COLUMNS}
        row["stt"] = video.stt
        row["video_id"] = video_id
        out[video_id] = row
    return out


def _remote_rows(worksheet) -> tuple[dict[str, dict[str, Any]], list[str]]:
    records = worksheet.get_all_values()
    if not records:
        return {}, []
    headers = records[0]
    keys = [resolve_header(h) for h in headers]
    out: dict[str, dict[str, Any]] = {}
    for raw in records[1:]:
        row: dict[str, Any] = {}
        for key, value in zip(keys, raw):
            if key:
                row[key] = coerce(key, value if value != "" else None)
        video_id = row.get("video_id")
        if video_id:
            out[str(video_id)] = row
    return out, headers


def _diff(local: dict[str, dict[str, Any]], remote: dict[str, dict[str, Any]],
          fields: list[str]) -> list[dict[str, Any]]:
    diffs = []
    for video_id in sorted(set(local) | set(remote),
                           key=lambda v: (local.get(v, {}).get("stt") or 10**9, v)):
        l_row, r_row = local.get(video_id), remote.get(video_id)
        if l_row is None:
            diffs.append({"video_id": video_id, "kind": "only_remote", "cells": []})
            continue
        if r_row is None:
            diffs.append({"video_id": video_id, "kind": "only_local", "cells": []})
            continue
        cells = []
        for key in fields:
            lv, rv = l_row.get(key), r_row.get(key)
            if _differs(lv, rv):
                cells.append({
                    "field": key,
                    "label": COLUMNS_BY_KEY[key].excel,
                    "local": serialize(lv),
                    "remote": serialize(rv),
                })
        if cells:
            diffs.append({"video_id": video_id, "stt": l_row.get("stt"),
                          "kind": "changed", "cells": cells})
    return diffs


def _differs(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return False
    if a is None or b is None:
        return True
    try:
        return abs(float(a) - float(b)) > 1e-9
    except (TypeError, ValueError):
        return str(serialize(a)).strip() != str(serialize(b)).strip()


def pull_preview(session: Session) -> dict[str, Any]:
    worksheet = _open_worksheet(session)
    remote, _ = _remote_rows(worksheet)
    local = _local_rows(session)
    return {"direction": "pull", "diffs": _diff(local, remote, EDITABLE_KEYS),
            "remote_rows": len(remote), "local_rows": len(local)}


def pull_apply(session: Session, video_ids: Optional[list[str]] = None
               ) -> dict[str, Any]:
    """Ghi dữ liệu từ Sheets vào SQLite (chỉ những video được xác nhận)."""
    worksheet = _open_worksheet(session)
    remote, _ = _remote_rows(worksheet)
    entries = {e.video_id: e for e in session.exec(select(CodingEntry)).all()}
    targets = video_ids if video_ids is not None else list(remote)

    updated = 0
    for video_id in targets:
        row = remote.get(video_id)
        if row is None:
            continue
        entry = entries.get(video_id) or CodingEntry(video_id=video_id)
        touched = dict(entry.touched or {})
        for key in EDITABLE_KEYS:
            if key not in row:
                continue
            setattr(entry, key, row[key])
            if row[key] is None:
                touched.pop(key, None)
            else:
                touched[key] = True
        entry.touched = touched
        entry.started = entry.started or bool(touched)
        recompute(entry)
        session.add(entry)
        updated += 1
    session.commit()
    return {"ok": True, "updated": updated}


def push_preview(session: Session) -> dict[str, Any]:
    worksheet = _open_worksheet(session)
    remote, _ = _remote_rows(worksheet)
    local = _local_rows(session)
    all_keys = [c.key for c in COLUMNS]
    return {"direction": "push", "diffs": _diff(local, remote, all_keys),
            "remote_rows": len(remote), "local_rows": len(local)}


def push_apply(session: Session, video_ids: Optional[list[str]] = None
               ) -> dict[str, Any]:
    """Ghi toàn bộ bảng từ SQLite lên Sheets (ghi cả sheet cho khỏi lệch hàng)."""
    worksheet = _open_worksheet(session)
    local = _local_rows(session)
    ordered = sorted(local.values(), key=lambda r: (r.get("stt") or 10**9,
                                                    r.get("video_id") or ""))
    if video_ids is not None:
        allowed = set(video_ids)
        ordered = [r for r in ordered if r.get("video_id") in allowed]

    values = [EXCEL_HEADERS]
    for row in ordered:
        values.append([
            "" if row.get(c.key) is None else str(serialize(row.get(c.key)))
            for c in COLUMNS
        ])
    worksheet.clear()
    worksheet.update(values, "A1")
    return {"ok": True, "rows": len(ordered)}
