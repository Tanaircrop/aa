"""Danh sách video cho sidebar + điều hướng prev/next."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from ..models import CodingEntry, Video
from ..services.entries import status_of

router = APIRouter(prefix="/api/videos", tags=["videos"])

STATUS_FILTERS = {"all", "not_started", "in_progress", "ok", "check", "flagged"}


def _list_rows(session: Session, status: str, coder: Optional[str],
               search: Optional[str], pilot_only: bool) -> list[dict[str, Any]]:
    videos = session.exec(select(Video).order_by(Video.stt, Video.id)).all()
    entries = {e.video_id: e for e in session.exec(select(CodingEntry)).all()}

    needle = (search or "").strip().lower()
    rows: list[dict[str, Any]] = []
    for video in videos:
        if pilot_only and not video.in_irr_pilot:
            continue
        entry = entries.get(video.video_id)
        state = status_of(entry) if entry else "not_started"
        flagged = bool(entry and entry.flagged_for_review)
        # Coder_ID được điền sẵn khi mở video, nên chỉ tính là "của coder này"
        # khi đã thực sự nhập gì đó — nếu không, chỉ lướt qua cũng bị gán tên.
        entry_coder = entry.coder_id if (entry and entry.started) else None

        if status != "all":
            if status == "flagged":
                if not flagged:
                    continue
            elif state != status:
                continue
        if coder and entry_coder != coder:
            continue
        if needle:
            haystack = " ".join(str(x or "").lower() for x in
                                (video.stt, video.video_id, video.account_handle))
            if needle not in haystack:
                continue

        rows.append({
            "video_id": video.video_id,
            "stt": video.stt,
            "account_handle": video.account_handle,
            "url": video.url,
            "status": state,
            "qc_status": entry.qc_status if entry else None,
            "coder_id": entry_coder,
            "flagged": flagged,
            "in_irr_pilot": video.in_irr_pilot,
        })
    return rows


@router.get("")
def list_videos(
    status: str = Query("all"),
    coder: Optional[str] = None,
    search: Optional[str] = None,
    pilot_only: bool = False,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if status not in STATUS_FILTERS:
        raise HTTPException(400, f"status phải thuộc {sorted(STATUS_FILTERS)}")
    rows = _list_rows(session, status, coder, search, pilot_only)

    counts = {"total": 0, "not_started": 0, "in_progress": 0, "ok": 0, "check": 0}
    all_rows = _list_rows(session, "all", None, None, pilot_only)
    counts["total"] = len(all_rows)
    for row in all_rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    return {"videos": rows, "counts": counts}


@router.get("/{video_id}/neighbors")
def neighbors(
    video_id: str,
    status: str = Query("all"),
    coder: Optional[str] = None,
    search: Optional[str] = None,
    pilot_only: bool = False,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Video trước/sau theo đúng filter đang bật ở sidebar."""
    rows = _list_rows(session, status, coder, search, pilot_only)
    ids = [r["video_id"] for r in rows]
    if video_id not in ids:
        return {"prev": None, "next": ids[0] if ids else None, "index": None,
                "total": len(ids)}
    idx = ids.index(video_id)
    return {
        "prev": ids[idx - 1] if idx > 0 else None,
        "next": ids[idx + 1] if idx + 1 < len(ids) else None,
        "index": idx + 1,
        "total": len(ids),
    }
