"""Nội dung tooltip cho form, lấy từ sheet `Y_Frame_Quick_Guide`.

Khi import file gốc, nội dung thật sẽ ghi đè bản mặc định dưới đây. Bản mặc định
chỉ để app dùng được ngay khi chưa có file, và để không bao giờ hiện tooltip rỗng.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from ..models import QuickGuide

DEFAULT_GUIDE: list[dict[str, str]] = [
    {
        "field_key": "x1_commercial", "code": "X1", "label": "Commercial_content",
        "measures": "Video có quảng bá sản phẩm/dịch vụ/thương hiệu cụ thể không.",
        "confused_with": "Video chỉ mặc đồ đẹp mà không nhắc tên/chỗ mua thì không tính.",
        "example": "Review áo khoác của brand X, gắn giỏ hàng => X1 = 1.",
    },
    {
        "field_key": "x2_1_platform_label", "code": "X2.1", "label": "Platform_label",
        "measures": 'Nhãn "Paid partnership" do chính TikTok hiển thị.',
        "confused_with": "Chữ #ad tự gõ trong caption — cái đó là X2.4.",
        "example": "Dòng chữ nhỏ ngay dưới handle trong video.",
    },
    {
        "field_key": "x2_2_verbal", "code": "X2.2", "label": "Verbal_disclosure",
        "measures": "Creator nói ra bằng lời rằng đây là nội dung được tài trợ.",
        "confused_with": "Chữ chạy trên màn hình — cái đó là X2.3.",
        "example": '"Video này được tài trợ bởi..." => X2.2 = 1.',
    },
    {
        "field_key": "x2_3_onscreen", "code": "X2.3", "label": "Onscreen_disclosure",
        "measures": "Chữ tiết lộ tài trợ hiện trên khung hình (sticker/text overlay).",
        "confused_with": "Nhãn hệ thống của TikTok (X2.1) và hashtag trong caption (X2.4).",
        "example": 'Text overlay "Quảng cáo" đặt góc trên màn hình.',
    },
    {
        "field_key": "x2_4_hashtag", "code": "X2.4", "label": "Explicit_hashtag",
        "measures": "Hashtag tiết lộ rõ: #ad, #quangcao, #tainguyen, #sponsored.",
        "confused_with": "Hashtag thương hiệu thuần (#zara) không tính là tiết lộ.",
        "example": "#ad #quangcao trong caption => X2.4 = 1.",
    },
    {
        "field_key": "x2_5_brand_tag", "code": "X2.5", "label": "Brand_tag",
        "measures": "Tag tài khoản thương hiệu (@brand) trong caption hoặc video.",
        "confused_with": "Nhắc tên brand bằng chữ thường mà không tag.",
        "example": "Caption có @brandofficial => X2.5 = 1.",
    },
    {
        "field_key": "x2_6_product_link", "code": "X2.6", "label": "Product_link_tag",
        "measures": "Có gắn giỏ hàng TikTok Shop / link sản phẩm bấm được.",
        "confused_with": 'Chỉ nói "link ở bio" mà không gắn gì trong video.',
        "example": "Icon giỏ hàng vàng ở góc dưới video.",
    },
    {
        "field_key": "x2_7_promo_code", "code": "X2.7", "label": "Promo_affiliate_code",
        "measures": "Mã giảm giá hoặc mã affiliate riêng của creator.",
        "confused_with": "Chương trình giảm giá chung của shop, không gắn mã creator.",
        "example": '"Nhập mã LINH10 giảm 10%" => X2.7 = 1.',
    },
    {
        "field_key": "y1_information", "code": "Y1", "label": "Information",
        "measures": "Cung cấp thông tin cụ thể về sản phẩm: chất liệu, size, giá, thông số.",
        "confused_with": "Y2 Experience — kể trải nghiệm cá nhân chứ không phải thông số.",
        "example": '"Vải cotton 100%, form rộng, cao 1m60 mặc size S."',
    },
    {
        "field_key": "y2_experience", "code": "Y2", "label": "Experience",
        "measures": "Kể trải nghiệm sử dụng thực tế của người nói.",
        "confused_with": "Y1 Information — dữ kiện khách quan chứ không phải cảm nhận.",
        "example": '"Mình mặc đi làm cả ngày không bị nhăn."',
    },
    {
        "field_key": "y3_aesthetic", "code": "Y3", "label": "Aesthetic_trend",
        "measures": "Nhấn vào tính thẩm mỹ, phong cách, xu hướng đang hot.",
        "confused_with": "Y2 Experience — trải nghiệm mặc chứ không phải bàn về style.",
        "example": '"Style quiet luxury đang trend hè này."',
    },
    {
        "field_key": "y4_price_promo", "code": "Y4", "label": "Price_promotion",
        "measures": "Nhấn vào giá, khuyến mãi, deal, so sánh giá.",
        "confused_with": "Nhắc giá thoáng qua như một thông số (Y1).",
        "example": '"Sale còn 199k, rẻ nhất từ trước tới giờ."',
    },
    {
        "field_key": "y5_social_proof", "code": "Y5", "label": "Social_proof",
        "measures": "Viện dẫn đám đông: bán chạy, nhiều người mua, review tốt.",
        "confused_with": "Y2 Experience — trải nghiệm của chính người nói.",
        "example": '"Cháy hàng 3 lần, 10k lượt mua trong tháng."',
    },
    {
        "field_key": "y6_problem_solution", "code": "Y6", "label": "Problem_solution",
        "measures": "Nêu một vấn đề rồi đưa sản phẩm ra như giải pháp.",
        "confused_with": "Y1 Information — chỉ mô tả công dụng, không dựng vấn đề trước.",
        "example": '"Bụng mỡ mặc gì cũng lộ? Chiếc quần này..."',
    },
    {
        "field_key": "y7_dominant_frame", "code": "Y7", "label": "Dominant_frame",
        "measures": "Frame chiếm ưu thế nhất trong video (chọn 1).",
        "confused_with": "Chọn 7 (Mixed) khi thật ra có một frame rõ ràng trội hơn.",
        "example": "Y7=3 chỉ hợp lệ khi Y3 = 1. Y7=7 cần ít nhất 2 frame Y1–Y6 = 1.",
    },
    {
        "field_key": "y8_cta", "code": "Y8", "label": "CTA",
        "measures": "Mức độ kêu gọi hành động: 0 = không, 1 = soft, 2 = hard.",
        "confused_with": 'Soft ("tham khảo nhé") vs hard ("mua ngay, link dưới").',
        "example": '"Bấm giỏ hàng mua ngay hôm nay" => Y8 = 2.',
    },
    {
        "field_key": "y9_appeal", "code": "Y9", "label": "Observed_appeal",
        "measures": ("Kiểu appeal quan sát được: 1 identification, 2 aspiration, "
                     "3 resolution, 4 pure info, 5 mixed."),
        "confused_with": ("0 và 9 — 0 dùng khi không có appeal rõ, 9 khi không đủ "
                          "dữ kiện để xác định. Nghĩa của 0 CẦN manual v0.1 xác nhận."),
        "example": '"Người như mình mặc vừa" => identification (1).',
    },
    {
        "field_key": "w1_ai_disclosure", "code": "W1", "label": "AI_disclosure",
        "measures": "Video có tiết lộ dùng nội dung do AI tạo/chỉnh không.",
        "confused_with": "Filter làm đẹp thông thường không tính là AI content.",
        "example": "Nhãn 'AI-generated' của TikTok hoặc creator tự khai.",
    },
    {
        "field_key": "w2_ai_label_source", "code": "W2", "label": "AI_label_source",
        "measures": "Nhãn AI đến từ đâu: hệ thống TikTok hay creator tự khai.",
        "confused_with": "W1 chỉ hỏi có/không, W2 hỏi nguồn của nhãn.",
        "example": "Danh sách giá trị đầy đủ CẦN manual v0.1 xác nhận.",
    },
]


def seed_defaults(session: Session) -> int:
    """Nạp guide mặc định cho field nào chưa có nội dung."""
    existing = {g.field_key for g in session.exec(select(QuickGuide)).all()}
    added = 0
    for row in DEFAULT_GUIDE:
        if row["field_key"] in existing:
            continue
        session.add(QuickGuide(**row))
        added += 1
    session.commit()
    return added


def as_map(session: Session) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for g in session.exec(select(QuickGuide)).all():
        out[g.field_key] = {
            "code": g.code, "label": g.label, "measures": g.measures,
            "confused_with": g.confused_with, "example": g.example,
        }
    return out
