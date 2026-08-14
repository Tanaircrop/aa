#!/usr/bin/env python3
"""Nạp file Excel gốc vào SQLite.

Cách dùng:

    python seed/import_seed.py seed/TikTok_Fashion_Research_Sheet_v2.xlsx

Chạy lại nhiều lần được (idempotent, match theo Video_ID): dòng đã có thì update,
dòng mới thì thêm. Ô trống trong file nguồn KHÔNG xoá dữ liệu đã nhập trong app.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session  # noqa: E402

from backend.database import db_label, engine, init_db  # noqa: E402
from backend.services.importer import import_workbook  # noqa: E402

DEFAULT_FILE = Path(__file__).resolve().parent / "TikTok_Fashion_Research_Sheet_v2.xlsx"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=str(DEFAULT_FILE),
                        help="Đường dẫn file .xlsx gốc")
    parser.add_argument("--skip-coding", action="store_true",
                        help="Chỉ nạp Account_List + Video_Queue, bỏ dữ liệu coding")
    args = parser.parse_args()

    path = Path(args.path).expanduser()
    if not path.exists():
        print(f"Không tìm thấy file: {path}", file=sys.stderr)
        print("\nĐặt file gốc vào thư mục seed/ rồi chạy lại, hoặc tạo dữ liệu "
              "demo để thử app:\n    python seed/make_demo_xlsx.py",
              file=sys.stderr)
        return 1

    init_db()
    with Session(engine) as session:
        report = import_workbook(session, path,
                                 include_coding=not args.skip_coding)

    print(f"Đã nạp vào {db_label()}\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
