"""Chế độ IRR Pilot (sheet `5_IRR_Pilot`).

Nguyên tắc chống bias: khi đang code với vai trò C1, API không bao giờ trả về
giá trị của C2 (và ngược lại). Chỉ màn hình "So sánh" — dùng khi cả hai đã code
xong một video — mới trả về song song hai cột.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from ..columns import COLUMNS_BY_KEY
from ..database import get_session
from ..models import Coder, IRREntry, Video
from ..services import derive
from ..services.auth import current_coder
from ..services.entries import (apply_patch, ensure_irr_entry, payload,
                                recompute, serialize, status_of)

router = APIRouter(prefix="/api/irr", tags=["irr"])

ROLES = ("C1", "C2")


def _rules() -> dict[str, Any]:
    return derive.load_config().get("irr", {})


def compare_fields() -> list[str]:
    fields = _rules().get("compare_fields", [])
    return [f for f in fields if f in COLUMNS_BY_KEY]


def scale_of(field: str) -> str:
    scales = _rules().get("scale_types", {})
    return scales.get(field, scales.get("_default", "nominal"))


def _check_role(role: str) -> str:
    role = role.upper()
    if role not in ROLES:
        raise HTTPException(400, f"role phải là một trong {ROLES}")
    return role


def _own_role(role: str, me: Coder) -> str:
    """Chỉ cho code đúng vai trò của tài khoản đang đăng nhập.

    Đây là chốt chống bias thật sự: trước đây vai trò là một dropdown trên
    giao diện, ai cũng đổi được nên C1 có thể vô tình (hoặc cố ý) mở bản code
    của C2. Buộc `role` khớp tài khoản thì hai lượt code mới thực sự độc lập.

    Tài khoản `is_admin` được miễn để còn sửa/gỡ rối dữ liệu khi cần.
    """
    role = _check_role(role)
    if me.is_admin:
        return role
    if me.coder_id not in ROLES:
        raise HTTPException(
            403, f"Tài khoản {me.coder_id} không tham gia IRR pilot")
    if role != me.coder_id:
        raise HTTPException(
            403,
            f"Bạn đang đăng nhập bằng {me.coder_id} nên chỉ code được vai trò "
            f"{me.coder_id}. Muốn code vai trò {role} thì đăng nhập bằng tài "
            f"khoản {role}.",
        )
    return role


def _pilot_videos(session: Session) -> list[Video]:
    return session.exec(
        select(Video).where(Video.in_irr_pilot).order_by(Video.stt, Video.id)
    ).all()


@router.get("/videos")
def list_pilot(role: Optional[str] = None, status: str = "all",
               me: Coder = Depends(current_coder),
               session: Session = Depends(get_session)) -> dict[str, Any]:
    """Danh sách 75 video pilot. Chỉ lộ trạng thái của `role` đang chọn."""
    if role:
        _own_role(role, me)
    videos = _pilot_videos(session)
    entries: dict[tuple[str, str], IRREntry] = {
        (e.video_id, e.role): e for e in session.exec(select(IRREntry)).all()
    }

    rows = []
    for video in videos:
        row: dict[str, Any] = {
            "video_id": video.video_id,
            "stt": video.stt,
            "account_handle": video.account_handle,
            "url": video.url,
        }
        done = {r: bool(entries.get((video.video_id, r), None)
                        and entries[(video.video_id, r)].completed) for r in ROLES}
        row["both_done"] = all(done.values())
        if role:
            r = _check_role(role)
            entry = entries.get((video.video_id, r))
            row["status"] = status_of(entry) if entry else "not_started"
        else:
            # Không chọn role: chỉ hiện tiến độ tổng, không lộ giá trị.
            row["status"] = "ok" if row["both_done"] else "not_started"
            row["done_by"] = [r for r in ROLES if done[r]]
        rows.append(row)

    if status != "all":
        rows = [r for r in rows if r["status"] == status]

    total = len(videos)
    return {
        "videos": rows,
        "counts": {
            "total": total,
            "c1_done": sum(1 for v in videos
                           if (e := entries.get((v.video_id, "C1"))) and e.completed),
            "c2_done": sum(1 for v in videos
                           if (e := entries.get((v.video_id, "C2"))) and e.completed),
            "both_done": sum(1 for v in videos
                             if all((e := entries.get((v.video_id, r))) and e.completed
                                    for r in ROLES)),
        },
    }


def _values_equal(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    try:
        return abs(float(a) - float(b)) < 1e-9
    except (TypeError, ValueError):
        return str(a).strip() == str(b).strip()


@router.get("/compare/{video_id}")
def compare(video_id: str,
            session: Session = Depends(get_session)) -> dict[str, Any]:
    """Màn hình so sánh C1 vs C2 — chỉ mở khi cả hai đã code xong."""
    entries = {
        e.role: e for e in session.exec(
            select(IRREntry).where(IRREntry.video_id == video_id)
        ).all()
    }
    c1, c2 = entries.get("C1"), entries.get("C2")
    if not (c1 and c1.completed) or not (c2 and c2.completed):
        raise HTTPException(
            409,
            "Chưa mở được so sánh: cần cả C1 và C2 code xong video này trước.",
        )

    rows = []
    agree = 0
    for key in compare_fields():
        v1, v2 = getattr(c1, key, None), getattr(c2, key, None)
        same = _values_equal(v1, v2)
        agree += int(same)
        col = COLUMNS_BY_KEY[key]
        labels = {str(k): v for k, v in col.option_labels.items()}
        rows.append({
            "field": key,
            "label": col.excel,
            "scale": scale_of(key),
            "c1": serialize(v1),
            "c2": serialize(v2),
            "c1_label": labels.get(str(v1)),
            "c2_label": labels.get(str(v2)),
            "agree": same,
        })

    total = len(rows)
    return {
        "video_id": video_id,
        "rows": rows,
        "agreement": {"agree": agree, "total": total,
                      "percent": round(agree / total * 100, 1) if total else 0.0},
        "diff_notes": c1.diff_notes or c2.diff_notes or "",
    }


class DiffNoteIn(BaseModel):
    diff_notes: str = ""


@router.put("/compare/{video_id}/notes")
def save_diff_notes(video_id: str, body: DiffNoteIn,
                    session: Session = Depends(get_session)) -> dict[str, Any]:
    entries = session.exec(
        select(IRREntry).where(IRREntry.video_id == video_id)
    ).all()
    if not entries:
        raise HTTPException(404, "Chưa có dữ liệu IRR cho video này")
    for entry in entries:
        entry.diff_notes = body.diff_notes or None
        session.add(entry)
    session.commit()
    return {"ok": True}


@router.get("/agreement")
def agreement_overview(session: Session = Depends(get_session)) -> dict[str, Any]:
    """% đồng thuận đơn giản theo từng biến (KHÔNG phải Krippendorff's alpha)."""
    entries: dict[tuple[str, str], IRREntry] = {
        (e.video_id, e.role): e for e in session.exec(select(IRREntry)).all()
    }
    video_ids = sorted({vid for vid, _ in entries})
    pairs = [(entries.get((v, "C1")), entries.get((v, "C2"))) for v in video_ids]
    pairs = [(a, b) for a, b in pairs if a and b and a.completed and b.completed]

    rows = []
    for key in compare_fields():
        agree = sum(1 for a, b in pairs
                    if _values_equal(getattr(a, key, None), getattr(b, key, None)))
        rows.append({
            "field": key,
            "label": COLUMNS_BY_KEY[key].excel,
            "scale": scale_of(key),
            "n": len(pairs),
            "agree": agree,
            "percent": round(agree / len(pairs) * 100, 1) if pairs else None,
        })
    rows.sort(key=lambda r: (r["percent"] is None, r["percent"]))
    return {
        "n_double_coded": len(pairs),
        "fields": rows,
        "note": ("Đây là % đồng thuận thô để xem nhanh. Krippendorff's alpha vẫn "
                 "nên tính bằng R (irr) hoặc Python (krippendorff) từ file CSV xuất ra."),
    }


@router.get("/export/matrix.csv")
def export_matrix(session: Session = Depends(get_session)) -> StreamingResponse:
    """Ma trận IRR dạng wide: mỗi biến 2 cột `<field>_C1`, `<field>_C2`."""
    entries: dict[tuple[str, str], IRREntry] = {
        (e.video_id, e.role): e for e in session.exec(select(IRREntry)).all()
    }
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    video_ids = sorted({vid for vid, _ in entries},
                       key=lambda v: (videos[v].stt if v in videos
                                      and videos[v].stt is not None else 10**9, v))

    fields = compare_fields()
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["STT", "Video_ID"]
                    + [f"{f}_{r}" for f in fields for r in ROLES]
                    + ["diff_notes"])
    # Dòng 2: loại thang đo, để R/Python đọc và gán scale đúng.
    writer.writerow(["", "scale_type"]
                    + [scale_of(f) for f in fields for _ in ROLES] + [""])

    for video_id in video_ids:
        c1, c2 = entries.get((video_id, "C1")), entries.get((video_id, "C2"))
        video = videos.get(video_id)
        row: list[Any] = [video.stt if video else "", video_id]
        for field in fields:
            for entry in (c1, c2):
                value = getattr(entry, field, None) if entry else None
                row.append("" if value is None else serialize(value))
        row.append((c1.diff_notes if c1 else None) or
                   (c2.diff_notes if c2 else None) or "")
        writer.writerow(row)

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 'attachment; filename="irr_matrix_wide.csv"'},
    )


@router.get("/export/long.csv")
def export_long(session: Session = Depends(get_session)) -> StreamingResponse:
    """Dạng long (unit, coder, variable, value) cho package krippendorff của Python."""
    entries = session.exec(select(IRREntry)).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["unit", "coder", "variable", "scale_type", "value"])
    for entry in entries:
        for field in compare_fields():
            value = getattr(entry, field, None)
            writer.writerow([entry.video_id, entry.role, field, scale_of(field),
                             "" if value is None else serialize(value)])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="irr_long.csv"'},
    )


@router.post("/pilot/select")
def select_pilot(n: int = Query(75, ge=1), every: Optional[int] = None,
                 session: Session = Depends(get_session)) -> dict[str, Any]:
    """Đánh dấu N video vào pilot bằng cách lấy mẫu hệ thống (systematic)."""
    videos = session.exec(select(Video).order_by(Video.stt, Video.id)).all()
    if not videos:
        raise HTTPException(400, "Chưa có video nào trong hàng đợi")
    step = every or max(len(videos) // n, 1)
    chosen = videos[::step][:n]
    chosen_ids = {v.video_id for v in chosen}
    for video in videos:
        video.in_irr_pilot = video.video_id in chosen_ids
        session.add(video)
    session.commit()
    return {"ok": True, "selected": len(chosen_ids), "step": step}


# Các route có path cố định phải khai báo TRƯỚC `/{role}/{video_id}`,
# nếu không "compare", "export", "pilot" sẽ bị nuốt thành giá trị của {role}.
@router.get("/{role}/{video_id}")
def get_irr_entry(role: str, video_id: str,
                  me: Coder = Depends(current_coder),
                  session: Session = Depends(get_session)) -> dict[str, Any]:
    role = _own_role(role, me)
    video = session.exec(select(Video).where(Video.video_id == video_id)).first()
    if video is None:
        raise HTTPException(404, f"Không tìm thấy video {video_id}")
    if not video.in_irr_pilot:
        raise HTTPException(400, f"{video_id} không nằm trong danh sách IRR pilot")
    entry = ensure_irr_entry(session, video, role)
    return payload(entry, video)


class PatchIn(BaseModel):
    fields: dict[str, Any] = {}
    overrides: Optional[dict[str, Any]] = None
    diff_notes: Optional[str] = None


@router.patch("/{role}/{video_id}")
def patch_irr_entry(role: str, video_id: str, body: PatchIn,
                    me: Coder = Depends(current_coder),
                    session: Session = Depends(get_session)) -> dict[str, Any]:
    role = _own_role(role, me)
    video = session.exec(select(Video).where(Video.video_id == video_id)).first()
    if video is None:
        raise HTTPException(404, f"Không tìm thấy video {video_id}")
    entry = ensure_irr_entry(session, video, role)

    patch: dict[str, Any] = dict(body.fields)
    if body.overrides is not None:
        patch["overrides"] = body.overrides
    if body.diff_notes is not None:
        patch["diff_notes"] = body.diff_notes

    rejected = apply_patch(entry, patch)
    entry.coder_id = role
    recompute(entry)
    session.add(entry)
    session.commit()
    session.refresh(entry)

    result = payload(entry, video)
    result["rejected_fields"] = rejected
    return result
