"""Đăng nhập theo từng coder (C1 / C2).

Chỉ dùng thư viện chuẩn — không kéo thêm `passlib`/`itsdangerous` để giữ
`requirements.txt` mỏng, deploy serverless nhanh:

- Mật khẩu băm bằng PBKDF2-HMAC-SHA256, salt ngẫu nhiên mỗi tài khoản.
- Phiên đăng nhập là **cookie ký HMAC**, không lưu session server-side (lambda
  không có bộ nhớ chung giữa các lần gọi nên session in-memory là vô nghĩa).

Cookie chứa `coder_id|hạn|chữ ký` — sửa tay thì chữ ký sai, đổi `SESSION_SECRET`
thì mọi phiên cũ hết hiệu lực ngay.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from ..database import get_session
from ..models import Coder

COOKIE_NAME = "tfc_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 ngày — nhập liệu kéo dài nhiều tuần

PBKDF2_ROUNDS = 240_000


# --------------------------------------------------------------- mật khẩu

def hash_password(password: str) -> str:
    """-> `pbkdf2_sha256$<rounds>$<salt_b64>$<hash_b64>`."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return "$".join([
        "pbkdf2_sha256",
        str(PBKDF2_ROUNDS),
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    ])


def verify_password(password: str, stored: str) -> bool:
    """So khớp bằng `compare_digest` để không rò rỉ thông tin qua thời gian chạy."""
    if not stored:
        return False
    try:
        scheme, rounds, salt_b64, hash_b64 = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.b64decode(salt_b64), int(rounds)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# ------------------------------------------------------------ cookie phiên

def _secret() -> str:
    """Khoá ký cookie.

    Trên Vercel phải set `SESSION_SECRET`. Ở local, thiếu thì sinh tạm một
    khoá ngẫu nhiên theo tiến trình — chạy dev vẫn được, nhưng restart là phải
    đăng nhập lại (và cố ý như vậy, để không ai vô tình dùng khoá mặc định
    trên production).
    """
    secret = os.environ.get("SESSION_SECRET", "").strip()
    if secret:
        return secret
    global _EPHEMERAL_SECRET
    if _EPHEMERAL_SECRET is None:
        _EPHEMERAL_SECRET = secrets.token_hex(32)
    return _EPHEMERAL_SECRET


_EPHEMERAL_SECRET: Optional[str] = None


def _sign(payload: str) -> str:
    return hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_token(coder_id: str, max_age: int = SESSION_MAX_AGE) -> str:
    payload = f"{coder_id}|{int(time.time()) + max_age}"
    return f"{payload}|{_sign(payload)}"


def read_token(token: str) -> Optional[str]:
    """-> coder_id nếu chữ ký đúng và chưa hết hạn, ngược lại None."""
    try:
        coder_id, expires, signature = token.rsplit("|", 2)
    except ValueError:
        return None
    if not hmac.compare_digest(_sign(f"{coder_id}|{expires}"), signature):
        return None
    try:
        if int(expires) < time.time():
            return None
    except ValueError:
        return None
    return coder_id


# ------------------------------------------------------------- dependency

def _lookup(session: Session, coder_id: str) -> Optional[Coder]:
    return session.exec(
        select(Coder).where(Coder.coder_id == coder_id, Coder.active == True)  # noqa: E712
    ).first()


def auth_enabled() -> bool:
    """Tắt auth bằng `DISABLE_AUTH=1` — chỉ để chạy test và dev local."""
    return os.environ.get("DISABLE_AUTH", "").strip() not in ("1", "true", "True")


def current_coder(request: Request,
                  session: Session = Depends(get_session)) -> Coder:
    """Bắt buộc đăng nhập. 401 kèm cờ để frontend biết đường chuyển sang login."""
    if not auth_enabled():
        return Coder(coder_id="C1", name="Dev", active=True, is_admin=True)

    token = request.cookies.get(COOKIE_NAME, "")
    coder_id = read_token(token) if token else None
    if not coder_id:
        raise HTTPException(401, "Chưa đăng nhập")
    coder = _lookup(session, coder_id)
    if coder is None:
        raise HTTPException(401, "Tài khoản không còn hiệu lực")
    return coder


def optional_coder(request: Request,
                   session: Session = Depends(get_session)) -> Optional[Coder]:
    """Như trên nhưng không ném lỗi — dùng cho trang login."""
    if not auth_enabled():
        return Coder(coder_id="C1", name="Dev", active=True, is_admin=True)
    token = request.cookies.get(COOKIE_NAME, "")
    coder_id = read_token(token) if token else None
    return _lookup(session, coder_id) if coder_id else None
