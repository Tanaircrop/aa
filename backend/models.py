"""SQLModel schema.

`CodingEntry` giữ đúng 47 cột của `3_Coding_Sheet` (trừ STT là số thứ tự hiển
thị, lấy từ `Video.stt`). `IRREntry` dùng cho pilot C1/C2 code độc lập.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlmodel import JSON, Column as SAColumn, Field, SQLModel


class Coder(SQLModel, table=True):
    __tablename__ = "coders"

    id: Optional[int] = Field(default=None, primary_key=True)
    coder_id: str = Field(index=True, unique=True)  # C1, C2...
    name: str = ""
    active: bool = True


class Account(SQLModel, table=True):
    __tablename__ = "accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    handle: str = Field(index=True, unique=True)
    account_type: Optional[int] = None  # 1 = Influencer/KOC, 2 = Brand
    follower_baseline: Optional[int] = None
    tier: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))


class Video(SQLModel, table=True):
    """Một dòng của `2_Video_Queue` — hàng đợi 500 video cần code."""

    __tablename__ = "videos"

    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: str = Field(index=True, unique=True)
    stt: Optional[int] = Field(default=None, index=True)
    url: Optional[str] = None
    upload_date: Optional[date] = None
    account_handle: Optional[str] = Field(default=None, index=True)
    follower_count: Optional[int] = None
    e1_likes: Optional[int] = None
    e2_comments: Optional[int] = None
    e3_shares: Optional[int] = None
    e4_views: Optional[int] = None
    in_irr_pilot: bool = Field(default=False, index=True)
    extra: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))


class CodingEntryBase(SQLModel):
    """47 cột của `3_Coding_Sheet` (STT lấy từ Video)."""

    # --- Meta ---
    video_id: str = Field(index=True)
    url: Optional[str] = None
    upload_date: Optional[date] = None
    account_handle: Optional[str] = None
    coder_id: Optional[str] = Field(default=None, index=True)
    coding_date: Optional[date] = Field(default=None, index=True)
    snapshot_time: Optional[datetime] = None
    account_type: Optional[int] = Field(default=None, index=True)
    v2_commercial_relationship: Optional[int] = None
    follower_count: Optional[int] = None
    dominant_format: Optional[int] = None

    # --- X ---
    x1_commercial: Optional[int] = Field(default=None, index=True)
    x2_1_platform_label: Optional[int] = None
    x2_2_verbal: Optional[int] = None
    x2_3_onscreen: Optional[int] = None
    x2_4_hashtag: Optional[int] = None
    x2_5_brand_tag: Optional[int] = None
    x2_6_product_link: Optional[int] = None
    x2_7_promo_code: Optional[int] = None
    x3_visibility_level: Optional[int] = None
    x4a_video_sec: Optional[float] = None
    x4b_commercial_sec: Optional[float] = None
    x4c_commercial_share: Optional[float] = None
    x4_intensity_band: Optional[int] = Field(default=None, index=True)

    # --- Y ---
    y1_information: Optional[int] = None
    y2_experience: Optional[int] = None
    y3_aesthetic: Optional[int] = None
    y4_price_promo: Optional[int] = None
    y5_social_proof: Optional[int] = None
    y6_problem_solution: Optional[int] = None
    y7_dominant_frame: Optional[int] = Field(default=None, index=True)
    y8_cta: Optional[int] = None
    y9_appeal: Optional[int] = Field(default=None, index=True)

    # --- W ---
    w1_ai_disclosure: Optional[int] = None
    w2_ai_label_source: Optional[int] = None

    # --- E ---
    e1_likes: Optional[int] = None
    e2_comments: Optional[int] = None
    e3_shares: Optional[int] = None
    e4_views: Optional[int] = None
    e5_saves: Optional[int] = None
    er_view_core: Optional[float] = None
    er_view_plus_save: Optional[float] = None
    er_follower: Optional[float] = None

    # --- QC ---
    qc_status: Optional[str] = Field(default=None, index=True)
    missing_data_notes: Optional[str] = None
    boundary_notes: Optional[str] = None


class CodingEntry(CodingEntryBase, table=True):
    """Bản coding chính (`3_Coding_Sheet`), mỗi video một dòng."""

    __tablename__ = "coding_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: str = Field(index=True, unique=True)

    #: Giá trị coder ghi đè lên field derived: {field_key: value}
    overrides: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))
    #: Đã đụng tới field nào (để tô chấm xanh "đã nhập" đúng, phân biệt với 0)
    touched: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))

    started: bool = Field(default=False, index=True)
    completed: bool = Field(default=False, index=True)
    flagged_for_review: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class IRREntry(CodingEntryBase, table=True):
    """Bản coding cho `5_IRR_Pilot`: mỗi video có 2 dòng (C1 và C2)."""

    __tablename__ = "irr_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: str = Field(index=True)
    role: str = Field(index=True)  # "C1" | "C2"

    overrides: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))
    touched: dict[str, Any] = Field(default_factory=dict, sa_column=SAColumn(JSON))
    diff_notes: Optional[str] = None

    started: bool = Field(default=False)
    completed: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class QuickGuide(SQLModel, table=True):
    """Nội dung `Y_Frame_Quick_Guide` để đổ vào tooltip trong form."""

    __tablename__ = "quick_guide"

    id: Optional[int] = Field(default=None, primary_key=True)
    field_key: str = Field(index=True)
    code: str = ""  # ví dụ "Y3"
    label: str = ""
    measures: str = ""  # "Đo cái gì?"
    confused_with: str = ""  # "Dễ nhầm với"
    example: str = ""  # "Ví dụ nhanh"


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"

    key: str = Field(primary_key=True)
    value: str = ""
