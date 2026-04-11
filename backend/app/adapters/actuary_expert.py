from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.adapters.llm_analysis import _is_rwa_session, _merged_rwa_context
from app.config import Settings
from app.domain.models import (
    AnalysisLoopPlan,
    AnalysisReport,
    AnalysisSession,
    SearchTask,
    SessionEvent,
)
from app.i18n import text_for_locale
from app.rwa.actuary_signals import (
    build_confidence_band,
    build_oracle_stress_score,
    build_reserve_backing_summary,
    build_stress_scenarios,
)
from app.rwa.actuary_source_registry import build_source_provenance_refs
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.engine import resolve_selected_assets


@dataclass(frozen=True)
class StudentModelManifest:
    model_id: str
    teacher_version: str
    supported_task_types: tuple[str, ...]
    locale_bias: str = "zh"

    @classmethod
    def from_path(cls, path: Path) -> "StudentModelManifest":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            model_id=str(payload.get("model_id", path.stem)),
            teacher_version=str(payload.get("teacher_version", "unknown")),
            supported_task_types=tuple(str(item) for item in payload.get("supported_task_types", [])),
            locale_bias=str(payload.get("locale_bias", "zh")),
        )


class RwaActuarialExpertAdapter:
    def __init__(self, *, delegate: object, settings: Settings) -> None:
        self.delegate = delegate
        self.settings = settings

    def generate_initial_questions(self, session: AnalysisSession):
        self._record_route(session, stage="clarify")
        return self.delegate.generate_initial_questions(session)

    def plan_next_round(self, session: AnalysisSession) -> AnalysisLoopPlan:
        self._record_route(session, stage="plan")
        plan = self.delegate.plan_next_round(session)
        if not _is_rwa_session(session):
            return plan

        extra_tasks = self._supplemental_search_tasks(session)
        if extra_tasks:
            existing_keys = {
                (task.search_topic.strip().lower(), task.search_goal.strip().lower())
                for task in plan.search_tasks
            }
            for task in extra_tasks:
                key = (task.search_topic.strip().lower(), task.search_goal.strip().lower())
                if key not in existing_keys:
                    plan.search_tasks.append(task)
                    existing_keys.add(key)
        return plan

    def build_report(self, session: AnalysisSession) -> AnalysisReport:
        self._record_route(session, stage="report")
        report = self.delegate.build_report(session)
        if not _is_rwa_session(session):
            return report

        chain_config = build_chain_config(self.settings)
        asset_library = build_asset_library(chain_config, locale=session.locale)
        assets = resolve_selected_assets(
            session.mode,
            session.problem_statement,
            _merged_rwa_context(session),
            asset_library,
        )
        source_refs = report.source_provenance_refs or build_source_provenance_refs(assets)
        report.source_provenance_refs = source_refs
        if report.reserve_backing_summary is None:
            report.reserve_backing_summary = build_reserve_backing_summary(assets, source_refs)
        if not report.stress_scenarios:
            report.stress_scenarios = build_stress_scenarios(
                report.asset_cards,
                report.recommended_allocations,
                source_refs,
            )
        if report.confidence_band is None:
            report.confidence_band = build_confidence_band(
                report.simulations,
                report.recommended_allocations,
                note="Weighted from the report simulations after deterministic eligibility and fee constraints were applied.",
            )
        if report.oracle_stress_score is None:
            report.oracle_stress_score = build_oracle_stress_score(
                report.asset_cards,
                report.recommended_allocations,
            )
        return report

    def _record_route(self, session: AnalysisSession, *, stage: str) -> None:
        if not _is_rwa_session(session):
            return
        manifest = self._student_manifest()
        route = (
            "student_manifest_shadow"
            if self.settings.actuary_expert_mode not in {"", "off", "disabled"}
            and manifest is not None
            else "delegate_fallback"
        )
        session.events.append(
            SessionEvent(
                kind="actuary_expert_route_selected",
                payload={
                    "stage": stage,
                    "route": route,
                    "expert_mode": self.settings.actuary_expert_mode,
                    "student_model_path": self.settings.actuary_student_model_path,
                    "teacher_provider": self.settings.actuary_teacher_provider,
                    "eval_set_version": self.settings.actuary_eval_set_version,
                    "student_model_id": manifest.model_id if manifest else "",
                    "teacher_version": manifest.teacher_version if manifest else "",
                },
            )
        )

    def _supplemental_search_tasks(self, session: AnalysisSession) -> list[SearchTask]:
        if self.settings.actuary_expert_mode in {"", "off", "disabled"}:
            return []

        chain_config = build_chain_config(self.settings)
        asset_library = build_asset_library(chain_config, locale=session.locale)
        assets = resolve_selected_assets(
            session.mode,
            session.problem_statement,
            _merged_rwa_context(session),
            asset_library,
        )
        has_stable_sleeve = any(asset.asset_type.value in {"stablecoin", "mmf"} for asset in assets)
        has_oracle_dependency = any(asset.oracle_count > 0 for asset in assets)
        tasks: list[SearchTask] = []
        if has_stable_sleeve:
            tasks.append(
                SearchTask(
                    search_topic="Stablecoin reserve quality",
                    search_goal=text_for_locale(
                        session.locale,
                        "补充稳定币或 MMF 的储备、赎回与披露证据。",
                        "Collect reserve, redemption, and disclosure evidence for stablecoin and MMF sleeves.",
                    ),
                    search_scope=text_for_locale(
                        session.locale,
                        "优先官方储备报告、监管说明与一级来源。",
                        "Prioritize official reserve reports, regulatory guidance, and primary-source attestations.",
                    ),
                    suggested_queries=["USDC reserve report", "Tether reserve attestation", "tokenized money market fund BIS"],
                    required_fields=["reserve backing", "redemption rights", "disclosure cadence"],
                    freshness_requirement="high",
                    task_group="actuary-reserve",
                    notes="Expert-mode reserve diligence supplement.",
                )
            )
        if has_oracle_dependency:
            tasks.append(
                SearchTask(
                    search_topic="Oracle resilience",
                    search_goal=text_for_locale(
                        session.locale,
                        "补充预言机偏移、停更和操纵风险依据。",
                        "Collect evidence on oracle deviation, staleness, and manipulation risk.",
                    ),
                    search_scope=text_for_locale(
                        session.locale,
                        "优先官方 oracle 文档与学术/监管材料。",
                        "Prioritize official oracle docs plus research or supervisory materials.",
                    ),
                    suggested_queries=["HashKey Chain oracle docs", "oracle deviation risk paper", "DeFi oracle manipulation risk"],
                    required_fields=["feed governance", "update cadence", "fallback path"],
                    freshness_requirement="medium",
                    task_group="actuary-oracle",
                    notes="Expert-mode oracle stress supplement.",
                )
            )
        return tasks

    def _student_manifest(self) -> StudentModelManifest | None:
        path_value = self.settings.actuary_student_model_path.strip()
        if not path_value:
            return None
        path = Path(path_value)
        if not path.is_absolute():
            path = Path.cwd() / path
        if not path.exists():
            return None
        try:
            return StudentModelManifest.from_path(path)
        except Exception:
            return None
