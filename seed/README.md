# Thư mục dữ liệu nguồn

Đặt file Excel gốc vào đây với tên:

    TikTok_Fashion_Research_Sheet_v2.xlsx

rồi chạy:

    python seed/import_seed.py

File `.xlsx` trong thư mục này **không được commit** (xem `.gitignore`) vì chứa dữ
liệu nghiên cứu.

Chưa có file thật? Sinh dữ liệu demo để thử app:

    python seed/make_demo_xlsx.py --n 500 --pilot 75
    python seed/import_seed.py
