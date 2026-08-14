"""FastAPI entrypoint. Chạy: `python app.py` (ở thư mục gốc dự án)."""

from __future__ import annotations

import argparse
import os
import threading
import webbrowser
from pathlib import Path

from contextlib import asynccontextmanager

from urllib.parse import quote

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import IS_SQLITE, db_label, engine, init_db
from .routers import (auth_router, coding, dashboard, io_router, irr, meta,
                      sync, videos)
from .services.auth import COOKIE_NAME, auth_enabled, current_coder, read_token
from .services.importer import seed_coders
from .services.quick_guide import seed_defaults

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND = PROJECT_ROOT / "frontend"

#: Trên serverless, mỗi cold start đều gọi lifespan. `create_all` là idempotent
#: nhưng vẫn tốn round-trip tới Postgres, nên production bootstrap một lần bằng
#: `seed/bootstrap_remote.py` rồi set `SKIP_DB_INIT=1`.
SKIP_DB_INIT = os.environ.get("SKIP_DB_INIT", "").strip() in ("1", "true", "True")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not SKIP_DB_INIT:
        init_db()
        with Session(engine) as session:
            seed_coders(session)
            seed_defaults(session)
    yield


app = FastAPI(
    title="TikTok Fashion Coding — App nhập liệu local",
    description="Nhập liệu Codebook v4 (47 cột) cho 500 video, lưu SQLite local.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth_router.router)

# Mọi router dữ liệu đều yêu cầu đăng nhập. Gắn ở đây thay vì rải `Depends`
# trong từng endpoint để không bao giờ có route mới nào lọt ra ngoài vì quên.
_protected = [meta.router, videos.router, coding.router, dashboard.router,
              irr.router, io_router.router, sync.router]
for _router in _protected:
    app.include_router(_router, dependencies=[Depends(current_coder)])


@app.get("/api/health")
def health() -> dict[str, object]:
    """Công khai (không cần đăng nhập) để Vercel/uptime check ping được."""
    return {"ok": True, "db": db_label(), "sqlite": IS_SQLITE}


#: Trang xem được khi chưa đăng nhập. CSS/JS vẫn mở vì trang login cần chúng —
#: và bản thân file tĩnh không chứa dữ liệu nghiên cứu nào.
PUBLIC_PAGES = {"/app/login.html", "/login"}


@app.middleware("http")
async def redirect_pages_to_login(request: Request, call_next):
    """Chưa đăng nhập mà mở thẳng một trang -> đá về login.

    API đã được `Depends(current_coder)` chặn rồi; middleware này chỉ lo phần
    điều hướng trình duyệt, để người dùng thấy màn login thay vì một trang
    trống toàn lỗi 401.
    """
    path = request.url.path
    is_page = path in ("/",) or (path.startswith("/app/") and path.endswith(".html"))
    if is_page and path not in PUBLIC_PAGES and auth_enabled():
        token = request.cookies.get(COOKIE_NAME, "")
        if not (token and read_token(token)):
            target = "/app/login.html"
            if path not in ("/", "/app/coding.html"):
                target += f"?next={quote(path, safe='')}"
            return RedirectResponse(target, status_code=302)
    return await call_next(request)


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse("/app/coding.html")


for _page in ("coding", "dashboard", "irr", "index", "login"):
    def _make(page: str):
        def _serve() -> FileResponse:
            return FileResponse(FRONTEND / f"{page}.html")
        return _serve
    app.get(f"/{_page}", include_in_schema=False)(_make(_page))

app.mount("/app", StaticFiles(directory=FRONTEND, html=True), name="app")


def main() -> None:
    import uvicorn

    parser = argparse.ArgumentParser(description="TikTok Fashion Coding app")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true",
                        help="Không tự mở trình duyệt")
    parser.add_argument("--reload", action="store_true", help="Chế độ dev")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}/app/coding.html"
    if not args.no_browser and not os.environ.get("TIKTOK_CODING_NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    print(f"\n  TikTok Fashion Coding — mở tại: {url}")
    print(f"  Database: {db_label()}\n")
    uvicorn.run("backend.app:app" if args.reload else app,
                host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
