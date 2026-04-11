from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from training.schemas import TrainingSample


def _operation_to_task_type(operation: str) -> str | None:
    normalized = operation.strip().lower()
    if "clarification" in normalized:
        return "clarify"
    if "analysis round" in normalized or "planning" in normalized:
        return "plan"
    if "final report" in normalized or "report" in normalized:
        return "report"
    return None


def _source_refs_from_report(report: dict[str, Any]) -> list[str]:
    refs = [str(item.get("ref_id", "")).strip() for item in report.get("source_provenance_refs", []) if isinstance(item, dict)]
    if refs:
        return [ref for ref in refs if ref]
    refs = []
    for card in report.get("asset_cards", []):
        if isinstance(card, dict):
            refs.extend(str(value).strip() for value in card.get("evidence_refs", []) if str(value).strip())
    return sorted(set(refs))


def _hard_constraints(session: dict[str, Any], report: dict[str, Any]) -> list[str]:
    intake = session.get("intake_context", {}) if isinstance(session.get("intake_context"), dict) else {}
    constraints = [
        f"risk_tolerance={intake.get('risk_tolerance', 'balanced')}",
        f"liquidity_need={intake.get('liquidity_need', 't_plus_3')}",
        f"minimum_kyc_level={intake.get('minimum_kyc_level', 0)}",
        "respect_minimum_ticket_thresholds",
        "respect_kyc_and_access_gating",
    ]
    for card in report.get("asset_cards", []):
        if not isinstance(card, dict):
            continue
        minimum_ticket = card.get("metadata", {}).get("minimum_ticket_usd") if isinstance(card.get("metadata"), dict) else None
        if minimum_ticket:
            constraints.append(f"{card.get('asset_id', 'asset')}:minimum_ticket_usd={minimum_ticket}")
        kyc_level = card.get("kyc_required_level")
        if kyc_level is not None:
            constraints.append(f"{card.get('asset_id', 'asset')}:kyc_required_level={kyc_level}")
    return sorted(set(str(item) for item in constraints if str(item).strip()))


def _score_explain_target(report: dict[str, Any]) -> dict[str, Any]:
    cards = report.get("asset_cards", [])
    return {
        "asset_explanations": [
            {
                "asset_id": card.get("asset_id"),
                "asset_name": card.get("name"),
                "overall_risk": card.get("risk_vector", {}).get("overall"),
                "top_risks": sorted(
                    (
                        {
                            "dimension": item.get("dimension"),
                            "score": item.get("normalized_score"),
                            "weight": item.get("weight"),
                            "basis_refs": item.get("evidence_refs", []),
                        }
                        for item in card.get("risk_breakdown", [])
                        if isinstance(item, dict)
                    ),
                    key=lambda item: float(item.get("score") or 0) * float(item.get("weight") or 0),
                    reverse=True,
                )[:2],
            }
            for card in cards
            if isinstance(card, dict)
        ],
        "source_provenance_refs": _source_refs_from_report(report),
    }


def _stress_target(report: dict[str, Any]) -> dict[str, Any]:
    if report.get("stress_scenarios"):
        return {
            "stress_scenarios": report.get("stress_scenarios", []),
            "source_provenance_refs": _source_refs_from_report(report),
        }
    simulations = [item for item in report.get("simulations", []) if isinstance(item, dict)]
    low_tail = min((float(item.get("return_pct_low", 0.0) or 0.0) for item in simulations), default=0.0)
    exit_days = max((float(item.get("holding_period_days", 0.0) or 0.0) for item in simulations), default=0.0)
    return {
        "stress_scenarios": [
            {
                "scenario_key": "legacy-tail-risk",
                "narrative": "Legacy session without explicit stress scenarios; use the worst simulated tail and holding horizon as the proxy stress anchor.",
                "portfolio_impact_pct": low_tail,
                "liquidity_impact_days": exit_days,
            }
        ],
        "source_provenance_refs": _source_refs_from_report(report),
    }


def _sample_to_dict(sample: TrainingSample) -> dict[str, Any]:
    return {
        "task_type": sample.task_type,
        "input_context": sample.input_context,
        "target_output": sample.target_output,
        "hard_constraints": sample.hard_constraints,
        "source_refs": sample.source_refs,
        "freshness_date": sample.freshness_date,
        "teacher_version": sample.teacher_version,
        "sample_origin": sample.sample_origin,
    }


def extract_training_samples(db_path: Path) -> list[dict[str, Any]]:
    with sqlite3.connect(db_path) as connection:
        cursor = connection.cursor()
        try:
            rows = cursor.execute(
                "SELECT payload_json FROM sessions ORDER BY updated_at DESC"
            ).fetchall()
        finally:
            cursor.close()

    samples: list[dict[str, Any]] = []
    for (payload_json,) in rows:
        session = json.loads(payload_json)
        freshness_date = str(session.get("updated_at", "")).strip()
        report = session.get("report") if isinstance(session.get("report"), dict) else {}
        teacher_version = "deterministic-rwa-engine-v1" if report.get("asset_cards") else "repo-session-v1"
        shared_input = {
            "mode": session.get("mode"),
            "locale": session.get("locale", "zh"),
            "problem_statement": session.get("problem_statement", ""),
            "answers": session.get("answers", []),
            "evidence_items": session.get("evidence_items", [])[:12],
            "major_conclusions": session.get("major_conclusions", [])[:12],
        }
        report_refs = _source_refs_from_report(report)
        hard_constraints = _hard_constraints(session, report)

        for event in session.get("events", []):
            if not isinstance(event, dict):
                continue
            payload = event.get("payload", {}) if isinstance(event.get("payload"), dict) else {}
            if event.get("kind") == "llm_response_parsed":
                task_type = _operation_to_task_type(str(payload.get("operation", "")))
                parsed_json = payload.get("parsed_json")
                if task_type and isinstance(parsed_json, dict):
                    samples.append(
                        _sample_to_dict(
                            TrainingSample(
                                task_type=task_type,
                                input_context=shared_input | {"operation": payload.get("operation", "")},
                                target_output=parsed_json,
                                hard_constraints=hard_constraints + ["return_valid_json_object"],
                                source_refs=report_refs,
                                freshness_date=freshness_date,
                                teacher_version=teacher_version,
                                sample_origin="repo_events",
                            )
                        )
                    )
            if event.get("kind") in {"llm_retrying_after_invalid_output", "llm_request_failed"}:
                task_type = _operation_to_task_type(str(payload.get("operation", ""))) or "plan"
                samples.append(
                    _sample_to_dict(
                        TrainingSample(
                            task_type=task_type,
                            input_context=shared_input | {"operation": payload.get("operation", ""), "failure_payload": payload},
                            target_output={
                                "repair_directive": "Return exactly one valid JSON object that matches the requested schema.",
                                "error_type": payload.get("error_type", ""),
                                "error_message": payload.get("error_message", ""),
                            },
                            hard_constraints=hard_constraints + ["return_valid_json_object", "no_markdown_fences", "no_duplicate_keys"],
                            source_refs=report_refs,
                            freshness_date=freshness_date,
                            teacher_version=teacher_version,
                            sample_origin="repo_failures",
                        )
                    )
                )

        if report:
            samples.append(
                _sample_to_dict(
                    TrainingSample(
                        task_type="report",
                        input_context=shared_input,
                        target_output=report,
                        hard_constraints=hard_constraints + ["key_conclusions_must_have_source_refs"],
                        source_refs=report_refs,
                        freshness_date=freshness_date,
                        teacher_version=teacher_version,
                        sample_origin="repo_report",
                    )
                )
            )
            if report.get("asset_cards"):
                samples.append(
                    _sample_to_dict(
                        TrainingSample(
                            task_type="score_explain",
                            input_context=shared_input | {"report_summary": report.get("summary", "")},
                            target_output=_score_explain_target(report),
                            hard_constraints=hard_constraints + ["explain_top_risk_dimensions"],
                            source_refs=report_refs,
                            freshness_date=freshness_date,
                            teacher_version=teacher_version,
                            sample_origin="repo_report",
                        )
                    )
                )
                samples.append(
                    _sample_to_dict(
                        TrainingSample(
                            task_type="stress",
                            input_context=shared_input | {"report_summary": report.get("summary", "")},
                            target_output=_stress_target(report),
                            hard_constraints=hard_constraints + ["stress_output_requires_source_refs"],
                            source_refs=report_refs,
                            freshness_date=freshness_date,
                            teacher_version=teacher_version,
                            sample_origin="repo_report",
                        )
                    )
                )
    return samples
