"""Ràng buộc logic khi nhập (mục 6 của SPEC).

Nguyên tắc: KHÔNG chặn cứng việc lưu (thực địa luôn có case biên) — chỉ trả về
cảnh báo phân loại `hard` (đỏ) / `soft` (vàng) / `missing` (field bắt buộc còn
trống). UI quyết định hiển thị; nút "Lưu & tiếp" chặn khi còn `missing`, nhưng
vẫn có "Bỏ qua, lưu tạm".
"""

from __future__ import annotations

from typing import Any

from ..columns import COLUMNS_BY_KEY
from .derive import build_variables, load_config, missing_required
from .expr import evaluate_bool


def _rule_warnings(rules: list[dict[str, Any]], env: dict[str, Any],
                   level: str) -> list[dict[str, Any]]:
    out = []
    for rule in rules:
        if evaluate_bool(rule["when"], env):
            out.append({
                "level": level,
                "message": rule.get("message", rule["when"]),
                "fields": rule.get("fields", []),
                "rule": rule["when"],
            })
    return out


def validate(entry: dict[str, Any]) -> dict[str, Any]:
    """Chạy toàn bộ ràng buộc cho một entry."""
    config = load_config()
    section = config.get("validation", {})
    env = build_variables(entry)

    warnings: list[dict[str, Any]] = []
    warnings += _rule_warnings(section.get("hard_warnings", []), env, "hard")
    warnings += _rule_warnings(section.get("soft_warnings", []), env, "soft")

    warnings += _enum_warnings(entry)

    missing = missing_required(entry)
    return {
        "warnings": warnings,
        "missing_required": missing,
        "missing_labels": [COLUMNS_BY_KEY[k].excel for k in missing],
        "has_hard": any(w["level"] == "hard" for w in warnings),
        "can_complete": not missing,
        "boundary_suggestion": _boundary_suggestion(warnings),
    }


def _enum_warnings(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """Giá trị nằm ngoài danh sách enum khai báo (thường do import dữ liệu cũ)."""
    out = []
    for key, col in COLUMNS_BY_KEY.items():
        if not col.options or col.source == "derived":
            continue
        value = entry.get(key)
        if value is None or value == "":
            continue
        candidates = {str(o) for o in col.options}
        if str(value) not in candidates:
            out.append({
                "level": "soft",
                "message": (f"{col.excel} = {value!r} không nằm trong danh sách "
                            f"hợp lệ ({', '.join(sorted(candidates))})"),
                "fields": [key],
                "rule": "enum",
            })
    return out


def _boundary_suggestion(warnings: list[dict[str, Any]]) -> str:
    """Gợi ý text để coder dán nhanh vào Boundary_notes."""
    msgs = [w["message"] for w in warnings if w["level"] in ("hard", "soft")]
    return " | ".join(msgs)
