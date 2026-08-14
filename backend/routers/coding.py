"""Form nhập liệu: đọc entry, autosave từng field, validate, đánh dấu review."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..models import CodingEntry, Video
from ..services import derive, validate as validate_service
from ..services.entries import (apply_patch, ensure_entry, entry_dict, payload,
                                recompute)

router = APIRouter(prefix="/api/coding", tags=["coding"])


def _get_video(session: Session, video_id: str) -> Video:
    video = session.exec(select(Video).where(Video.video_id == video_id)).first()
    if video is None:
        raise HTTPException(404, f"Không tìm thấy video {video_id}")
    return video


@router.get("/{video_id}")
def get_entry(video_id: str, coder: Optional[str] = None,
              session: Session = Depends(get_session)) -> dict[str, Any]:
    video = _get_video(session, video_id)
    entry = ensure_entry(session, video, default_coder=coder)
    return payload(entry, video)


class PatchIn(BaseModel):
    fields: dict[str, Any] = {}
    overrides: Optional[dict[str, Any]] = None
    flagged_for_review: Optional[bool] = None


@router.patch("/{video_id}")
def patch_entry(video_id: str, body: PatchIn,
                session: Session = Depends(get_session)) -> dict[str, Any]:
    """Autosave: ghi ngay vào SQLite, trả lại derived + cảnh báo đã tính lại."""
    video = _get_video(session, video_id)
    entry = session.exec(
        select(CodingEntry).where(CodingEntry.video_id == video_id)
    ).first()
    if entry is None:
        entry = ensure_entry(session, video)

    patch: dict[str, Any] = dict(body.fields)
    if body.overrides is not None:
        patch["overrides"] = body.overrides
    if body.flagged_for_review is not None:
        patch["flagged_for_review"] = body.flagged_for_review

    rejected = apply_patch(entry, patch)
    recompute(entry)
    session.add(entry)
    session.commit()
    session.refresh(entry)

    result = payload(entry, video)
    result["rejected_fields"] = rejected
    return result


@router.post("/{video_id}/validate")
def validate_entry(video_id: str,
                   session: Session = Depends(get_session)) -> dict[str, Any]:
    video = _get_video(session, video_id)
    entry = ensure_entry(session, video)
    data = entry_dict(entry, video)
    return {
        "validation": validate_service.validate(data),
        "derived": derive.compute(data)["values"],
    }


class PreviewIn(BaseModel):
    values: dict[str, Any] = {}


@router.post("/preview/derive")
def preview_derive(body: PreviewIn) -> dict[str, Any]:
    """Tính thử derived cho một bộ giá trị bất kỳ (không đụng DB)."""
    result = derive.compute(body.values)
    return {
        "derived": result["values"],
        "meta": result["meta"],
        "suggestions": result["suggestions"],
        "qc_reasons": result["qc_reasons"],
        "validation": validate_service.validate(body.values),
    }


@router.post("/{video_id}/reset")
def reset_entry(video_id: str,
                session: Session = Depends(get_session)) -> dict[str, Any]:
    """Xoá toàn bộ giá trị coder đã nhập cho video này, giữ lại metadata."""
    video = _get_video(session, video_id)
    entry = session.exec(
        select(CodingEntry).where(CodingEntry.video_id == video_id)
    ).first()
    if entry is not None:
        session.delete(entry)
        session.commit()
    entry = ensure_entry(session, video)
    return payload(entry, video)
