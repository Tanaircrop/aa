"""Kiểm tra những thứ chỉ hỏng khi deploy — nơi test thường không với tới.

Sai một trong các chỗ này thì app chạy ngon ở local nhưng chết trên Vercel,
nên tách riêng ra để kiểm tra không cần dựng database thật.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ------------------------------------------------- connection string

@pytest.mark.parametrize("raw, expected", [
    # Vercel/Heroku phát ra `postgres://` — SQLAlchemy 2.x không nhận dạng này.
    ("postgres://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    ("postgresql://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
    # Đã ghim driver rồi thì để nguyên, không ghim chồng.
    ("postgresql+psycopg://u:p@host/db", "postgresql+psycopg://u:p@host/db"),
])
def test_postgres_url_is_normalized(raw, expected):
    from backend.database import _normalize

    assert _normalize(raw) == expected


def test_sqlite_url_untouched():
    from backend.database import _normalize

    assert _normalize("sqlite:///data.db") == "sqlite:///data.db"


def test_masked_url_hides_password_but_keeps_host():
    """`/api/health` và log không được để lộ mật khẩu database."""
    from backend.database import _normalize, mask_url

    masked = mask_url(_normalize(
        "postgres://user:sieu-bi-mat@db.vercel.com:5432/verceldb"))
    assert "sieu-bi-mat" not in masked
    assert "user" not in masked
    assert "db.vercel.com" in masked     # vẫn đủ để nhận ra đang nối vào DB nào
    assert mask_url("sqlite:///data.db") == "sqlite:///data.db"


# -------------------------------------------------------- cấu hình Vercel

def test_vercel_json_is_valid_and_routes_everything_to_the_app():
    config = json.loads((ROOT / "vercel.json").read_text())
    fn = config["functions"]["api/index.py"]

    # `runtime` phải vắng mặt: chuỗi kiểu "python3.12" bị Vercel từ chối,
    # còn để trống thì runtime Python mặc định tự nhận file trong api/.
    assert "runtime" not in fn

    # Thiếu includeFiles thì lambda không có frontend/ lẫn rules_config.json.
    assert "frontend" in fn["includeFiles"]
    assert "backend" in fn["includeFiles"]

    assert config["rewrites"] == [{"source": "/(.*)", "destination": "/api/index"}]


def test_api_entrypoint_exposes_asgi_app():
    from api.index import app

    assert hasattr(app, "router")


def test_vercelignore_keeps_research_data_out_of_the_bundle():
    ignored = (ROOT / ".vercelignore").read_text().split()
    assert "data.db" in ignored
    assert "seed/*.xlsx" in ignored


def test_requirements_include_postgres_driver():
    text = (ROOT / "requirements.txt").read_text()
    assert "psycopg" in text
