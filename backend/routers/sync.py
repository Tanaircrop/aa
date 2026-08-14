"""Route đồng bộ Google Sheets (Phase 6). Luôn có bước diff trước khi ghi."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..models import AppSetting
from ..services import sheets_sync

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _guard(fn, *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except sheets_sync.SyncNotConfigured as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # lỗi mạng / quyền truy cập Sheets
        raise HTTPException(502, f"Lỗi khi gọi Google Sheets: {exc}") from exc


class ConfigIn(BaseModel):
    credentials_path: str = ""
    spreadsheet: str = ""
    worksheet: str = sheets_sync.DEFAULT_WORKSHEET


@router.get("/config")
def get_config(session: Session = Depends(get_session)) -> dict[str, Any]:
    config = sheets_sync.get_settings(session)
    config["configured"] = bool(config["credentials_path"] and config["spreadsheet"])
    try:
        import gspread  # noqa: F401,PLC0415
        config["library_installed"] = True
    except ImportError:
        config["library_installed"] = False
    return config


@router.put("/config")
def put_config(body: ConfigIn,
               session: Session = Depends(get_session)) -> dict[str, Any]:
    mapping = {
        sheets_sync.SETTING_CREDENTIALS: body.credentials_path,
        sheets_sync.SETTING_SPREADSHEET: body.spreadsheet,
        sheets_sync.SETTING_WORKSHEET: body.worksheet,
    }
    for key, value in mapping.items():
        setting = session.get(AppSetting, key)
        if setting is None:
            setting = AppSetting(key=key, value=value)
        else:
            setting.value = value
        session.add(setting)
    session.commit()
    return get_config(session)


@router.get("/pull/preview")
def pull_preview(session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(sheets_sync.pull_preview, session)


class ApplyIn(BaseModel):
    video_ids: Optional[list[str]] = None


@router.post("/pull/apply")
def pull_apply(body: ApplyIn,
               session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(sheets_sync.pull_apply, session, body.video_ids)


@router.get("/push/preview")
def push_preview(session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(sheets_sync.push_preview, session)


@router.post("/push/apply")
def push_apply(body: ApplyIn,
               session: Session = Depends(get_session)) -> dict[str, Any]:
    return _guard(sheets_sync.push_apply, session, body.video_ids)
