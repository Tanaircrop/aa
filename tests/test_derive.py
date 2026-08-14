"""Kiểm tra công thức derived, ràng buộc logic và bộ đánh giá biểu thức."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services import derive, validate  # noqa: E402
from backend.services.expr import ExprError, evaluate, evaluate_bool  # noqa: E402


def base_entry(**overrides):
    entry = {
        "coder_id": "C1", "account_type": 1,
        "x1_commercial": 1,
        "x2_1_platform_label": 0, "x2_2_verbal": 0, "x2_3_onscreen": 0,
        "x2_4_hashtag": 0, "x2_5_brand_tag": 0, "x2_6_product_link": 0,
        "x2_7_promo_code": 0,
        "x4a_video_sec": 60, "x4b_commercial_sec": 30,
        "y1_information": 1, "y2_experience": 0, "y3_aesthetic": 0,
        "y4_price_promo": 0, "y5_social_proof": 0, "y6_problem_solution": 0,
        "y7_dominant_frame": 1, "y8_cta": 1, "y9_appeal": 4,
        "w1_ai_disclosure": 0,
        "e1_likes": 1000, "e2_comments": 100, "e3_shares": 50,
        "e4_views": 10000, "e5_saves": 200,
        "follower_count": 50000,
    }
    entry.update(overrides)
    return entry


# --------------------------------------------------------- Công thức đã chốt

def test_x4c_share():
    result = derive.compute(base_entry())
    assert result["values"]["x4c_commercial_share"] == 50.0


def test_er_formulas():
    values = derive.compute(base_entry())["values"]
    assert values["er_view_core"] == 11.5           # (1000+100+50)/10000
    assert values["er_view_plus_save"] == 13.5      # +200 saves
    assert values["er_follower"] == 2.3             # 1150/50000


def test_er_plus_save_blank_when_no_saves():
    values = derive.compute(base_entry(e5_saves=None))["values"]
    assert values["er_view_plus_save"] is None
    assert values["er_view_core"] == 11.5


@pytest.mark.parametrize("views", [0, None])
def test_zero_or_missing_denominator_gives_blank_not_crash(views):
    values = derive.compute(base_entry(e4_views=views))["values"]
    assert values["er_view_core"] is None
    assert values["er_view_plus_save"] is None


def test_x4a_zero_does_not_divide_by_zero():
    values = derive.compute(base_entry(x4a_video_sec=0))["values"]
    assert values["x4c_commercial_share"] is None


# --------------------------------------------------- Công thức tạm (cấu hình)

@pytest.mark.parametrize("share_sec,expected_band", [
    (0, 1), (20, 1), (33, 1), (40, 2), (66, 2), (67, 3), (60, 3)])
def test_intensity_band_thresholds(share_sec, expected_band):
    entry = base_entry(x4a_video_sec=100 if share_sec != 60 else 60,
                       x4b_commercial_sec=share_sec if share_sec != 60 else 45)
    assert derive.compute(entry)["values"]["x4_intensity_band"] == expected_band


def test_intensity_band_zero_when_not_commercial():
    entry = base_entry(x1_commercial=0, x4b_commercial_sec=0)
    assert derive.compute(entry)["values"]["x4_intensity_band"] == 0


def test_intensity_band_blank_while_inputs_missing():
    """Video chưa code không được hiện band 'Cao' chỉ vì rơi vào nhánh else."""
    entry = base_entry(x1_commercial=None, x4a_video_sec=None,
                       x4b_commercial_sec=None)
    assert derive.compute(entry)["values"]["x4_intensity_band"] is None


@pytest.mark.parametrize("n_signals,expected", [(0, 0), (1, 1), (2, 1), (3, 2),
                                                (4, 2), (5, 3), (7, 3)])
def test_visibility_level_counts_signals(n_signals, expected):
    keys = ["x2_1_platform_label", "x2_2_verbal", "x2_3_onscreen", "x2_4_hashtag",
            "x2_5_brand_tag", "x2_6_product_link", "x2_7_promo_code"]
    entry = base_entry(**{k: (1 if i < n_signals else 0) for i, k in enumerate(keys)})
    assert derive.compute(entry)["values"]["x3_visibility_level"] == expected


def test_v2_is_manual_but_offers_suggestion():
    result = derive.compute(base_entry(x2_4_hashtag=1))
    assert result["meta"]["v2_commercial_relationship"]["kind"] == "manual"
    assert result["meta"]["v2_commercial_relationship"]["confirmed"] is False
    assert result["suggestions"]["v2_commercial_relationship"] == 3


def test_tentative_fields_are_flagged_for_ui():
    meta = derive.compute(base_entry())["meta"]
    assert meta["x4c_commercial_share"]["confirmed"] is True
    assert meta["er_view_core"]["confirmed"] is True
    assert meta["x4_intensity_band"]["confirmed"] is False
    assert meta["x3_visibility_level"]["confirmed"] is False
    assert meta["qc_status"]["confirmed"] is False


# ------------------------------------------------------------------- QC

def test_qc_ok_when_complete_and_consistent():
    entry = base_entry(x2_4_hashtag=1)
    result = derive.compute(entry)
    assert result["values"]["qc_status"] == "OK"
    assert result["qc_reasons"] == []


def test_qc_check_when_required_field_missing():
    result = derive.compute(base_entry(y9_appeal=None))
    assert result["values"]["qc_status"] == "CHECK"
    assert "Y9 Observed_appeal" in " ".join(result["qc_reasons"])
    assert result["missing_required"] == ["y9_appeal"]


def test_qc_check_when_commercial_seconds_exceed_total():
    result = derive.compute(base_entry(x4a_video_sec=30, x4b_commercial_sec=60,
                                       x2_4_hashtag=1))
    assert result["values"]["qc_status"] == "CHECK"
    assert any("X4b > X4a" in r for r in result["qc_reasons"])


def test_qc_check_when_missing_note_filled():
    result = derive.compute(base_entry(x2_4_hashtag=1,
                                       missing_data_notes="không xem được view"))
    assert result["values"]["qc_status"] == "CHECK"


# ---------------------------------------------------------------- Override

def test_override_wins_over_auto_value():
    entry = base_entry(overrides={"x4_intensity_band": 1})
    result = derive.compute(entry)
    assert result["values"]["x4_intensity_band"] == 1
    assert result["auto_values"]["x4_intensity_band"] == 2  # 50% -> band 2
    assert result["meta"]["x4_intensity_band"]["overridden"] is True


# -------------------------------------------------------------- Validation

def test_y7_must_match_corresponding_y_field():
    checks = validate.validate(base_entry(y7_dominant_frame=3, y3_aesthetic=0))
    assert checks["has_hard"]
    assert any("Y7" in w["message"] for w in checks["warnings"] if w["level"] == "hard")


def test_y7_mixed_requires_two_frames():
    checks = validate.validate(base_entry(y7_dominant_frame=7))
    assert checks["has_hard"]

    ok = validate.validate(base_entry(y7_dominant_frame=7, y1_information=1,
                                      y2_experience=1))
    assert not ok["has_hard"]


def test_x4b_greater_than_x4a_is_hard_warning():
    checks = validate.validate(base_entry(x4a_video_sec=10, x4b_commercial_sec=20))
    assert checks["has_hard"]


def test_x1_zero_with_signals_is_soft_only():
    checks = validate.validate(base_entry(x1_commercial=0, x2_5_brand_tag=1,
                                          x4b_commercial_sec=0))
    assert not checks["has_hard"]
    assert any(w["level"] == "soft" for w in checks["warnings"])


def test_missing_required_blocks_completion_but_not_saving():
    checks = validate.validate(base_entry(y1_information=None, w1_ai_disclosure=None))
    assert checks["can_complete"] is False
    assert set(checks["missing_required"]) == {"y1_information", "w1_ai_disclosure"}


def test_boundary_suggestion_collects_messages():
    checks = validate.validate(base_entry(x4a_video_sec=10, x4b_commercial_sec=20))
    assert "X4b" in checks["boundary_suggestion"]


def test_out_of_range_enum_flagged():
    checks = validate.validate(base_entry(y8_cta=5))
    assert any(w["rule"] == "enum" for w in checks["warnings"])


# ------------------------------------------------------- Bộ đánh giá biểu thức

def test_expression_returns_default_when_variable_missing():
    assert evaluate("A + B", {"A": 1}) is None
    assert evaluate_bool("A > 0", {}) is False


def test_expression_survives_division_by_zero():
    assert evaluate("A / B", {"A": 1, "B": 0}) is None


@pytest.mark.parametrize("bad", [
    "__import__('os').system('ls')",
    "().__class__",
    "open('/etc/passwd')",
    "[x for x in range(3)]",
    "lambda: 1",
])
def test_expression_rejects_unsafe_input(bad):
    with pytest.raises(ExprError):
        evaluate(bad, {})


def test_expression_allows_whitelisted_functions():
    assert evaluate("max(A, B)", {"A": 3, "B": 7}) == 7
    assert evaluate("coalesce(A, B)", {"A": None, "B": 5}, default="x") == "x"
