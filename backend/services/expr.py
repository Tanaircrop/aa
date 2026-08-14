"""Bộ đánh giá biểu thức an toàn cho `rules_config.json`.

Chỉ cho phép một tập nhỏ node AST (so sánh, số học, boolean, gọi hàm whitelist).
Không có `eval()` trần, không truy cập attribute, không import, không subscript.
Nhờ vậy sửa rules_config.json không thể biến thành chạy code tuỳ ý.
"""

from __future__ import annotations

import ast
import math
from typing import Any


class ExprError(ValueError):
    pass


def _coalesce(*args: Any) -> Any:
    for a in args:
        if a is not None:
            return a
    return None


def _is_blank(x: Any) -> bool:
    return x is None or (isinstance(x, str) and not x.strip())


SAFE_FUNCS: dict[str, Any] = {
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
    "len": len,
    "sum": sum,
    "int": int,
    "float": float,
    "bool": bool,
    "coalesce": _coalesce,
    "is_blank": _is_blank,
}

_ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare, ast.Call,
    ast.Name, ast.Constant, ast.IfExp, ast.Load,
    ast.And, ast.Or, ast.Not, ast.USub, ast.UAdd,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Tuple, ast.List,
)

_cache: dict[str, ast.Expression] = {}


def _parse(expr: str) -> ast.Expression:
    cached = _cache.get(expr)
    if cached is not None:
        return cached
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:  # pragma: no cover - lỗi cấu hình
        raise ExprError(f"Biểu thức sai cú pháp: {expr!r} ({exc})") from exc
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ExprError(
                f"Node không được phép trong biểu thức: {type(node).__name__} ({expr!r})"
            )
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in SAFE_FUNCS:
                raise ExprError(f"Hàm không được phép trong biểu thức: {expr!r}")
    _cache[expr] = tree
    return tree


def referenced_names(expr: str) -> set[str]:
    return {
        n.id for n in ast.walk(_parse(expr))
        if isinstance(n, ast.Name) and n.id not in SAFE_FUNCS
    }


def evaluate(expr: str, variables: dict[str, Any], *, default: Any = None) -> Any:
    """Đánh giá biểu thức.

    Trả về `default` (mặc định None) nếu biểu thức tham chiếu một biến đang
    trống — thay vì ném lỗi, để form nhập dở không bao giờ làm crash app.
    """
    tree = _parse(expr)
    for name in referenced_names(expr):
        if name not in variables or variables[name] is None:
            return default
    try:
        return _eval_node(tree.body, variables)
    except ZeroDivisionError:
        return default
    except (TypeError, ValueError, OverflowError):
        return default


def evaluate_bool(expr: str, variables: dict[str, Any]) -> bool:
    """Như `evaluate` nhưng biến trống => False (điều kiện không thoả)."""
    return bool(evaluate(expr, variables, default=False))


_BINOPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
    ast.Pow: lambda a, b: a ** b,
}

_CMPOPS = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def _eval_node(node: ast.AST, env: dict[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in SAFE_FUNCS:
            return SAFE_FUNCS[node.id]
        return env.get(node.id)
    if isinstance(node, ast.UnaryOp):
        val = _eval_node(node.operand, env)
        if isinstance(node.op, ast.Not):
            return not val
        if isinstance(node.op, ast.USub):
            return -val
        return +val
    if isinstance(node, ast.BinOp):
        op = _BINOPS.get(type(node.op))
        if op is None:
            raise ExprError("Toán tử không được phép")
        result = op(_eval_node(node.left, env), _eval_node(node.right, env))
        if isinstance(result, float) and (math.isnan(result) or math.isinf(result)):
            raise ValueError("Kết quả không hữu hạn")
        return result
    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            for v in node.values:
                val = _eval_node(v, env)
                if not val:
                    return False
            return True
        for v in node.values:
            if _eval_node(v, env):
                return True
        return False
    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, env)
        for op, comparator in zip(node.ops, node.comparators):
            right = _eval_node(comparator, env)
            fn = _CMPOPS.get(type(op))
            if fn is None:
                raise ExprError("Phép so sánh không được phép")
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        return (_eval_node(node.body, env) if _eval_node(node.test, env)
                else _eval_node(node.orelse, env))
    if isinstance(node, ast.Call):
        fn = SAFE_FUNCS[node.func.id]  # type: ignore[union-attr]
        return fn(*[_eval_node(a, env) for a in node.args])
    if isinstance(node, (ast.Tuple, ast.List)):
        return [_eval_node(e, env) for e in node.elts]
    raise ExprError(f"Node không hỗ trợ: {type(node).__name__}")
