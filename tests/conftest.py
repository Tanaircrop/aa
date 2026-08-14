"""Cấu hình chung cho test — chạy TRƯỚC khi bất kỳ test module nào được import.

Đây là chỗ duy nhất đặt biến môi trường cho test. `backend.database` đọc
`TIKTOK_CODING_DB` ngay lúc import để dựng engine, nên nếu đặt muộn hơn (trong
fixture chẳng hạn) thì engine đã trỏ vào `data.db` thật rồi.

Cách cũ là xoá `backend.*` khỏi `sys.modules` rồi import lại trong fixture, nhưng
import lại `backend.models` khiến SQLModel đăng ký trùng bảng trong cùng một
MetaData — test chỉ pass khi `test_api.py` tình cờ là file chạy đầu tiên. Đặt
env ở conftest thì không cần import lại gì cả.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

#: DB tạm cho cả phiên test, dọn cùng thư mục tạm của hệ điều hành.
TEST_DB = Path(tempfile.mkdtemp(prefix="tiktok-coding-test-")) / "test.db"

os.environ["TIKTOK_CODING_DB"] = str(TEST_DB)
os.environ["SESSION_SECRET"] = "secret-co-dinh-cho-test"
os.environ.pop("DATABASE_URL", None)   # luôn test trên SQLite tạm
os.environ.pop("DISABLE_AUTH", None)   # auth bật thật, như production
