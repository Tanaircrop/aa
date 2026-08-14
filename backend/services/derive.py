"""Tính các cột derived (mục 5 của SPEC), rule đọc từ `rules_config.json`.

Không hard-code công thức chưa xác nhận trong logic chính: đổi công thức chỉ cần
sửa `rules_config.json`. Mỗi field derived trả về kèm `confirmed` để UI biết có
phải hiện icon cảnh báo "auto (tạm), cần review" hay không.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from ..columns import COLUMNS_BY_KEY, DERIVED_KEYS, REQUIRED_KEYS
from .expr import evaluate, evaluate_bool

CONFIG_PATH = Path(__file__).resolve().parent.parent / "rules_config.json"

_lock = threading.Lock()
_config: dict[str, Any] | None = None
_config_mtime: float | None = None


def load_config(force: bool = False) -> dict[str, Any]:
    """Đọc rules_config.json, tự nạp lại khi file đổi (sửa xong không cần restart)."""
    global _config, _config_mtime
    with _lock:
        try:
            mtime = CONFIG_PATH.stat().st_mtime
        except OSError:
            mtime = None
        if force or _config is None or mtime != _config_mtime:
            with CONFIG_PATH.open(encoding="utf-8") as fh:
                _config = json.load(fh)
            _config_mtime = mtime
        return _config


# Y7 = 1..6 tương ứng với Y1..Y6
_Y7_FRAME_KEYS = {
    1: "y1_information",
    2: "y2_experience",
    3: "y3_aesthetic",
    4: "y4_price_promo",
    5: "y5_social_proof",
    6: "y6_problem_solution",
}

_X2_KEYS = [
    "x2_1_platform_label", "x2_2_verbal", "x2_3_onscreen", "x2_4_hashtag",
    "x2_5_brand_tag", "x2_6_product_link", "x2_7_promo_code",
]

_Y_FRAME_KEYS = [
    "y1_information", "y2_experience", "y3_aesthetic", "y4_price_promo",
    "y5_social_proof", "y6_problem_solution",
]


def _num(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    try:
        text = str(value).strip().replace(",", "")
        return float(text) if "." in text else int(text)
    except (TypeError, ValueError):
        return None


def build_variables(entry: dict[str, Any]) -> dict[str, Any]:
    """Map dữ liệu entry -> biến dùng được trong biểu thức của rules_config."""
    env: dict[str, Any] = {}
    for key, col in COLUMNS_BY_KEY.items():
        raw = entry.get(key)
        value = raw if col.dtype in ("text", "date", "datetime") else _num(raw)
        env[key] = value
        if col.alias:
            env[col.alias] = value

    x2_vals = [_num(entry.get(k)) for k in _X2_KEYS]
    env["X2_COUNT"] = sum(1 for v in x2_vals if v == 1)
    env["X2_FILLED"] = sum(1 for v in x2_vals if v is not None)

    frame_vals = [_num(entry.get(k)) for k in _Y_FRAME_KEYS]
    env["N_FRAMES"] = sum(1 for v in frame_vals if v == 1)

    y7 = _num(entry.get("y7_dominant_frame"))
    if y7 in _Y7_FRAME_KEYS:
        env["FRAME_OF_Y7"] = _num(entry.get(_Y7_FRAME_KEYS[int(y7)]))
    else:
        env["FRAME_OF_Y7"] = None

    missing = missing_required(entry)
    env["MISSING_REQUIRED"] = len(missing)
    note = entry.get("missing_data_notes")
    env["HAS_MISSING_NOTE"] = 1 if (note or "").strip() else 0

    # Derived phụ thuộc lẫn nhau (X4band cần X4c): tính trước theo thứ tự khai báo.
    return env


def missing_required(entry: dict[str, Any]) -> list[str]:
    """Field bắt buộc (mục 6.6) còn trống."""
    out = []
    for key in REQUIRED_KEYS:
        val = entry.get(key)
        if val is None or (isinstance(val, str) and not val.strip()):
            out.append(key)
    return out


def _missing_requirements(rule: dict[str, Any], env: dict[str, Any]) -> bool:
    """True nếu rule khai báo `require` mà có biến đang trống.

    Dùng để field derived im lặng (trống) khi coder chưa nhập đủ đầu vào, thay vì
    hiện một giá trị mặc định gây hiểu nhầm (ví dụ band "Cao" cho video chưa code).
    """
    for name in rule.get("require", []):
        if env.get(name) is None:
            return True
    return False


def _apply_formula(rule: dict[str, Any], env: dict[str, Any]) -> Any:
    if _missing_requirements(rule, env):
        return None
    guard = rule.get("guard")
    if guard and not evaluate_bool(guard, env):
        return None
    value = evaluate(rule["expr"], env)
    if value is None:
        return None
    digits = rule.get("round")
    if digits is not None and isinstance(value, (int, float)):
        value = round(float(value), int(digits))
    return value


def _apply_cases(rule: dict[str, Any], env: dict[str, Any]) -> Any:
    if _missing_requirements(rule, env):
        return None
    for case in rule.get("cases", []):
        if _missing_requirements(case, env):
            continue
        if evaluate_bool(case["when"], env):
            return case.get("then")
    return rule.get("else")


def qc_evaluate(rule: dict[str, Any], entry: dict[str, Any],
                env: dict[str, Any]) -> tuple[str, list[str]]:
    reasons: list[str] = []
    missing = missing_required(entry)
    for check in rule.get("checks", []):
        if evaluate_bool(check["when"], env):
            reason = check.get("reason", check["when"])
            if "MISSING_REQUIRED" in check["when"] and missing:
                labels = ", ".join(COLUMNS_BY_KEY[k].excel for k in missing)
                reason = f"{reason}: {labels}"
            reasons.append(reason)
    status = rule.get("check_value", "CHECK") if reasons else rule.get("ok_value", "OK")
    return status, reasons


def compute(entry: dict[str, Any]) -> dict[str, Any]:
    """Tính toàn bộ field derived cho một entry.

    Trả về dict:
      values      -> {key: giá trị cuối cùng (đã áp override nếu có)}
      auto_values -> {key: giá trị app tự tính, kể cả khi bị override}
      meta        -> {key: {confirmed, source, overridden, kind}}
      qc_reasons  -> danh sách lý do QC = CHECK
      missing_required, suggestions
    """
    config = load_config()
    fields = config.get("fields", {})
    overrides = entry.get("overrides") or {}
    if isinstance(overrides, str):
        try:
            overrides = json.loads(overrides)
        except json.JSONDecodeError:
            overrides = {}

    working = dict(entry)
    env = build_variables(working)

    values: dict[str, Any] = {}
    auto_values: dict[str, Any] = {}
    meta: dict[str, Any] = {}
    qc_reasons: list[str] = []
    suggestions: dict[str, Any] = {}

    for key in DERIVED_KEYS:
        rule = fields.get(key, {"kind": "manual", "confirmed": False})
        kind = rule.get("kind", "manual")
        auto: Any = None

        if kind == "formula":
            auto = _apply_formula(rule, env)
        elif kind == "cases":
            auto = _apply_cases(rule, env)
        elif kind == "qc":
            auto, qc_reasons = qc_evaluate(rule, working, env)
        elif kind == "manual":
            auto = None

        suggestion_rule = rule.get("suggestion")
        if suggestion_rule:
            s_kind = suggestion_rule.get("kind", "cases")
            if s_kind == "cases":
                suggestions[key] = _apply_cases(suggestion_rule, env)
            elif s_kind == "formula":
                suggestions[key] = _apply_formula(suggestion_rule, env)

        auto_values[key] = auto
        overridden = key in overrides and overrides[key] is not None
        if overridden:
            final = overrides[key]
        elif kind == "manual":
            # App không tự tính: giữ giá trị coder đã nhập vào cột.
            final = working.get(key)
        else:
            final = auto
        values[key] = final

        meta[key] = {
            "kind": kind,
            "confirmed": bool(rule.get("confirmed", False)),
            "source": rule.get("source", ""),
            "overridden": overridden,
            "auto": auto,
            "has_suggestion": key in suggestions,
        }

        # Cập nhật env để derived sau dùng được derived trước (X4c -> X4band).
        col = COLUMNS_BY_KEY[key]
        working[key] = final
        env[key] = _num(final) if col.dtype in ("int", "float", "enum") else final
        if col.alias:
            env[col.alias] = env[key]

    return {
        "values": values,
        "auto_values": auto_values,
        "meta": meta,
        "qc_reasons": qc_reasons,
        "missing_required": missing_required(working),
        "suggestions": suggestions,
    }


def apply_to(entry: dict[str, Any]) -> dict[str, Any]:
    """Trả về bản sao entry đã ghi giá trị derived vào đúng cột."""
    result = compute(entry)
    merged = dict(entry)
    for key, value in result["values"].items():
        if value is not None or COLUMNS_BY_KEY[key].source != "manual":
            merged[key] = value
    return merged
