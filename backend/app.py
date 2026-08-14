"""FastAPI entrypoint. Chạy: `python app.py` (ở thư mục gốc dự án)."""

from __future__ import annotations

import argparse
import os
import threading
import webbrowser
from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import DB_PATH, engine, init_db
from .routers import coding, dashboard, io_router, irr, meta, sync, videos
from .services.importer import seed_coders
from .services.quick_guide import seed_defaults

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND = PROJECT_ROOT / "frontend"


@asynccontextmanager
async def lifespan(_app: FastAPI):
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

app.include_router(meta.router)
app.include_router(videos.router)
app.include_router(coding.router)
app.include_router(dashboard.router)
app.include_router(irr.router)
app.include_router(io_router.router)
app.include_router(sync.router)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"ok": True, "db": str(DB_PATH), "db_exists": DB_PATH.exists()}


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse("/app/coding.html")


for _page in ("coding", "dashboard", "irr", "index"):
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
    print(f"  Database: {DB_PATH}\n")
    uvicorn.run("backend.app:app" if args.reload else app,
                host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
