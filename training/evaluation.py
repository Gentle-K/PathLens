from __future__ import annotations

from typing import Any

from training.schemas import EvaluationSummary


def _check_schema(task_type: str, prediction: dict[str, Any]) -> bool:
    if not isinstance(prediction, dict):
        return False
    if task_type == "clarify":
        return isinstance(prediction.get("questions"), list) or isinstance(prediction.get("clarification_questions"), list)
    if task_type == "plan":
        keys = {"clarification_questions", "search_tasks", "calculation_tasks", "chart_tasks", "ready_for_report"}
        return any(key in prediction for key in keys)
    if task_type == "report":
        return bool(prediction.get("summary")) and isinstance(prediction.get("markdown"), str)
    if task_type == "stress":
        return isinstance(prediction.get("stress_scenarios"), list)
    if task_type == "score_explain":
        return isinstance(prediction.get("asset_explanations"), list) or isinstance(prediction.get("top_risks"), list)
    return isinstance(prediction, dict)


def _has_provenance(prediction: dict[str, Any]) -> bool:
    keys = ("source_provenance_refs", "basis_refs", "source_refs")
    for key in keys:
        value = prediction.get(key)
        if isinstance(value, list) and any(str(item).strip() for item in value):
            return True
    if isinstance(prediction.get("stress_scenarios"), list):
        return all(
            isinstance(item, dict) and any(str(ref).strip() for ref in item.get("source_provenance_refs", []))
            for item in prediction["stress_scenarios"]
            if isinstance(item, dict)
        )
    return False


def _violates_constraints(prediction: dict[str, Any], constraints: list[str]) -> bool:
    allocations = prediction.get("recommended_allocations")
    if not isinstance(allocations, list):
        return False
    max_kyc = None
    for item in constraints:
        if item.startswith("minimum_kyc_level="):
            try:
                max_kyc = int(item.split("=", 1)[1])
            except ValueError:
                max_kyc = None
    if max_kyc is None:
        return False
    for allocation in allocations:
        if not isinstance(allocation, dict):
            continue
        required_level = allocation.get("kyc_required_level")
        target_weight = float(allocation.get("target_weight_pct", 0.0) or 0.0)
        if required_level is not None and int(required_level) > max_kyc and target_weight > 0:
            return True
    return False


def evaluate_predictions(
    rows: list[dict[str, Any]],
    *,
    prediction_key: str = "predicted_output",
) -> EvaluationSummary:
    total = len(rows)
    if total == 0:
        return EvaluationSummary(0, 0.0, 0.0, 0.0, ["No examples supplied."])

    schema_ok = 0
    provenance_ok = 0
    violations = 0
    for row in rows:
        task_type = str(row.get("task_type", "")).strip()
        prediction = row.get(prediction_key)
        if _check_schema(task_type, prediction):
            schema_ok += 1
        if isinstance(prediction, dict) and _has_provenance(prediction):
            provenance_ok += 1
        if isinstance(prediction, dict) and _violates_constraints(prediction, list(row.get("hard_constraints", []))):
            violations += 1

    return EvaluationSummary(
        total_examples=total,
        json_schema_compliance_rate=round(schema_ok / total, 4),
        hard_constraint_violation_rate=round(violations / total, 4),
        provenance_coverage_rate=round(provenance_ok / total, 4),
        notes=[
            "Schema compliance checks task-shaped JSON outputs.",
            "Hard-constraint violations currently enforce KYC gating when structured allocations are present.",
            "Provenance coverage checks explicit source refs on reports, stress outputs, and explanations.",
        ],
    )

