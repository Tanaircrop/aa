"""Kết nối database + helper session.

Chạy được trên hai nền:

- **Local**: không set gì cả -> SQLite file `data.db` (WAL, autosave nhanh).
- **Vercel / production**: set `DATABASE_URL` trỏ vào Postgres.

Serverless không giữ được file nên SQLite *không* dùng được trên Vercel — phần
`_is_sqlite` bên dưới quyết định pragma và pooling theo đúng nền đang chạy.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import event
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data.db"


def _normalize(url: str) -> str:
    """Đưa connection string về dạng SQLAlchemy hiểu được.

    Vercel/Heroku phát ra `postgres://`, còn SQLAlchemy 2.x chỉ nhận
    `postgresql://`. Ghim luôn driver `psycopg` (v3) để khỏi phụ thuộc
    `psycopg2` — nếu không ghim, SQLAlchemy mặc định tìm psycopg2 và fail.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _resolve_url() -> tuple[str, bool]:
    """-> (url, is_sqlite). `DATABASE_URL` thắng, không có thì về SQLite local."""
    raw = os.environ.get("DATABASE_URL", "").strip()
    if raw:
        url = _normalize(raw)
        return url, url.startswith("sqlite")
    path = Path(os.environ.get("TIKTOK_CODING_DB", DEFAULT_DB_PATH))
    return f"sqlite:///{path}", True


DATABASE_URL, _is_sqlite = _resolve_url()
IS_SQLITE = _is_sqlite

#: Chỉ có ý nghĩa khi chạy SQLite — trang /api/health dùng để báo trạng thái.
DB_PATH = Path(DATABASE_URL[len("sqlite:///"):]) if _is_sqlite else None


def _make_engine():
    if _is_sqlite:
        return create_engine(
            DATABASE_URL,
            echo=False,
            connect_args={"check_same_thread": False},
        )
    # Postgres trên serverless: mỗi lambda là một process sống ngắn, giữ pool
    # chỉ tổ ăn hết connection limit của Postgres. NullPool = mở/đóng theo
    # request, để việc gộp connection cho pooler phía Vercel/Neon lo.
    return create_engine(
        DATABASE_URL,
        echo=False,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10},
    )


engine = _make_engine()


if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:
        """WAL + foreign keys: autosave từng phím vẫn nhanh và an toàn."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def mask_url(url: str) -> str:
    """Che phần `user:password@` trong connection string.

    Hàm thuần, không đụng tới state của module — nhờ vậy test được mà không
    phải `importlib.reload` (reload thay engine toàn cục và làm hỏng những
    test chạy sau).
    """
    if url.startswith("sqlite"):
        return url
    import re

    return re.sub(r"//[^@/]*@", "//***@", url)


def db_label() -> str:
    """Mô tả DB an toàn để in ra log / trả về /api/health (giấu mật khẩu)."""
    if _is_sqlite:
        return f"sqlite: {DB_PATH}"
    return "postgres: " + mask_url(DATABASE_URL)


def init_db() -> None:
    from . import models  # noqa: F401  (đăng ký bảng trước khi create_all)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
