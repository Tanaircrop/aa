"""Logic dùng chung cho coding thường và IRR pilot: auto-pull, patch, payload."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlmodel import Session, select

from ..columns import COLUMNS, COLUMNS_BY_KEY, DERIVED_KEYS, EDITABLE_KEYS
from ..models import Account, CodingEntry, IRREntry, Video
from . import derive, validate as validate_service
from .excel_io import coerce

#: Cột lấy tự động từ `2_Video_Queue` / `1_Account_List`.
AUTO_PULL_FROM_VIDEO = {
    "video_id": "video_id",
    "url": "url",
    "upload_date": "upload_date",
    "account_handle": "account_handle",
    "follower_count": "follower_count",
    "e1_likes": "e1_likes",
    "e2_comments": "e2_comments",
    "e3_shares": "e3_shares",
    "e4_views": "e4_views",
}


def serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    return value


def entry_dict(entry: CodingEntry | IRREntry, video: Video | None = None) -> dict[str, Any]:
    """Dict thô (giá trị python) của entry, kèm STT lấy từ Video."""
    data: dict[str, Any] = {}
    for col in COLUMNS:
        if col.key == "stt":
            data["stt"] = video.stt if video else None
            continue
        data[col.key] = getattr(entry, col.key, None)
    data["overrides"] = dict(entry.overrides or {})
    data["touched"] = dict(entry.touched or {})
    return data


def autopull(entry: CodingEntry | IRREntry, video: Video,
             account: Account | None, *, overwrite: bool = False) -> None:
    """Điền metadata từ Video/Account. Mặc định không đè giá trị coder đã sửa."""
    touched = dict(entry.touched or {})
    for entry_key, video_key in AUTO_PULL_FROM_VIDEO.items():
        if not overwrite and touched.get(entry_key):
            continue
        value = getattr(video, video_key, None)
        if value is not None or getattr(entry, entry_key, None) is None:
            setattr(entry, entry_key, value)

    if account is not None:
        if overwrite or not touched.get("account_type"):
            if account.account_type is not None:
                entry.account_type = account.account_type
        if entry.follower_count is None:
            entry.follower_count = account.follower_baseline


def ensure_entry(session: Session, video: Video, default_coder: str | None = None
                 ) -> CodingEntry:
    """Lấy (hoặc tạo) dòng coding cho video, đã auto-pull metadata."""
    entry = session.exec(
        select(CodingEntry).where(CodingEntry.video_id == video.video_id)
    ).first()
    created = entry is None
    if entry is None:
        entry = CodingEntry(video_id=video.video_id)

    account = None
    if video.account_handle:
        account = session.exec(
            select(Account).where(Account.handle == video.account_handle)
        ).first()
    autopull(entry, video, account)

    # Coder đang mở video chính là người code nó — điền sẵn kể cả với dòng đã
    # tồn tại từ lúc import, để field bắt buộc đầu tiên không chặn luồng gõ phím.
    if not entry.coder_id and default_coder:
        entry.coder_id = default_coder

    if created:
        if entry.coding_date is None:
            entry.coding_date = date.today()
        if entry.snapshot_time is None:
            entry.snapshot_time = datetime.now().replace(second=0, microsecond=0)

    recompute(entry)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def ensure_irr_entry(session: Session, video: Video, role: str) -> IRREntry:
    entry = session.exec(
        select(IRREntry).where(IRREntry.video_id == video.video_id,
                               IRREntry.role == role)
    ).first()
    created = entry is None
    if entry is None:
        entry = IRREntry(video_id=video.video_id, role=role, coder_id=role)

    account = None
    if video.account_handle:
        account = session.exec(
            select(Account).where(Account.handle == video.account_handle)
        ).first()
    autopull(entry, video, account)

    if created:
        entry.coding_date = entry.coding_date or date.today()
        entry.coder_id = role
        entry.snapshot_time = entry.snapshot_time or datetime.now().replace(
            second=0, microsecond=0)

    recompute(entry)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def apply_patch(entry: CodingEntry | IRREntry, patch: dict[str, Any]) -> list[str]:
    """Ghi các field trong `patch` vào entry. Trả về danh sách field bị từ chối."""
    rejected: list[str] = []
    touched = dict(entry.touched or {})
    overrides = dict(entry.overrides or {})

    for key, raw in patch.items():
        if key in ("overrides", "touched", "flagged_for_review", "diff_notes"):
            continue
        col = COLUMNS_BY_KEY.get(key)
        if col is None or key == "stt":
            rejected.append(key)
            continue

        blank = raw is None or (isinstance(raw, str) and not raw.strip())
        value = None if blank else coerce(key, raw)

        if col.source == "derived":
            # Sửa tay một field derived = ghi override (có cảnh báo trong UI).
            if blank:
                overrides.pop(key, None)
                touched.pop(key, None)
            else:
                overrides[key] = value
                touched[key] = True
            continue

        if key not in EDITABLE_KEYS and col.source != "auto":
            rejected.append(key)
            continue

        setattr(entry, key, value)
        if blank:
            touched.pop(key, None)
        else:
            touched[key] = True

    if "overrides" in patch and isinstance(patch["overrides"], dict):
        for key, raw in patch["overrides"].items():
            if key not in DERIVED_KEYS:
                rejected.append(f"overrides.{key}")
                continue
            if raw is None or raw == "":
                overrides.pop(key, None)
            else:
                overrides[key] = coerce(key, raw)

    if "flagged_for_review" in patch:
        entry.flagged_for_review = bool(patch["flagged_for_review"])
    if "diff_notes" in patch and isinstance(entry, IRREntry):
        entry.diff_notes = patch["diff_notes"] or None

    entry.overrides = overrides
    entry.touched = touched
    entry.started = entry.started or bool(touched)
    entry.updated_at = datetime.now()
    return rejected


def recompute(entry: CodingEntry | IRREntry) -> dict[str, Any]:
    """Tính lại derived và ghi vào entry. Trả về kết quả derive đầy đủ."""
    data = entry_dict(entry)
    result = derive.compute(data)
    for key, value in result["values"].items():
        if COLUMNS_BY_KEY[key].source == "derived":
            rule_kind = result["meta"][key]["kind"]
            if rule_kind == "manual" and key not in (entry.overrides or {}):
                continue  # coder tự nhập, không đụng
            setattr(entry, key, value)
    entry.completed = not result["missing_required"]
    if not entry.started:
        # Dòng chưa ai đụng tới thì để QC trống, không phải "CHECK vì thiếu field"
        # — nếu không, cả 500 video chưa code đều nhảy vào bảng "cần review".
        entry.qc_status = None
    return result


def payload(entry: CodingEntry | IRREntry, video: Video | None) -> dict[str, Any]:
    """Payload đầy đủ cho frontend: giá trị + derived + cảnh báo."""
    data = entry_dict(entry, video)
    derived = derive.compute(data)
    checks = validate_service.validate(data)

    values = {k: serialize(v) for k, v in data.items()
              if k not in ("overrides", "touched")}

    return {
        "video_id": entry.video_id,
        "role": getattr(entry, "role", None),
        "values": values,
        "overrides": {k: serialize(v) for k, v in (entry.overrides or {}).items()},
        "touched": dict(entry.touched or {}),
        "derived": {
            "values": {k: serialize(v) for k, v in derived["values"].items()},
            "auto": {k: serialize(v) for k, v in derived["auto_values"].items()},
            "meta": derived["meta"],
            "suggestions": derived["suggestions"],
            "qc_reasons": derived["qc_reasons"],
        },
        "validation": checks,
        "status": status_of(entry, checks),
        "flagged_for_review": getattr(entry, "flagged_for_review", False),
        "diff_notes": getattr(entry, "diff_notes", None),
        "started": entry.started,
        "completed": entry.completed,
        "video": {
            "stt": video.stt if video else None,
            "url": video.url if video else None,
            "in_irr_pilot": video.in_irr_pilot if video else False,
        },
        "updated_at": serialize(entry.updated_at),
    }


def status_of(entry: CodingEntry | IRREntry, checks: dict[str, Any] | None = None
              ) -> str:
    """Trạng thái cho chấm màu ở sidebar: not_started | in_progress | check | ok."""
    if not entry.started:
        return "not_started"
    if checks is not None and checks["missing_required"]:
        return "in_progress"
    if not entry.completed:
        return "in_progress"
    return "check" if (entry.qc_status or "").upper() == "CHECK" else "ok"
