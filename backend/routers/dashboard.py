"""Dashboard: KPI, số liệu cho biểu đồ, data grid, sửa nhanh inline."""

from __future__ import annotations

from collections import Counter, defaultdict
from statistics import mean, median
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from ..columns import COLUMNS_BY_KEY
from ..database import get_session
from ..models import Account, CodingEntry, Video
from ..services.entries import apply_patch, payload, recompute, serialize, status_of

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

TARGET_TOTAL = 500


def _labels_for(key: str) -> dict[str, str]:
    col = COLUMNS_BY_KEY[key]
    return {str(k): v for k, v in col.option_labels.items()}


def _distribution(entries: list[CodingEntry], key: str) -> dict[str, Any]:
    counter: Counter[str] = Counter()
    for entry in entries:
        value = getattr(entry, key, None)
        if value is None:
            continue
        counter[str(value)] += 1
    col = COLUMNS_BY_KEY[key]
    order = [str(o) for o in col.options] or sorted(counter)
    for extra in sorted(counter):
        if extra not in order:
            order.append(extra)
    labels = _labels_for(key)
    return {
        "field": key,
        "title": col.excel,
        "categories": order,
        "labels": [labels.get(o, o) for o in order],
        "values": [counter.get(o, 0) for o in order],
    }


@router.get("/summary")
def summary(session: Session = Depends(get_session)) -> dict[str, Any]:
    videos = session.exec(select(Video)).all()
    entries = session.exec(select(CodingEntry)).all()
    accounts = {a.handle: a for a in session.exec(select(Account)).all()}

    coded = [e for e in entries if e.completed]
    started = [e for e in entries if e.started and not e.completed]
    target = max(TARGET_TOTAL, len(videos)) if videos else TARGET_TOTAL

    qc_ok = sum(1 for e in coded if (e.qc_status or "").upper() == "OK")
    qc_check = sum(1 for e in coded if (e.qc_status or "").upper() == "CHECK")

    by_coder: Counter[str] = Counter()
    for e in coded:
        by_coder[e.coder_id or "(chưa gán)"] += 1

    by_account_type: Counter[str] = Counter()
    for e in coded:
        by_account_type[str(e.account_type) if e.account_type else "(trống)"] += 1

    by_day: dict[str, int] = defaultdict(int)
    for e in coded:
        if e.coding_date:
            by_day[e.coding_date.isoformat()] += 1
    days = sorted(by_day)

    return {
        "target": target,
        "queue_total": len(videos),
        "coded": len(coded),
        "in_progress": len(started),
        "remaining": max(target - len(coded), 0),
        "percent": round(len(coded) / target * 100, 1) if target else 0.0,
        "qc": {
            "ok": qc_ok,
            "check": qc_check,
            "ok_pct": round(qc_ok / len(coded) * 100, 1) if coded else 0.0,
            "check_pct": round(qc_check / len(coded) * 100, 1) if coded else 0.0,
        },
        "by_coder": [{"label": k, "value": v} for k, v in sorted(by_coder.items())],
        "by_account_type": [
            {"label": _labels_for("account_type").get(k, k), "value": v}
            for k, v in sorted(by_account_type.items())
        ],
        "flagged": sum(1 for e in entries if e.flagged_for_review),
        "timeline": {"labels": days, "values": [by_day[d] for d in days],
                     "cumulative": _cumulative([by_day[d] for d in days])},
        "accounts_known": len(accounts),
    }


def _cumulative(values: list[int]) -> list[int]:
    total, out = 0, []
    for v in values:
        total += v
        out.append(total)
    return out


@router.get("/charts")
def charts(session: Session = Depends(get_session)) -> dict[str, Any]:
    entries = [e for e in session.exec(select(CodingEntry)).all() if e.started]
    accounts = {a.handle: a for a in session.exec(select(Account)).all()}

    er_by_type: dict[str, list[float]] = defaultdict(list)
    er_by_tier: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        if e.er_view_core is None:
            continue
        label = _labels_for("account_type").get(str(e.account_type), "(trống)")
        er_by_type[label].append(e.er_view_core)
        account = accounts.get(e.account_handle or "")
        tier = (account.tier if account and account.tier else "(chưa có tier)")
        er_by_tier[tier].append(e.er_view_core)

    return {
        "y7": _distribution(entries, "y7_dominant_frame"),
        "y9": _distribution(entries, "y9_appeal"),
        "x1": _distribution(entries, "x1_commercial"),
        "x4band": _distribution(entries, "x4_intensity_band"),
        "x3": _distribution(entries, "x3_visibility_level"),
        "y8": _distribution(entries, "y8_cta"),
        "w1": _distribution(entries, "w1_ai_disclosure"),
        "er_by_account_type": _box_stats(er_by_type),
        "er_by_tier": _box_stats(er_by_tier),
    }


def _box_stats(groups: dict[str, list[float]]) -> dict[str, Any]:
    labels, means, medians, counts = [], [], [], []
    for label in sorted(groups):
        values = groups[label]
        if not values:
            continue
        labels.append(label)
        means.append(round(mean(values), 2))
        medians.append(round(median(values), 2))
        counts.append(len(values))
    return {"labels": labels, "mean": means, "median": medians, "count": counts}


@router.get("/needs-review")
def needs_review(session: Session = Depends(get_session)) -> list[dict[str, Any]]:
    """Bảng 'Videos cần review': QC = CHECK hoặc được đánh dấu tay."""
    from ..services import derive

    entries = session.exec(select(CodingEntry)).all()
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    out = []
    for entry in entries:
        if not entry.started:
            continue
        is_check = (entry.qc_status or "").upper() == "CHECK"
        if not (is_check or entry.flagged_for_review):
            continue
        data = {c: getattr(entry, c, None) for c in COLUMNS_BY_KEY}
        data["overrides"] = entry.overrides or {}
        result = derive.compute(data)
        video = videos.get(entry.video_id)
        out.append({
            "video_id": entry.video_id,
            "stt": video.stt if video else None,
            "account_handle": entry.account_handle,
            "coder_id": entry.coder_id,
            "qc_status": entry.qc_status,
            "flagged": entry.flagged_for_review,
            "reasons": result["qc_reasons"],
            "missing": [COLUMNS_BY_KEY[k].excel for k in result["missing_required"]],
        })
    out.sort(key=lambda r: (r["stt"] is None, r["stt"]))
    return out


@router.get("/grid")
def grid(limit: int = 1000, offset: int = 0, status: Optional[str] = None,
         session: Session = Depends(get_session)) -> dict[str, Any]:
    """Data grid dạng spreadsheet cho toàn bộ 47 cột."""
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    entries = session.exec(select(CodingEntry)).all()
    entries.sort(key=lambda e: (videos[e.video_id].stt
                                if e.video_id in videos
                                and videos[e.video_id].stt is not None else 10**9))
    rows = []
    for entry in entries:
        state = status_of(entry)
        if status and status != "all" and state != status:
            continue
        video = videos.get(entry.video_id)
        row = {k: serialize(getattr(entry, k, None)) for k in COLUMNS_BY_KEY}
        row["stt"] = video.stt if video else None
        row["_status"] = state
        rows.append(row)
    return {"rows": rows[offset:offset + limit], "total": len(rows)}


class InlineEditIn(BaseModel):
    video_id: str
    field: str
    value: Any = None


@router.patch("/grid")
def inline_edit(body: InlineEditIn,
                session: Session = Depends(get_session)) -> dict[str, Any]:
    entry = session.exec(
        select(CodingEntry).where(CodingEntry.video_id == body.video_id)
    ).first()
    if entry is None:
        return {"ok": False, "error": f"Chưa có dòng coding cho {body.video_id}"}
    rejected = apply_patch(entry, {body.field: body.value})
    recompute(entry)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    video = session.exec(
        select(Video).where(Video.video_id == body.video_id)
    ).first()
    result = payload(entry, video)
    result["ok"] = not rejected
    result["rejected_fields"] = rejected
    return result
