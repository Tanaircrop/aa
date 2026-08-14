"""Single source of truth cho 47 cột của sheet `3_Coding_Sheet`.

Mọi thứ khác trong app (SQLModel schema, import/export Excel, form nhập liệu,
thứ tự nhảy phím) đều đọc từ danh sách này, để không bao giờ lệch cột.

Ghi chú về tên cột gốc: file mẫu dùng tiền tố "V1" cho cả `Video_ID` (cột 2) và
`Account_type` (cột 9). App giữ nguyên header Excel như bản gốc để export paste
lại được vào Google Sheets, nhưng khóa nội bộ (`key`) thì tách riêng.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# Loại nguồn dữ liệu
AUTO = "auto"  # app tự sinh, không cho sửa
AUTO_PULL = "auto_pull"  # kéo từ sheet khác, cho sửa
MANUAL = "manual"  # coder nhập
DERIVED = "derived"  # app tự tính từ field khác (có thể override)


@dataclass(frozen=True)
class Column:
    order: int
    key: str
    excel: str
    group: str
    dtype: str  # int | float | text | date | datetime | bool01 | enum
    source: str
    options: tuple[Any, ...] = ()
    option_labels: dict[Any, str] = field(default_factory=dict)
    alias: str = ""  # tên ngắn dùng trong rules_config.json
    note: str = ""
    required_for_ok: bool = False

    @property
    def editable(self) -> bool:
        return self.source in (MANUAL, AUTO_PULL)


def _lbl(**kw: str) -> dict[Any, str]:
    """Helper: nhãn cho option, key dạng chuỗi số được ép về int khi hợp lệ."""
    out: dict[Any, str] = {}
    for k, v in kw.items():
        raw = k[1:] if k.startswith("_") else k
        try:
            out[int(raw)] = v
        except ValueError:
            out[raw] = v
    return out


BOOL01 = (0, 1)
Y_TRI = (0, 1, 9)

COLUMNS: list[Column] = [
    Column(1, "stt", "STT", "meta", "int", AUTO, note="Số thứ tự theo bảng"),
    Column(2, "video_id", "V1 Video_ID", "meta", "text", AUTO_PULL, alias="V1",
           note="Rút từ URL video"),
    Column(3, "url", "V0.2 URL", "meta", "text", AUTO_PULL),
    Column(4, "upload_date", "V0.3 Upload_date", "meta", "date", AUTO_PULL),
    Column(5, "account_handle", "V0.4 Account_handle", "meta", "text", AUTO_PULL),
    Column(6, "coder_id", "V0.5 Coder_ID", "meta", "enum", MANUAL,
           options=("C1", "C2"), required_for_ok=True,
           note="Mặc định = coder đang chọn trong app"),
    Column(7, "coding_date", "V0.6 Coding_date", "meta", "date", AUTO,
           note="Mặc định hôm nay, cho sửa"),
    Column(8, "snapshot_time", "V0.7 Snapshot_time", "meta", "datetime", AUTO,
           note="Thời điểm chốt số liệu engagement"),
    Column(9, "account_type", "V1 Account_type", "meta", "enum", AUTO_PULL,
           options=(1, 2), option_labels=_lbl(_1="Influencer/KOC", _2="Brand"),
           alias="V1_TYPE", required_for_ok=True),
    Column(10, "v2_commercial_relationship", "V2 Observed_commercial_relationship",
           "meta", "enum", DERIVED, options=(0, 1, 2, 3), alias="V2",
           option_labels=_lbl(_0="Không thương mại", _1="Ngầm/không rõ",
                              _2="Có tín hiệu thương mại", _3="Công bố rõ ràng"),
           note="Công thức chưa xác nhận — xem rules_config.json"),
    Column(11, "follower_count", "V3 Follower_count", "meta", "int", AUTO_PULL,
           alias="V3"),
    Column(12, "dominant_format", "V4 Dominant_format", "meta", "enum", MANUAL,
           options=(1, 2, 3, 4, 5, 9), alias="V4",
           option_labels=_lbl(_1="Talking head / review", _2="GRWM / OOTD",
                              _3="Haul / unboxing", _4="Lookbook / transition",
                              _5="Skit / storytelling", _9="Khác / không rõ"),
           note="Enum tạm — cần manual v0.1 xác nhận"),

    Column(13, "x1_commercial", "X1 Commercial_content", "x", "bool01", MANUAL,
           options=BOOL01, alias="X1", required_for_ok=True,
           note="Video có nội dung thương mại không"),
    Column(14, "x2_1_platform_label", "X2.1 Platform_label", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_1", note='Nhãn "Paid partnership" của TikTok'),
    Column(15, "x2_2_verbal", "X2.2 Verbal_disclosure", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_2", note="Nói bằng lời"),
    Column(16, "x2_3_onscreen", "X2.3 Onscreen_disclosure", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_3", note="Chữ hiện trên màn hình"),
    Column(17, "x2_4_hashtag", "X2.4 Explicit_hashtag", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_4", note="#ad #quangcao..."),
    Column(18, "x2_5_brand_tag", "X2.5 Brand_tag", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_5", note="Tag @brand"),
    Column(19, "x2_6_product_link", "X2.6 Product_link_tag", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_6", note="Gắn giỏ hàng / link sản phẩm"),
    Column(20, "x2_7_promo_code", "X2.7 Promo_affiliate_code", "x", "bool01", MANUAL,
           options=BOOL01, alias="X2_7", note="Mã giảm giá / affiliate"),
    Column(21, "x3_visibility_level", "X3 Visibility_level", "x", "enum", DERIVED,
           options=(0, 1, 2, 3), alias="X3",
           note="Suy từ tổ hợp X2.1–X2.7 — công thức tạm"),
    Column(22, "x4a_video_sec", "X4a Video_sec", "x", "float", MANUAL, alias="X4a",
           note="Tổng số giây video"),
    Column(23, "x4b_commercial_sec", "X4b Commercial_sec", "x", "float", MANUAL,
           alias="X4b", note="Số giây có nội dung thương mại"),
    Column(24, "x4c_commercial_share", "X4c Commercial_share (%)", "x", "float",
           DERIVED, alias="X4c", note="= X4b / X4a * 100"),
    Column(25, "x4_intensity_band", "X4 Intensity_band", "x", "enum", DERIVED,
           options=(0, 1, 2, 3), alias="X4band",
           option_labels=_lbl(_0="Không thương mại", _1="Thấp", _2="Vừa", _3="Cao"),
           note="Band theo ngưỡng X4c — ngưỡng tạm"),

    Column(26, "y1_information", "Y1 Information", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y1", required_for_ok=True),
    Column(27, "y2_experience", "Y2 Experience", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y2", required_for_ok=True),
    Column(28, "y3_aesthetic", "Y3 Aesthetic_trend", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y3", required_for_ok=True),
    Column(29, "y4_price_promo", "Y4 Price_promotion", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y4", required_for_ok=True),
    Column(30, "y5_social_proof", "Y5 Social_proof", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y5", required_for_ok=True),
    Column(31, "y6_problem_solution", "Y6 Problem_solution", "y", "enum", MANUAL,
           options=Y_TRI, alias="Y6", required_for_ok=True),
    Column(32, "y7_dominant_frame", "Y7 Dominant_frame", "y", "enum", MANUAL,
           options=(0, 1, 2, 3, 4, 5, 6, 7, 9), alias="Y7", required_for_ok=True,
           option_labels=_lbl(_0="Không có frame", _1="Information", _2="Experience",
                              _3="Aesthetic", _4="Price", _5="Social proof",
                              _6="Problem-solution", _7="Mixed", _9="Không xác định"),
           note="Y7=1–6 phải khớp Y tương ứng = 1; Y7=7 cần ≥2 frame"),
    Column(33, "y8_cta", "Y8 CTA", "y", "enum", MANUAL, options=(0, 1, 2, 9),
           alias="Y8", required_for_ok=True,
           option_labels=_lbl(_0="Không", _1="Soft", _2="Hard", _9="Không xác định")),
    Column(34, "y9_appeal", "Y9 Observed_appeal", "y", "enum", MANUAL,
           options=(0, 1, 2, 3, 4, 5, 9), alias="Y9", required_for_ok=True,
           option_labels=_lbl(_0="Không có appeal rõ", _1="Identification",
                              _2="Aspiration", _3="Resolution", _4="Pure info",
                              _5="Mixed", _9="Không xác định"),
           note="Nghĩa của 0 chưa xác nhận trong quick guide"),

    Column(35, "w1_ai_disclosure", "W1 AI_disclosure", "w", "bool01", MANUAL,
           options=BOOL01, alias="W1", required_for_ok=True),
    Column(36, "w2_ai_label_source", "W2 AI_label_source", "w", "enum", MANUAL,
           options=(0, 1, 2, 3, 9), alias="W2",
           option_labels=_lbl(_0="Không có nhãn", _1="Nhãn tự động của TikTok",
                              _2="Creator tự khai (caption/onscreen)",
                              _3="Cả hai", _9="Không xác định"),
           note="Enum tạm — cần manual v0.1 xác nhận"),

    Column(37, "e1_likes", "E1 Likes", "e", "int", AUTO_PULL, alias="E1"),
    Column(38, "e2_comments", "E2 Comments", "e", "int", AUTO_PULL, alias="E2"),
    Column(39, "e3_shares", "E3 Shares", "e", "int", AUTO_PULL, alias="E3"),
    Column(40, "e4_views", "E4 Views", "e", "int", AUTO_PULL, alias="E4"),
    Column(41, "e5_saves", "E5 Saves", "e", "int", MANUAL, alias="E5",
           note="Không có trong Video_Queue, phải tự lấy"),
    Column(42, "er_view_core", "ER_view_core (%)", "e", "float", DERIVED,
           alias="ER_core", note="= (E1+E2+E3)/E4*100"),
    Column(43, "er_view_plus_save", "ER_view_plus_save (%)", "e", "float", DERIVED,
           alias="ER_save", note="= (E1+E2+E3+E5)/E4*100, trống nếu thiếu E5"),
    Column(44, "er_follower", "ER_follower (%)", "e", "float", DERIVED,
           alias="ER_follower", note="= (E1+E2+E3)/V3*100"),

    Column(45, "qc_status", "QC_status", "qc", "enum", DERIVED, options=("OK", "CHECK"),
           alias="QC"),
    Column(46, "missing_data_notes", "Missing_data_notes", "qc", "text", MANUAL),
    Column(47, "boundary_notes", "Boundary_notes", "qc", "text", MANUAL),
]

COLUMNS_BY_KEY: dict[str, Column] = {c.key: c for c in COLUMNS}
COLUMNS_BY_EXCEL: dict[str, Column] = {c.excel: c for c in COLUMNS}
ALIAS_TO_KEY: dict[str, str] = {c.alias: c.key for c in COLUMNS if c.alias}

EXCEL_HEADERS: list[str] = [c.excel for c in COLUMNS]

DERIVED_KEYS: list[str] = [c.key for c in COLUMNS if c.source == DERIVED]
EDITABLE_KEYS: list[str] = [c.key for c in COLUMNS if c.editable]
#: Cột được phép nạp từ file Excel — gồm cả cột `auto` (Coding_date, Snapshot_time)
#: vì file gốc đã có sẵn giá trị, chỉ loại derived và STT (app tự sinh).
IMPORTABLE_KEYS: list[str] = [
    c.key for c in COLUMNS if c.source != DERIVED and c.key != "stt"
]
REQUIRED_KEYS: list[str] = [c.key for c in COLUMNS if c.required_for_ok]

GROUP_TITLES = {
    "meta": "Metadata",
    "x": "X — Disclosure & Intensity",
    "y": "Y — Content Frame",
    "w": "W — AI disclosure",
    "e": "E — Engagement",
    "qc": "QC & Notes",
}

#: Thứ tự nhảy phím trong form (mục 7.2 của SPEC).
TAB_ORDER: list[str] = [
    "coder_id", "account_type", "dominant_format",
    "x1_commercial", "x2_1_platform_label", "x2_2_verbal", "x2_3_onscreen",
    "x2_4_hashtag", "x2_5_brand_tag", "x2_6_product_link", "x2_7_promo_code",
    "x4a_video_sec", "x4b_commercial_sec",
    "y1_information", "y2_experience", "y3_aesthetic", "y4_price_promo",
    "y5_social_proof", "y6_problem_solution", "y7_dominant_frame", "y8_cta",
    "y9_appeal",
    "w1_ai_disclosure", "w2_ai_label_source",
    "e1_likes", "e2_comments", "e3_shares", "e4_views", "e5_saves",
    "missing_data_notes", "boundary_notes",
]


def column_schema() -> list[dict[str, Any]]:
    """Serialize cho frontend."""
    out = []
    for c in COLUMNS:
        out.append({
            "order": c.order,
            "key": c.key,
            "excel": c.excel,
            "group": c.group,
            "dtype": c.dtype,
            "source": c.source,
            "editable": c.editable,
            "options": list(c.options),
            "option_labels": {str(k): v for k, v in c.option_labels.items()},
            "alias": c.alias,
            "note": c.note,
            "required": c.required_for_ok,
        })
    return out
