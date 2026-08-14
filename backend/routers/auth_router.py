"""Đăng nhập / đăng xuất / xem phiên hiện tại."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..database import get_session
from ..models import Coder
from ..services.auth import (COOKIE_NAME, SESSION_MAX_AGE, auth_enabled,
                             current_coder, make_token, optional_coder,
                             verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    coder_id: str
    password: str


def _secure_cookies() -> bool:
    """Vercel luôn chạy HTTPS; local `http://127.0.0.1` thì cookie Secure sẽ bị
    trình duyệt bỏ qua, nên chỉ bật khi thực sự ở production."""
    return bool(os.environ.get("VERCEL") or os.environ.get("FORCE_HTTPS"))


@router.post("/login")
def login(body: LoginIn, response: Response,
          session: Session = Depends(get_session)) -> dict[str, object]:
    coder_id = body.coder_id.strip().upper()
    coder = session.exec(select(Coder).where(Coder.coder_id == coder_id)).first()

    # Cùng một thông báo cho "sai tên" và "sai mật khẩu" — không xác nhận giúp
    # người lạ rằng tài khoản nào có thật.
    if coder is None or not coder.active or not verify_password(
            body.password, coder.password_hash):
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")

    response.set_cookie(
        COOKIE_NAME,
        make_token(coder.coder_id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_secure_cookies(),
        path="/",
    )
    return {"coder_id": coder.coder_id, "name": coder.name,
            "is_admin": coder.is_admin}


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(coder: Coder | None = Depends(optional_coder)) -> dict[str, object]:
    """Frontend gọi lúc load trang để biết nên hiện app hay đá về login."""
    if coder is None:
        return {"authenticated": False, "auth_enabled": auth_enabled()}
    return {
        "authenticated": True,
        "auth_enabled": auth_enabled(),
        "coder_id": coder.coder_id,
        "name": coder.name,
        "is_admin": coder.is_admin,
    }


@router.get("/coders")
def coders(session: Session = Depends(get_session),
           _: Coder = Depends(current_coder)) -> list[dict[str, object]]:
    rows = session.exec(select(Coder).order_by(Coder.coder_id)).all()
    return [{"coder_id": c.coder_id, "name": c.name, "active": c.active}
            for c in rows]
