#!/usr/bin/env python3
"""Chuẩn bị database production (Postgres trên Vercel) từ máy local.

Serverless không phải chỗ để chạy migration hay nhập mật khẩu, nên mọi việc
thiết lập một lần đều làm từ đây — script kết nối thẳng tới Postgres qua
`DATABASE_URL` và làm đúng ba việc: tạo bảng, đặt mật khẩu coder, nạp dữ liệu.

Cách dùng (đặt DATABASE_URL trước, lấy từ Vercel → Storage → Postgres):

    export DATABASE_URL='postgres://...'          # Windows: set DATABASE_URL=...

    # 1. Tạo bảng + tài khoản C1/C2 (hỏi mật khẩu, không hiện lên màn hình)
    python seed/bootstrap_remote.py --init

    # 2. Nạp file gốc lên Postgres (idempotent, chạy lại bao nhiêu lần cũng được)
    python seed/bootstrap_remote.py --import-xlsx seed/TikTok_Fashion.xlsx

    # Đổi mật khẩu về sau
    python seed/bootstrap_remote.py --set-password C2

    # Xem đang có gì trên đó
    python seed/bootstrap_remote.py --status
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from backend.database import IS_SQLITE, db_label, engine, init_db  # noqa: E402
from backend.models import (Account, Coder, CodingEntry, IRREntry,  # noqa: E402
                            Video)
from backend.services.auth import hash_password  # noqa: E402
from backend.services.importer import import_workbook, seed_coders  # noqa: E402
from backend.services.quick_guide import seed_defaults  # noqa: E402

ROLES = ("C1", "C2")


def _warn_if_sqlite() -> None:
    """Nhắc khi quên `DATABASE_URL` — nếu không, script sẽ lặng lẽ sửa file
    SQLite local trong khi người dùng tưởng đang thao tác với production."""
    if IS_SQLITE:
        print("CẢNH BÁO: chưa đặt DATABASE_URL nên đang làm việc với SQLite "
              f"local ({db_label()}), KHÔNG phải database trên Vercel.\n",
              file=sys.stderr)


def _prompt_password(coder_id: str) -> str:
    while True:
        first = getpass.getpass(f"Mật khẩu mới cho {coder_id}: ")
        if len(first) < 8:
            print("  Mật khẩu cần ít nhất 8 ký tự.", file=sys.stderr)
            continue
        if first != getpass.getpass(f"Nhập lại mật khẩu cho {coder_id}: "):
            print("  Hai lần nhập không khớp, thử lại.", file=sys.stderr)
            continue
        return first


def cmd_init(args) -> int:
    init_db()
    with Session(engine) as session:
        added = seed_coders(session)
        guides = seed_defaults(session)
        print(f"Đã tạo bảng. Coder thêm mới: {added}. Quick guide: {guides}.")

        for coder_id in ROLES:
            coder = session.exec(
                select(Coder).where(Coder.coder_id == coder_id)).first()
            if coder is None:
                continue
            if coder.password_hash and not args.force:
                print(f"{coder_id} đã có mật khẩu — bỏ qua "
                      f"(dùng --set-password {coder_id} để đổi).")
                continue
            coder.password_hash = hash_password(_prompt_password(coder_id))
            session.add(coder)
        session.commit()
    print("\nXong. Nhớ đặt SESSION_SECRET và DATABASE_URL trong Vercel → Settings "
          "→ Environment Variables.")
    return 0


def cmd_set_password(coder_id: str) -> int:
    coder_id = coder_id.strip().upper()
    with Session(engine) as session:
        coder = session.exec(
            select(Coder).where(Coder.coder_id == coder_id)).first()
        if coder is None:
            print(f"Không có coder {coder_id}. Chạy --init trước.", file=sys.stderr)
            return 1
        coder.password_hash = hash_password(_prompt_password(coder_id))
        coder.active = True
        session.add(coder)
        session.commit()
    print(f"Đã đổi mật khẩu cho {coder_id}. Các phiên đang đăng nhập vẫn còn "
          "hiệu lực — muốn thu hồi hết thì đổi SESSION_SECRET trên Vercel.")
    return 0


def cmd_import(path_str: str, skip_coding: bool) -> int:
    path = Path(path_str).expanduser()
    if not path.exists():
        print(f"Không tìm thấy file: {path}", file=sys.stderr)
        return 1
    init_db()
    with Session(engine) as session:
        report = import_workbook(session, path, include_coding=not skip_coding)
    print(f"Đã nạp vào {db_label()}\n")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


def cmd_status() -> int:
    # Xem trạng thái là thao tác chỉ-đọc, không tự tạo bảng — DB trống thì báo
    # thẳng thay vì ném traceback "no such table".
    from sqlalchemy import inspect

    if "coders" not in inspect(engine).get_table_names():
        print(f"Database : {db_label()}")
        print("Chưa có bảng nào. Chạy `python seed/bootstrap_remote.py --init` "
              "để tạo.")
        return 1

    with Session(engine) as session:
        coders = session.exec(select(Coder).order_by(Coder.coder_id)).all()
        videos = session.exec(select(Video)).all()
        entries = session.exec(select(CodingEntry)).all()
        irr = session.exec(select(IRREntry)).all()
        accounts = session.exec(select(Account)).all()

    print(f"Database : {db_label()}")
    print(f"Accounts : {len(accounts)}")
    print(f"Videos   : {len(videos)}  (IRR pilot: "
          f"{sum(1 for v in videos if v.in_irr_pilot)})")
    print(f"Entries  : {len(entries)}  (đã bắt đầu: "
          f"{sum(1 for e in entries if e.started)}, xong: "
          f"{sum(1 for e in entries if e.completed)})")
    print(f"IRR      : {len(irr)}  (xong: {sum(1 for e in irr if e.completed)})")
    print("Coders   :")
    for coder in coders:
        state = "có mật khẩu" if coder.password_hash else "CHƯA đặt mật khẩu"
        flags = " ".join(filter(None, [
            "" if coder.active else "(khoá)",
            "(admin)" if coder.is_admin else "",
        ]))
        print(f"  - {coder.coder_id:4} {state} {flags}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--init", action="store_true",
                       help="Tạo bảng + tài khoản C1/C2 và đặt mật khẩu")
    group.add_argument("--set-password", metavar="CODER",
                       help="Đổi mật khẩu cho một coder (VD: C2)")
    group.add_argument("--import-xlsx", metavar="FILE",
                       help="Nạp file .xlsx gốc lên database")
    group.add_argument("--status", action="store_true",
                       help="Xem database hiện có những gì")
    parser.add_argument("--force", action="store_true",
                        help="Với --init: đặt lại cả mật khẩu đã có")
    parser.add_argument("--skip-coding", action="store_true",
                        help="Với --import-xlsx: bỏ qua sheet 3_Coding_Sheet")
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        _warn_if_sqlite()

    if args.init:
        return cmd_init(args)
    if args.set_password:
        return cmd_set_password(args.set_password)
    if args.import_xlsx:
        return cmd_import(args.import_xlsx, args.skip_coding)
    return cmd_status()


if __name__ == "__main__":
    raise SystemExit(main())
