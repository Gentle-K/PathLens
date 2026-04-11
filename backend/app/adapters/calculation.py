from __future__ import annotations

import ast
import math
from typing import Any

from app.domain.models import CalculationTask
from app.services.calculation_tasks import normalize_formula_hint, validate_calculation_task


def _mean(values: list[float]) -> float:
    if not values:
        raise ValueError("mean() requires at least one value.")
    return sum(values) / len(values)


ALLOWED_FUNCTIONS: dict[str, Any] = {
    "abs": abs,
    "acos": math.acos,
    "asin": math.asin,
    "atan": math.atan,
    "avg": _mean,
    "ceil": math.ceil,
    "cos": math.cos,
    "exp": math.exp,
    "floor": math.floor,
    "len": len,
    "ln": math.log,
    "log": math.log,
    "max": max,
    "mean": _mean,
    "min": min,
    "pow": pow,
    "round": round,
    "sin": math.sin,
    "sqrt": math.sqrt,
    "sum": sum,
    "tan": math.tan,
}

ALLOWED_CONSTANTS = {
    "e": math.e,
    "pi": math.pi,
}


class DisabledCalculationAdapter:
    def run(self, tasks: list[CalculationTask]) -> list[CalculationTask]:
        for task in tasks:
            task.status = "failed"
            task.notes = "Calculation MCP is disabled in the current backend settings."
            task.result_text = ""
            task.error_margin = "Unavailable because the calculation adapter is disabled."
        return tasks


class LocalCalculationAdapter:
    def run(self, tasks: list[CalculationTask]) -> list[CalculationTask]:
        for task in tasks:
            self._run_single(task)
        return tasks

    def _run_single(self, task: CalculationTask) -> None:
        try:
            validate_calculation_task(task)
            formula = normalize_formula_hint(task.formula_hint)
            variables = self._prepare_variables(task.input_params)
            result = self._evaluate_expression(formula, variables)

            task.status = "completed"
            task.validation_state = "validated"
            task.result_value = self._scalar_number(result)
            task.result_text = self._format_result(result)
            task.result_payload = self._build_result_payload(result, task.input_params)
            task.error_margin = "Exact deterministic evaluation over the provided parameters."
            task.notes = "Calculated locally by the backend calculation adapter."
            task.failure_reason = ""
            task.user_visible = True
        except Exception as error:
            message = str(error)
            is_validation_error = (
                "formula_hint" in message
                or "variable" in message.lower()
                or "formula" in message.lower()
                or "parameter" in message.lower()
                or "ASCII" in message
            )
            task.status = "rejected" if is_validation_error else "failed"
            task.validation_state = "rejected" if is_validation_error else "validated"
            task.result_value = None
            task.result_text = ""
            task.result_payload = {}
            task.error_margin = "Unavailable because the expression or parameters could not be evaluated."
            task.notes = f"Calculation failed: {error}"
            task.failure_reason = message
            task.user_visible = False

    def _evaluate_expression(self, expression: str, variables: dict[str, Any]) -> Any:
        parsed = ast.parse(expression, mode="eval")
        return self._eval_node(parsed.body, variables)

    def _eval_node(self, node: ast.AST, variables: dict[str, Any]) -> Any:
        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.Name):
            if node.id in variables:
                return variables[node.id]
            if node.id in ALLOWED_CONSTANTS:
                return ALLOWED_CONSTANTS[node.id]
            raise ValueError(f"Unsupported variable: {node.id}")

        if isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, variables)
            right = self._eval_node(node.right, variables)
            return self._eval_binary_operator(node.op, left, right)

        if isinstance(node, ast.UnaryOp):
            operand = self._eval_node(node.operand, variables)
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
            raise ValueError("Unsupported unary operator.")

        if isinstance(node, ast.Call):
            func_name = self._resolve_callable_name(node.func)
            if func_name not in ALLOWED_FUNCTIONS:
                raise ValueError(f"Unsupported function: {func_name}")
            args = [self._eval_node(arg, variables) for arg in node.args]
            return ALLOWED_FUNCTIONS[func_name](*args)

        if isinstance(node, ast.List):
            return [self._eval_node(item, variables) for item in node.elts]

        if isinstance(node, ast.Tuple):
            return tuple(self._eval_node(item, variables) for item in node.elts)

        if isinstance(node, ast.Dict):
            keys = [self._eval_node(key, variables) for key in node.keys]
            values = [self._eval_node(value, variables) for value in node.values]
            return dict(zip(keys, values))

        if isinstance(node, ast.Subscript):
            target = self._eval_node(node.value, variables)
            index = self._resolve_subscript(node.slice, variables)
            return target[index]

        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    @staticmethod
    def _eval_binary_operator(operator: ast.operator, left: Any, right: Any) -> Any:
        if isinstance(operator, ast.Add):
            return left + right
        if isinstance(operator, ast.Sub):
            return left - right
        if isinstance(operator, ast.Mult):
            return left * right
        if isinstance(operator, ast.Div):
            return left / right
        if isinstance(operator, ast.FloorDiv):
            return left // right
        if isinstance(operator, ast.Mod):
            return left % right
        if isinstance(operator, ast.Pow):
            return left**right
        raise ValueError("Unsupported binary operator.")

    def _resolve_subscript(self, node: ast.AST, variables: dict[str, Any]) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        return self._eval_node(node, variables)

    @staticmethod
    def _resolve_callable_name(node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        raise ValueError("Only direct function calls are allowed.")

    def _prepare_variables(self, params: dict[str, Any]) -> dict[str, Any]:
        return {
            key: self._normalize_value(value)
            for key, value in params.items()
            if isinstance(key, str) and key.strip()
        }

    def _normalize_value(self, value: Any) -> Any:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            normalized = value.strip().replace(",", "")
            if not normalized:
                return value
            try:
                if "." in normalized:
                    return float(normalized)
                return int(normalized)
            except ValueError:
                return value.strip()
        if isinstance(value, list):
            return [self._normalize_value(item) for item in value]
        if isinstance(value, tuple):
            return tuple(self._normalize_value(item) for item in value)
        if isinstance(value, dict):
            return {
                str(key): self._normalize_value(item)
                for key, item in value.items()
            }
        return value

    @staticmethod
    def _scalar_number(value: Any) -> float | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return None

    @staticmethod
    def _format_result(value: Any) -> str:
        if isinstance(value, bool):
            return str(value).lower()
        if isinstance(value, int):
            return str(value)
        if isinstance(value, float):
            if value.is_integer():
                return str(int(value))
            return f"{value:.6f}".rstrip("0").rstrip(".")
        if isinstance(value, (list, tuple)):
            return ", ".join(LocalCalculationAdapter._format_result(item) for item in value)
        if isinstance(value, dict):
            rendered = []
            for key, item in value.items():
                rendered.append(f"{key}={LocalCalculationAdapter._format_result(item)}")
            return ", ".join(rendered)
        return str(value)

    @staticmethod
    def _build_result_payload(result: Any, input_params: dict[str, Any]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "input_params": input_params,
        }

        if isinstance(result, list):
            payload["values"] = result
            labels = input_params.get("labels")
            if isinstance(labels, list) and len(labels) == len(result):
                payload["labels"] = labels
        elif isinstance(result, tuple):
            payload["values"] = list(result)
            labels = input_params.get("labels")
            if isinstance(labels, list) and len(labels) == len(result):
                payload["labels"] = labels
        elif isinstance(result, dict):
            payload.update(result)

        return payload
