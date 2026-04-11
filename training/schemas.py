from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PublicSource:
    source_id: str
    title: str
    source_name: str
    source_url: str
    category: str
    source_tier: str
    data_kind: str
    cadence: str
    freshness_budget_days: int
    verified_summary: str
    normalized_targets: tuple[str, ...] = ()
    asset_tags: tuple[str, ...] = ()
    task_tags: tuple[str, ...] = ()
    published_date: str = ""
    notes: str = ""


@dataclass(frozen=True)
class TrainingSample:
    task_type: str
    input_context: dict[str, Any]
    target_output: dict[str, Any]
    hard_constraints: list[str]
    source_refs: list[str]
    freshness_date: str
    teacher_version: str
    sample_origin: str


@dataclass(frozen=True)
class SyntheticCase:
    case_id: str
    problem_statement: str
    locale: str
    stress_tag: str
    selected_asset_ids: tuple[str, ...]
    intake_context: dict[str, Any]
    hard_constraints: tuple[str, ...]
    teacher_prompt: str


@dataclass(frozen=True)
class EvaluationSummary:
    total_examples: int
    json_schema_compliance_rate: float
    hard_constraint_violation_rate: float
    provenance_coverage_rate: float
    notes: list[str] = field(default_factory=list)

