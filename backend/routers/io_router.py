"""Import / export file Excel & CSV (mục 10.1, 10.2 của SPEC)."""

from __future__ import annotations

import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..columns import COLUMNS_BY_KEY
from ..database import get_session
from ..models import CodingEntry, IRREntry, Video
from ..services import excel_io
from ..services.importer import import_workbook

router = APIRouter(prefix="/api/io", tags=["io"])


def _coding_rows(session: Session) -> list[dict[str, Any]]:
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    entries = session.exec(select(CodingEntry)).all()

    rows = []
    for video in sorted(videos.values(),
                        key=lambda v: (v.stt is None, v.stt, v.id)):
        entry = next((e for e in entries if e.video_id == video.video_id), None)
        row: dict[str, Any] = {"stt": video.stt}
        for key in COLUMNS_BY_KEY:
            if key == "stt":
                continue
            row[key] = getattr(entry, key, None) if entry else None
        if entry is None:
            row.update({"video_id": video.video_id, "url": video.url,
                        "upload_date": video.upload_date,
                        "account_handle": video.account_handle})
        rows.append(row)
    return rows


def _irr_rows(session: Session) -> list[dict[str, Any]]:
    videos = {v.video_id: v for v in session.exec(select(Video)).all()}
    entries = session.exec(select(IRREntry)).all()
    entries.sort(key=lambda e: (videos[e.video_id].stt
                                if e.video_id in videos
                                and videos[e.video_id].stt is not None else 10**9,
                                e.role))
    rows = []
    for entry in entries:
        row = {key: getattr(entry, key, None) for key in COLUMNS_BY_KEY}
        video = videos.get(entry.video_id)
        row["stt"] = video.stt if video else None
        row["role"] = entry.role
        row["diff_notes"] = entry.diff_notes
        rows.append(row)
    return rows


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M")


@router.get("/export/coding.xlsx")
def export_coding(session: Session = Depends(get_session)) -> Response:
    content = excel_io.export_workbook(_coding_rows(session))
    return Response(
        content=content,
        media_type=("application/vnd.openxmlformats-officedocument."
                    "spreadsheetml.sheet"),
        headers={"Content-Disposition":
                 f'attachment; filename="3_Coding_Sheet_{_stamp()}.xlsx"'},
    )


@router.get("/export/full.xlsx")
def export_full(session: Session = Depends(get_session)) -> Response:
    content = excel_io.export_workbook(_coding_rows(session), _irr_rows(session))
    return Response(
        content=content,
        media_type=("application/vnd.openxmlformats-officedocument."
                    "spreadsheetml.sheet"),
        headers={"Content-Disposition":
                 f'attachment; filename="TikTok_Coding_full_{_stamp()}.xlsx"'},
    )


@router.get("/export/coding.csv")
def export_csv(session: Session = Depends(get_session)) -> Response:
    csv_text = excel_io.rows_to_csv(_coding_rows(session))
    return Response(
        content=csv_text.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f'attachment; filename="3_Coding_Sheet_{_stamp()}.csv"'},
    )


class ImportPathIn(BaseModel):
    path: str
    include_coding: bool = True


@router.post("/import/path")
def import_from_path(body: ImportPathIn,
                     session: Session = Depends(get_session)) -> dict[str, Any]:
    path = Path(body.path).expanduser()
    if not path.exists():
        raise HTTPException(404, f"Không tìm thấy file: {path}")
    return import_workbook(session, path, include_coding=body.include_coding)


@router.post("/import/upload")
async def import_from_upload(file: UploadFile = File(...),
                             include_coding: bool = True,
                             session: Session = Depends(get_session)
                             ) -> dict[str, Any]:
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Chỉ nhận file .xlsx / .xlsm")
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        return import_workbook(session, tmp_path, include_coding=include_coding)
    finally:
        tmp_path.unlink(missing_ok=True)


@router.get("/import/preview")
def preview_source(path: str, session: Session = Depends(get_session)
                   ) -> dict[str, Any]:
    """Xem trước file nguồn có những sheet nào, mỗi sheet bao nhiêu dòng."""
    src = Path(path).expanduser()
    if not src.exists():
        raise HTTPException(404, f"Không tìm thấy file: {src}")
    out: dict[str, Any] = {}
    for sheet in (excel_io.SHEET_ACCOUNTS, excel_io.SHEET_QUEUE,
                  excel_io.SHEET_CODING, excel_io.SHEET_IRR,
                  excel_io.SHEET_GUIDE):
        rows = excel_io.read_sheet(src, sheet)
        out[sheet] = {"rows": len(rows),
                      "sample_keys": sorted(rows[0].keys()) if rows else []}
    return {"path": str(src), "sheets": out}
