#!/usr/bin/env python3
"""Tạo file .xlsx demo đúng cấu trúc file gốc, để chạy thử app khi chưa có dữ liệu thật.

    python seed/make_demo_xlsx.py            # 500 video + 75 video pilot
    python seed/make_demo_xlsx.py --n 60     # ít hơn cho nhanh

Sinh 6 sheet: 1_Account_List, 2_Video_Queue, 3_Coding_Sheet (một phần đã code),
5_IRR_Pilot, Y_Frame_Quick_Guide. Dữ liệu là giả lập, chỉ dùng để thử luồng nhập.
"""

from __future__ import annotations

import argparse
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

OUT = Path(__file__).resolve().parent / "TikTok_Fashion_Research_Sheet_v2.xlsx"

HANDLES = [
    "linh.fashion", "minhstyle", "chi.ootd", "brand.zenwear", "thao.closet",
    "brand.uraco", "quyen.daily", "vy.lookbook", "brand.mienmode", "tuan.fit",
    "hana.wardrobe", "brand.lyra", "phuong.thrift", "brand.cottonhouse", "an.styles",
]

TIERS = ["Nano", "Micro", "Mid", "Macro"]


def build(n_videos: int, n_pilot: int, seed: int = 20260814) -> Workbook:
    rng = random.Random(seed)
    wb = Workbook()

    # --- 1_Account_List -------------------------------------------------
    ws = wb.active
    ws.title = "1_Account_List"
    ws.append(["Account_handle", "Account_type", "Follower_count", "Tier", "Ghi_chu"])
    accounts = {}
    for handle in HANDLES:
        acc_type = 2 if handle.startswith("brand.") else 1
        followers = rng.choice([8_500, 23_000, 74_000, 150_000, 480_000, 1_200_000])
        tier = TIERS[min(len(str(followers)) - 4, 3)]
        accounts[handle] = (acc_type, followers, tier)
        ws.append([handle, acc_type, followers, tier, ""])

    # --- 2_Video_Queue --------------------------------------------------
    ws = wb.create_sheet("2_Video_Queue")
    ws.append(["STT", "Video_ID", "URL", "Upload_date", "Account_handle",
               "Follower_count", "Likes", "Comments", "Shares", "Views"])
    base = date(2026, 1, 5)
    videos = []
    for i in range(1, n_videos + 1):
        handle = rng.choice(HANDLES)
        acc_type, followers, _ = accounts[handle]
        video_id = str(7_300_000_000_000_000_000 + i * 971)
        url = f"https://www.tiktok.com/@{handle}/video/{video_id}"
        upload = base + timedelta(days=rng.randint(0, 180))
        views = rng.randint(3_000, 2_400_000)
        likes = int(views * rng.uniform(0.02, 0.14))
        comments = int(likes * rng.uniform(0.01, 0.09))
        shares = int(likes * rng.uniform(0.01, 0.12))
        ws.append([i, video_id, url, upload, handle, followers,
                   likes, comments, shares, views])
        videos.append({"stt": i, "video_id": video_id, "url": url,
                       "handle": handle, "upload": upload, "views": views,
                       "likes": likes, "comments": comments, "shares": shares,
                       "acc_type": acc_type, "followers": followers})

    # --- 3_Coding_Sheet: header đủ 47 cột, ~12% dòng đã code sẵn --------
    from backend.columns import EXCEL_HEADERS  # import trễ để script chạy độc lập

    ws = wb.create_sheet("3_Coding_Sheet")
    ws.append(EXCEL_HEADERS)
    n_coded = max(int(n_videos * 0.12), 3)
    for video in videos:
        row = _coding_row(video, rng, coded=video["stt"] <= n_coded)
        ws.append([row.get(h, None) for h in EXCEL_HEADERS])

    # --- 5_IRR_Pilot ----------------------------------------------------
    ws = wb.create_sheet("5_IRR_Pilot")
    ws.append(["STT", "Video_ID", "URL", "Account_handle", "Coder_ID",
               "X1 Commercial_content", "Y7 Dominant_frame", "Y8 CTA",
               "Ghi_chu_khac_biet"])
    step = max(n_videos // n_pilot, 1)
    for video in videos[::step][:n_pilot]:
        ws.append([video["stt"], video["video_id"], video["url"], video["handle"],
                   "", "", "", "", ""])

    # --- Y_Frame_Quick_Guide -------------------------------------------
    ws = wb.create_sheet("Y_Frame_Quick_Guide")
    ws.append(["Biến", "Tên", "Đo cái gì?", "Dễ nhầm với", "Ví dụ nhanh"])
    from backend.services.quick_guide import DEFAULT_GUIDE

    for item in DEFAULT_GUIDE:
        ws.append([item["code"], item["label"], item["measures"],
                   item["confused_with"], item["example"]])

    return wb


def _coding_row(video: dict, rng: random.Random, coded: bool) -> dict:
    """Một dòng 3_Coding_Sheet; nếu `coded` thì điền sẵn giá trị giả lập."""
    row = {
        "STT": video["stt"],
        "V1 Video_ID": video["video_id"],
        "V0.2 URL": video["url"],
        "V0.3 Upload_date": video["upload"],
        "V0.4 Account_handle": video["handle"],
        "V1 Account_type": video["acc_type"],
        "V3 Follower_count": video["followers"],
        "E1 Likes": video["likes"],
        "E2 Comments": video["comments"],
        "E3 Shares": video["shares"],
        "E4 Views": video["views"],
    }
    if not coded:
        return row

    x1 = rng.choice([0, 1, 1, 1])
    signals = {}
    for key in ("X2.1 Platform_label", "X2.2 Verbal_disclosure",
                "X2.3 Onscreen_disclosure", "X2.4 Explicit_hashtag",
                "X2.5 Brand_tag", "X2.6 Product_link_tag",
                "X2.7 Promo_affiliate_code"):
        signals[key] = rng.choice([0, 0, 1]) if x1 else 0
    row.update(signals)

    video_sec = rng.randint(15, 180)
    frames = {f"Y{i}": rng.choice([0, 0, 1]) for i in range(1, 7)}
    active = [i for i in range(1, 7) if frames[f"Y{i}"] == 1]
    if len(active) >= 2:
        y7 = rng.choice(active + [7])
    elif active:
        y7 = active[0]
    else:
        y7 = 0

    row.update({
        "V0.5 Coder_ID": rng.choice(["C1", "C2"]),
        "V0.6 Coding_date": date(2026, 8, 1) + timedelta(days=rng.randint(0, 12)),
        "V0.7 Snapshot_time": datetime(2026, 8, 10, rng.randint(8, 20), 0),
        "V4 Dominant_format": rng.choice([1, 2, 3, 4, 5, 9]),
        "X1 Commercial_content": x1,
        "X4a Video_sec": video_sec,
        "X4b Commercial_sec": int(video_sec * rng.uniform(0, 0.9)) if x1 else 0,
        "Y1 Information": frames["Y1"],
        "Y2 Experience": frames["Y2"],
        "Y3 Aesthetic_trend": frames["Y3"],
        "Y4 Price_promotion": frames["Y4"],
        "Y5 Social_proof": frames["Y5"],
        "Y6 Problem_solution": frames["Y6"],
        "Y7 Dominant_frame": y7,
        "Y8 CTA": rng.choice([0, 1, 2, 9]),
        "Y9 Observed_appeal": rng.choice([0, 1, 2, 3, 4, 5, 9]),
        "W1 AI_disclosure": rng.choice([0, 0, 0, 1]),
        "W2 AI_label_source": rng.choice([0, 1, 2, 3, 9]),
        "E5 Saves": int(video["likes"] * rng.uniform(0.02, 0.2)),
    })
    return row


def main() -> int:
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=500, help="Số video trong queue")
    parser.add_argument("--pilot", type=int, default=75, help="Số video IRR pilot")
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()

    wb = build(args.n, args.pilot)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"Đã tạo file demo: {out}")
    print(f"Nạp vào app bằng:\n    python seed/import_seed.py {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
