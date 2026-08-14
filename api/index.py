"""Điểm vào cho Vercel Serverless Function.

Vercel gọi mọi request vào đây (xem `rewrites` trong `vercel.json`) và tự nhận
biến `app` là một ASGI app. Toàn bộ logic vẫn nằm trong `backend/` — file này
chỉ làm cầu nối và bảo đảm thư mục gốc dự án nằm trong `sys.path` (lambda chạy
với cwd khác nên `import backend...` sẽ fail nếu thiếu bước này).
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import app  # noqa: E402

__all__ = ["app"]
