"""Metadata cho frontend: schema 47 cột, quick guide, danh sách coder, cấu hình."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..columns import GROUP_TITLES, TAB_ORDER, column_schema
from ..database import get_session
from ..models import AppSetting, Coder
from ..services import derive
from ..services.quick_guide import as_map

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/schema")
def get_schema(session: Session = Depends(get_session)) -> dict[str, Any]:
    config = derive.load_config()
    coders = session.exec(select(Coder).where(Coder.active)).all()
    return {
        "columns": column_schema(),
        "groups": GROUP_TITLES,
        "tab_order": TAB_ORDER,
        "quick_guide": as_map(session),
        "coders": [{"coder_id": c.coder_id, "name": c.name} for c in coders],
        "rules_version": config.get("version"),
        "rules_meta": {
            key: {
                "kind": rule.get("kind"),
                "confirmed": bool(rule.get("confirmed", False)),
                "source": rule.get("source", ""),
            }
            for key, rule in config.get("fields", {}).items()
        },
    }


@router.get("/settings")
def get_settings(session: Session = Depends(get_session)) -> dict[str, str]:
    return {s.key: s.value for s in session.exec(select(AppSetting)).all()}


class SettingIn(BaseModel):
    key: str
    value: str


@router.put("/settings")
def put_setting(payload: SettingIn,
                session: Session = Depends(get_session)) -> dict[str, str]:
    setting = session.get(AppSetting, payload.key)
    if setting is None:
        setting = AppSetting(key=payload.key, value=payload.value)
    else:
        setting.value = payload.value
    session.add(setting)
    session.commit()
    return {"key": setting.key, "value": setting.value}


class CoderIn(BaseModel):
    coder_id: str
    name: str = ""


@router.post("/coders")
def add_coder(payload: CoderIn,
              session: Session = Depends(get_session)) -> dict[str, Any]:
    coder_id = payload.coder_id.strip()
    if not coder_id:
        raise HTTPException(400, "coder_id trống")
    existing = session.exec(
        select(Coder).where(Coder.coder_id == coder_id)
    ).first()
    if existing:
        existing.name = payload.name or existing.name
        existing.active = True
        session.add(existing)
    else:
        session.add(Coder(coder_id=coder_id, name=payload.name))
    session.commit()
    return {"ok": True, "coder_id": coder_id}


@router.post("/rules/reload")
def reload_rules() -> dict[str, Any]:
    """Nạp lại rules_config.json sau khi sửa file, không cần restart server."""
    config = derive.load_config(force=True)
    return {"ok": True, "version": config.get("version")}
