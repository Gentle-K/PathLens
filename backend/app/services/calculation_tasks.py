from __future__ import annotations

import ast
import math
import re
from collections.abc import Iterable
from copy import deepcopy
from typing import Any

from app.domain.models import CalculationTask

ALLOWED_FUNCTION_NAMES = {
    "abs",
    "acos",
    "asin",
    "atan",
    "avg",
    "ceil",
    "cos",
    "exp",
    "floor",
    "len",
    "ln",
    "log",
    "max",
    "mean",
    "min",
    "pow",
    "round",
    "sin",
    "sqrt",
    "sum",
    "tan",
}
ALLOWED_CONSTANT_NAMES = {"e", "pi"}
DISALLOWED_FORMULA_SNIPPETS = (
    "待搜索数据填充",
    "判断逻辑",
    "如果",
    "则",
    "当",
    "should",
    "if ",
    "else",
    "pass ",
)
TOKEN_UNIT_SUFFIXES = ("USDT", "USDC", "USD", "CNY", "BTC", "HSK", "ETH", "bps", "%", "days")


def _normalize_text(value: str) -> str:
    normalized = re.sub(r"[\W_]+", " ", value.lower(), flags=re.UNICODE)
    return " ".join(normalized.split())


def _contains_cjk(value: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", value))


def _extract_name_tokens(expression: str) -> set[str]:
    try:
        parsed = ast.parse(expression, mode="eval")
    except SyntaxError:
        return set()
    return {node.id for node in ast.walk(parsed) if isinstance(node, ast.Name)}


def _normalize_formula_template(formula: str) -> str:
    template = re.sub(r"\b\d+(?:\.\d+)?\b", "N", formula.lower())
    template = re.sub(r"\b[a-z_][a-z0-9_]*\b", "VAR", template)
    template = re.sub(r"\s+", " ", template)
    return template.strip()


def _infer_metric(objective: str, formula_hint: str) -> str:
    text = _normalize_text(f"{objective} {formula_hint}")
    keyword_groups = {
        "ending_value": ("ending value", "净值", "net value", "value estimate"),
        "expected_return": ("return", "收益", "apy", "annual"),
        "var": ("var95", "var 95", "var"),
        "cvar": ("cvar95", "cvar 95", "cvar"),
        "drawdown": ("drawdown", "回撤"),
        "risk_budget": ("risk budget", "风险敞口"),
        "holding_period": ("holding period", "持有期"),
        "comparison": ("compare", "comparison", "对比"),
    }
    for metric, keywords in keyword_groups.items():
        if any(keyword in text for keyword in keywords):
            return metric
    return "generic"


def _infer_asset_token(task: CalculationTask) -> str:
    candidates: list[str] = []
    for key in ("asset_id", "asset", "asset_name", "symbol", "name", "labels"):
        value = task.input_params.get(key)
        if isinstance(value, str):
            candidates.append(value)
        elif isinstance(value, list):
            candidates.extend(str(item) for item in value[:3])
    normalized = _normalize_text(" ".join(candidates))
    if not normalized:
        return "generic"
    tokens = [
        token
        for token in normalized.split()
        if token not in {"estimate", "value", "ending", "comparison", "day", "days", "return"}
    ]
    return "-".join(tokens[:4]) or "generic"


def calculation_semantic_signature(task: CalculationTask) -> str:
    formula = normalize_formula_hint(task.formula_hint)
    metric = _infer_metric(task.objective, formula)
    asset = _infer_asset_token(task)
    horizon = ""
    for key in ("days", "holding_period_days", "holding_days", "period_days"):
        value = task.input_params.get(key)
        if isinstance(value, (int, float)) and value > 0:
            horizon = str(int(value))
            break
        if isinstance(value, str) and value.strip().isdigit():
            horizon = value.strip()
            break
    if not horizon:
        match = re.search(r"\b(\d{1,4})\s*(?:day|days|d)\b", formula.lower())
        horizon = match.group(1) if match else "na"
    param_keys = ",".join(sorted(_normalize_text(key) for key in task.input_params.keys()))
    return "|".join(
        [
            metric,
            asset,
            horizon,
            _normalize_formula_template(formula),
            param_keys,
            _normalize_text(task.unit),
        ]
    )


def normalize_formula_hint(formula: str) -> str:
    normalized = formula.strip().strip("`")
    if not normalized:
        raise ValueError("formula_hint is required for calculation tasks.")
    if "=" in normalized and "==" not in normalized:
        normalized = normalized.split("=", 1)[1].strip()
    if "^" in normalized and "**" not in normalized:
        normalized = normalized.replace("^", "**")
    return normalized


def _validate_input_value(name: str, value: Any) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            raise ValueError(f"Input parameter '{name}' must be finite.")
        return
    if isinstance(value, str):
        normalized = value.strip().replace(",", "")
        if not normalized:
            raise ValueError(f"Input parameter '{name}' is empty.")
        if any(suffix in normalized for suffix in TOKEN_UNIT_SUFFIXES) and not normalized.replace(".", "", 1).isdigit():
            raise ValueError(f"Input parameter '{name}' must be numeric and unit-free.")
        try:
            float(normalized)
            return
        except ValueError as error:
            raise ValueError(f"Input parameter '{name}' must be numeric.") from error
    if isinstance(value, list):
        if not value:
            raise ValueError(f"Input parameter '{name}' must not be empty.")
        if name == "labels" and all(isinstance(item, str) and item.strip() for item in value):
            return
        for item in value:
            _validate_input_value(name, item)
        return
    raise ValueError(f"Unsupported input parameter '{name}'.")


class _FormulaValidator(ast.NodeVisitor):
    allowed_nodes = (
        ast.Expression,
        ast.Constant,
        ast.Name,
        ast.BinOp,
        ast.UnaryOp,
        ast.Call,
        ast.List,
        ast.Tuple,
        ast.Dict,
        ast.Subscript,
        ast.Load,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.FloorDiv,
        ast.Mod,
        ast.Pow,
        ast.UAdd,
        ast.USub,
    )

    def __init__(self, variables: set[str]) -> None:
        self.variables = variables

    def generic_visit(self, node: ast.AST) -> None:
        if not isinstance(node, self.allowed_nodes):
            raise ValueError(f"Unsupported formula node: {type(node).__name__}")
        super().generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in self.variables or node.id in ALLOWED_FUNCTION_NAMES or node.id in ALLOWED_CONSTANT_NAMES:
            return
        raise ValueError(f"Undeclared variable: {node.id}")

    def visit_Call(self, node: ast.Call) -> None:
        if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_FUNCTION_NAMES:
            raise ValueError("Only direct calls to approved functions are allowed.")
        self.generic_visit(node)


def validate_calculation_task(task: CalculationTask) -> CalculationTask:
    formula = normalize_formula_hint(task.formula_hint)
    task.formula_hint = formula
    task.semantic_signature = task.semantic_signature or calculation_semantic_signature(task)

    if any(token in formula for token in ("×", "÷", "（", "）", "，", "；")):
        raise ValueError("Only ASCII math expressions are allowed in formula_hint.")
    if _contains_cjk(formula):
        raise ValueError("formula_hint must be ASCII-only and machine-executable.")
    if any(snippet in formula.lower() for snippet in DISALLOWED_FORMULA_SNIPPETS):
        raise ValueError("formula_hint contains natural-language planning text instead of an executable expression.")
    if re.search(r"[<>]|!=|==| and | or | not ", formula.lower()):
        raise ValueError("Conditional or logical expressions are not allowed in calculation formulas.")

    for key, value in task.input_params.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError("All calculation input parameter names must be non-empty strings.")
        if _contains_cjk(key):
            raise ValueError("Calculation input parameter names must use ASCII identifiers.")
        _validate_input_value(key, value)

    try:
        parsed = ast.parse(formula, mode="eval")
    except SyntaxError as error:
        raise ValueError("formula_hint is not a valid arithmetic expression.") from error

    variables = {key.strip() for key in task.input_params.keys()}
    _FormulaValidator(variables).visit(parsed)
    if not _extract_name_tokens(formula).intersection(variables | ALLOWED_CONSTANT_NAMES | ALLOWED_FUNCTION_NAMES):
        raise ValueError("formula_hint must reference at least one declared variable or approved constant.")
    return task


def _task_rank(task: CalculationTask) -> tuple[int, int]:
    validation_rank = {
        "validated": 3,
        "pending": 2,
        "rejected": 0,
    }.get((task.validation_state or "").strip().lower(), 1)
    status_rank = {
        "completed": 3,
        "running": 2,
        "pending": 1,
        "failed": 0,
        "rejected": 0,
    }.get((task.status or "").strip().lower(), 0)
    return validation_rank, status_rank


def sanitize_calculation_tasks(tasks: Iterable[CalculationTask]) -> list[CalculationTask]:
    sanitized = [task.model_copy(deep=True) for task in tasks]
    grouped: dict[str, list[CalculationTask]] = {}

    for task in sanitized:
        try:
            validate_calculation_task(task)
            task.validation_state = "validated"
            if task.status not in {"completed", "failed", "running"}:
                task.status = task.status or "pending"
            task.user_visible = task.status == "completed"
            task.failure_reason = task.failure_reason or ""
        except Exception as error:
            task.validation_state = "rejected"
            task.status = "rejected" if task.status not in {"completed", "failed"} else task.status
            task.user_visible = False
            task.failure_reason = task.failure_reason or str(error)
            task.result_value = task.result_value if task.status == "completed" else None
            if task.status != "completed":
                task.result_text = task.result_text if task.result_text and task.status == "failed" else ""
                task.result_payload = {}

        if not task.semantic_signature:
            try:
                task.semantic_signature = calculation_semantic_signature(task)
            except Exception:
                task.semantic_signature = f"invalid|{_normalize_text(task.objective)}|{_normalize_text(task.unit)}"
        grouped.setdefault(task.semantic_signature, []).append(task)

    for duplicates in grouped.values():
        if len(duplicates) < 2:
            continue
        winner = max(duplicates, key=_task_rank)
        for task in duplicates:
            if task is winner:
                continue
            task.user_visible = False
            if not task.failure_reason:
                task.failure_reason = "Superseded by a semantically duplicate calculation task."

    return sanitized


def visible_calculation_tasks(tasks: Iterable[CalculationTask]) -> list[CalculationTask]:
    return [task for task in sanitize_calculation_tasks(tasks) if task.user_visible]
