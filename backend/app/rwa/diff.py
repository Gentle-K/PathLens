from __future__ import annotations

from app.domain.models import AnalysisReport
from app.domain.rwa import (
    ComparableAllocationSnapshot,
    ComparableAssetSnapshot,
    ComparableReportSnapshot,
    DiffFieldChange,
    EvidenceDiffItem,
    ReanalysisDiff,
    RiskDiffItem,
    AllocationDiffItem,
    RwaIntakeContext,
)


COMPARABLE_CONTEXT_FIELDS = (
    ("investment_amount", "Capital"),
    ("base_currency", "Settlement currency"),
    ("holding_period_days", "Holding period"),
    ("risk_tolerance", "Risk preference"),
    ("liquidity_need", "Liquidity need"),
    ("minimum_kyc_level", "Minimum KYC"),
    ("include_non_production_assets", "Include demo/benchmark assets"),
    ("demo_mode", "Demo mode"),
    ("demo_scenario_id", "Demo scenario"),
)


def build_comparable_snapshot(
    report: AnalysisReport,
    *,
    intake_context: RwaIntakeContext,
) -> ComparableReportSnapshot:
    coverage_score = report.evidence_governance.overall_score if report.evidence_governance else 0.0
    evidence_conflict_count = len(report.evidence_governance.conflicts) if report.evidence_governance else 0
    return ComparableReportSnapshot(
        summary=report.summary,
        intake_context=intake_context.model_copy(deep=True),
        recommended_allocations=[
            ComparableAllocationSnapshot(
                asset_id=item.asset_id,
                asset_name=item.asset_name,
                target_weight_pct=item.target_weight_pct,
            )
            for item in report.recommended_allocations
        ],
        asset_snapshots=[
            ComparableAssetSnapshot(
                asset_id=item.asset_id,
                asset_name=item.name,
                overall_risk=item.risk_vector.overall,
                data_quality=item.risk_data_quality,
            )
            for item in report.asset_cards
        ],
        evidence_count=sum(1 for card in report.asset_cards for _ in card.evidence_refs),
        evidence_conflict_count=evidence_conflict_count,
        coverage_score=coverage_score,
        warnings=list(report.warnings),
    )


def build_reanalysis_diff(
    previous: ComparableReportSnapshot | None,
    current_report: AnalysisReport,
    *,
    current_context: RwaIntakeContext,
) -> ReanalysisDiff | None:
    if previous is None:
        return None

    changed_constraints = _build_constraint_changes(previous.intake_context, current_context)
    changed_weights = _build_weight_changes(previous, current_report)
    changed_risk = _build_risk_changes(previous, current_report)
    changed_evidence = _build_evidence_changes(previous, current_report)
    why_changed = _build_why_changed(changed_constraints, changed_weights, changed_risk, changed_evidence)

    top_previous = [
        f"{item.asset_name} {item.target_weight_pct:.1f}%"
        for item in sorted(previous.recommended_allocations, key=lambda item: item.target_weight_pct, reverse=True)[:3]
    ]
    top_current = [
        f"{item.asset_name} {item.target_weight_pct:.1f}%"
        for item in current_report.recommended_allocations[:3]
    ]

    summary = "No material changes detected."
    if why_changed:
        summary = why_changed[0]

    return ReanalysisDiff(
        previous_snapshot_at=previous.created_at,
        summary=summary,
        changed_constraints=changed_constraints,
        changed_weights=changed_weights,
        changed_risk=changed_risk,
        changed_evidence=changed_evidence,
        previous_recommendation=top_previous,
        current_recommendation=top_current,
        why_changed=why_changed,
    )


def _stringify_context_value(value) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _build_constraint_changes(
    previous: RwaIntakeContext,
    current: RwaIntakeContext,
) -> list[DiffFieldChange]:
    changes: list[DiffFieldChange] = []
    for field_name, label in COMPARABLE_CONTEXT_FIELDS:
        before = getattr(previous, field_name)
        after = getattr(current, field_name)
        if before == after:
            continue
        changes.append(
            DiffFieldChange(
                label=label,
                before=_stringify_context_value(before),
                after=_stringify_context_value(after),
                detail=f"{label} changed between analyses.",
            )
        )
    return changes


def _build_weight_changes(
    previous: ComparableReportSnapshot,
    current_report: AnalysisReport,
) -> list[AllocationDiffItem]:
    previous_map = {
        item.asset_id: item
        for item in previous.recommended_allocations
    }
    current_map = {
        item.asset_id: item
        for item in current_report.recommended_allocations
    }
    asset_ids = set(previous_map) | set(current_map)
    changes: list[AllocationDiffItem] = []
    for asset_id in asset_ids:
        before = previous_map.get(asset_id)
        after = current_map.get(asset_id)
        before_weight = before.target_weight_pct if before else 0.0
        after_weight = after.target_weight_pct if after else 0.0
        delta = round(after_weight - before_weight, 2)
        if abs(delta) < 0.1:
            continue
        asset_name = (after.asset_name if after else before.asset_name) if (after or before) else asset_id
        reason = ""
        if after and after.blocked_reason:
            reason = after.blocked_reason
        changes.append(
            AllocationDiffItem(
                asset_id=asset_id,
                asset_name=asset_name,
                before_weight_pct=round(before_weight, 2),
                after_weight_pct=round(after_weight, 2),
                delta_weight_pct=delta,
                reason=reason,
            )
        )
    changes.sort(key=lambda item: abs(item.delta_weight_pct), reverse=True)
    return changes


def _build_risk_changes(
    previous: ComparableReportSnapshot,
    current_report: AnalysisReport,
) -> list[RiskDiffItem]:
    previous_map = {item.asset_id: item for item in previous.asset_snapshots}
    changes: list[RiskDiffItem] = []
    for asset in current_report.asset_cards:
        before = previous_map.get(asset.asset_id)
        if before is None:
            continue
        delta = round(asset.risk_vector.overall - before.overall_risk, 2)
        if abs(delta) < 0.1:
            continue
        changes.append(
            RiskDiffItem(
                asset_id=asset.asset_id,
                asset_name=asset.name,
                before_overall=round(before.overall_risk, 2),
                after_overall=round(asset.risk_vector.overall, 2),
                delta_overall=delta,
            )
        )
    changes.sort(key=lambda item: abs(item.delta_overall), reverse=True)
    return changes


def _build_evidence_changes(
    previous: ComparableReportSnapshot,
    current_report: AnalysisReport,
) -> list[EvidenceDiffItem]:
    current_governance = current_report.evidence_governance
    if current_governance is None:
        return []

    current_coverage_map = {
        item.asset_id: item
        for item in current_governance.coverage
    }
    items: list[EvidenceDiffItem] = []
    for asset in current_report.asset_cards:
        coverage = current_coverage_map.get(asset.asset_id)
        if coverage is None:
            continue
        delta_coverage = round(coverage.coverage_score - previous.coverage_score, 2)
        delta_conflicts = len([item for item in current_governance.conflicts if item.asset_id == asset.asset_id]) - previous.evidence_conflict_count
        if abs(delta_coverage) < 0.05 and delta_conflicts == 0:
            continue
        items.append(
            EvidenceDiffItem(
                asset_id=asset.asset_id,
                asset_name=asset.name,
                before_coverage_score=round(previous.coverage_score, 2),
                after_coverage_score=round(coverage.coverage_score, 2),
                before_conflict_count=previous.evidence_conflict_count,
                after_conflict_count=len([item for item in current_governance.conflicts if item.asset_id == asset.asset_id]),
                summary="Evidence quality changed for this asset.",
            )
        )
    return items


def _build_why_changed(
    changed_constraints: list[DiffFieldChange],
    changed_weights: list[AllocationDiffItem],
    changed_risk: list[RiskDiffItem],
    changed_evidence: list[EvidenceDiffItem],
) -> list[str]:
    reasons: list[str] = []
    if changed_constraints:
        labels = ", ".join(change.label for change in changed_constraints[:3])
        reasons.append(f"Recommendation changed because the intake constraints changed: {labels}.")
    if changed_weights:
        top_shift = changed_weights[0]
        reasons.append(
            f"The largest portfolio shift was {top_shift.asset_name} ({top_shift.delta_weight_pct:+.1f}%)."
        )
    if changed_risk:
        top_risk = changed_risk[0]
        reasons.append(
            f"Risk scoring changed most for {top_risk.asset_name} ({top_risk.delta_overall:+.1f})."
        )
    if changed_evidence:
        reasons.append("Evidence freshness, coverage, or conflicts changed the confidence posture.")
    if not reasons:
        reasons.append("The new run produced effectively the same recommendation on the same comparable basis.")
    return reasons
