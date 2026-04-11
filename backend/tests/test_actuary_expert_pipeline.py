"""Regression tests for the RWA actuary expert and training pipeline."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.adapters.actuary_expert import RwaActuarialExpertAdapter
from app.adapters.llm_analysis import MockAnalysisAdapter
from app.config import Settings
from app.domain.models import AnalysisMode, AnalysisSession, SessionEvent, SessionStatus
from app.domain.rwa import LiquidityNeed, RiskTolerance, RwaIntakeContext
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.engine import build_rwa_report
from training.evaluation import evaluate_predictions
from training.public_etl import refresh_public_corpus
from training.schemas import PublicSource
from training.source_registry import (
    build_normalized_tables,
    load_public_sources,
    validate_public_sources,
)
from training.supervised_extractor import extract_training_samples
from training.synthetic_cases import (
    KYC_STATES,
    LIQUIDITY_WINDOWS,
    RISK_TOLERANCES,
    STRESS_TAGS,
    generate_case_grid,
)
from training.utils import read_jsonl


def _settings() -> Settings:
    return Settings.from_env()


def _context() -> RwaIntakeContext:
    return RwaIntakeContext(
        investment_amount=10000.0,
        base_currency="USDT",
        holding_period_days=30,
        risk_tolerance=RiskTolerance.BALANCED,
        liquidity_need=LiquidityNeed.T_PLUS_3,
    )


class SourceRegistryTests(unittest.TestCase):
    def test_public_sources_validate_and_build_normalized_tables(self):
        sources = load_public_sources()
        self.assertEqual([], validate_public_sources(sources))
        tables = build_normalized_tables(sources)

        self.assertEqual(
            {
                "asset_snapshot",
                "market_series",
                "reserve_backing",
                "regulatory_constraints",
                "source_provenance",
            },
            set(tables),
        )
        self.assertGreater(len(tables["source_provenance"]), 0)
        self.assertGreater(len(tables["asset_snapshot"]), 0)
        self.assertIn("captured_at", tables["source_provenance"][0])
        self.assertIn("verified_summary", tables["source_provenance"][0])

    def test_stale_source_is_rejected(self):
        stale = PublicSource(
            source_id="stale-demo",
            title="Stale demo",
            source_name="Demo",
            source_url="https://example.com/stale",
            category="market_data",
            source_tier="official",
            data_kind="time_series",
            cadence="daily",
            freshness_budget_days=7,
            verified_summary="Used to test freshness rejection.",
            normalized_targets=("market_series",),
            published_date="2026-03-01",
        )
        errors = validate_public_sources([stale], today=date(2026, 4, 12))
        self.assertTrue(any("Stale source:" in error for error in errors))

    def test_refresh_public_corpus_writes_manifest_and_tables(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_dir = Path(tmp_dir)
            manifest = refresh_public_corpus(output_dir)

            self.assertEqual(len(load_public_sources()), manifest["source_count"])
            self.assertTrue((output_dir / "manifest.json").exists())
            self.assertTrue((output_dir / "source_provenance.jsonl").exists())


class RwaReportSignalTests(unittest.TestCase):
    def test_build_rwa_report_includes_actuarial_signals(self):
        settings = _settings()
        chain_config = build_chain_config(settings)
        library = build_asset_library(chain_config, locale="en")
        report, _ = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
            context=_context(),
            chain_config=chain_config,
            asset_library=library,
            locale="en",
            oracle_snapshots=[],
        )

        self.assertIsNotNone(report.confidence_band)
        self.assertIsNotNone(report.reserve_backing_summary)
        self.assertIsNotNone(report.oracle_stress_score)
        self.assertGreaterEqual(len(report.stress_scenarios), 4)
        self.assertGreater(len(report.source_provenance_refs), 0)
        self.assertTrue(all(item.source_provenance_refs for item in report.stress_scenarios))


class ExpertAdapterTests(unittest.TestCase):
    def test_expert_adapter_adds_route_events_and_supplemental_tasks(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            manifest_path = Path(tmp_dir) / "student_manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "model_id": "actuary-rwa-student-v1",
                        "teacher_version": "teacher-rwa-v1",
                        "supported_task_types": [
                            "clarify",
                            "plan",
                            "stress",
                            "score_explain",
                            "report",
                        ],
                        "locale_bias": "zh",
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {
                    "ACTUARY_EXPERT_MODE": "shadow",
                    "ACTUARY_STUDENT_MODEL_PATH": str(manifest_path),
                    "ACTUARY_TEACHER_PROVIDER": "openai",
                    "ACTUARY_EVAL_SET_VERSION": "v1",
                },
                clear=False,
            ):
                adapter = RwaActuarialExpertAdapter(
                    delegate=MockAnalysisAdapter(),
                    settings=Settings.from_env(),
                )
                session = AnalysisSession(
                    owner_client_id="expert-user",
                    mode=AnalysisMode.MULTI_OPTION,
                    locale="en",
                    problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                    intake_context=_context(),
                    status=SessionStatus.CLARIFYING,
                )

                plan = adapter.plan_next_round(session)
                self.assertIn("actuary-reserve", {task.task_group for task in plan.search_tasks})
                self.assertIn("actuary-oracle", {task.task_group for task in plan.search_tasks})

                report = adapter.build_report(session)
                self.assertIsNotNone(report.confidence_band)
                self.assertGreater(len(report.source_provenance_refs), 0)

                route_events = [
                    event for event in session.events if event.kind == "actuary_expert_route_selected"
                ]
                self.assertGreaterEqual(len(route_events), 2)
                self.assertTrue(
                    any(
                        event.payload.get("student_model_id") == "actuary-rwa-student-v1"
                        for event in route_events
                    )
                )


class SupervisedExtractorTests(unittest.TestCase):
    def test_extract_training_samples_covers_repo_and_failure_cases(self):
        settings = _settings()
        chain_config = build_chain_config(settings)
        library = build_asset_library(chain_config, locale="en")
        report, evidence = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
            context=_context(),
            chain_config=chain_config,
            asset_library=library,
            locale="en",
            oracle_snapshots=[],
        )
        session = AnalysisSession(
            owner_client_id="trainer",
            mode=AnalysisMode.MULTI_OPTION,
            locale="en",
            problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
            intake_context=_context(),
            status=SessionStatus.COMPLETED,
            evidence_items=evidence,
            report=report,
            events=[
                SessionEvent(
                    kind="llm_response_parsed",
                    payload={
                        "operation": "generate initial clarification questions",
                        "parsed_json": {
                            "questions": [
                                {
                                    "question_text": "What is your maximum exit window?",
                                    "purpose": "Bound liquidity risk.",
                                }
                            ]
                        },
                    },
                ),
                SessionEvent(
                    kind="llm_response_parsed",
                    payload={
                        "operation": "analysis round planning",
                        "parsed_json": {
                            "search_tasks": [
                                {"search_topic": "Stablecoin reserve quality"}
                            ],
                            "ready_for_report": False,
                        },
                    },
                ),
                SessionEvent(
                    kind="llm_retrying_after_invalid_output",
                    payload={
                        "operation": "build final report",
                        "error_type": "json_decode_error",
                        "error_message": "Invalid JSON object returned.",
                    },
                ),
            ],
        )

        fd, raw_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        db_path = Path(raw_path)
        try:
            with sqlite3.connect(db_path) as connection:
                connection.execute(
                    """
                    CREATE TABLE sessions (
                        session_id TEXT PRIMARY KEY,
                        owner_client_id TEXT NOT NULL,
                        mode TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        payload_json TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO sessions (
                        session_id,
                        owner_client_id,
                        mode,
                        status,
                        created_at,
                        updated_at,
                        payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session.session_id,
                        session.owner_client_id,
                        session.mode.value,
                        session.status.value,
                        session.created_at.isoformat(),
                        session.updated_at.isoformat(),
                        session.model_dump_json(),
                    ),
                )
                connection.commit()

            samples = extract_training_samples(db_path)
        finally:
            try:
                db_path.unlink()
            except FileNotFoundError:
                pass
            except PermissionError:
                pass

        task_types = {sample["task_type"] for sample in samples}
        self.assertTrue({"clarify", "plan", "report", "score_explain", "stress"}.issubset(task_types))
        self.assertIn("repo_failures", {sample["sample_origin"] for sample in samples})


class SyntheticCaseTests(unittest.TestCase):
    def test_generate_case_grid_covers_all_assets_and_fixed_axes(self):
        settings = _settings()
        assets = build_asset_library(build_chain_config(settings), locale="en")
        cases = generate_case_grid(locale="en")
        expected = (
            len(assets)
            * len(RISK_TOLERANCES)
            * len(LIQUIDITY_WINDOWS)
            * len(KYC_STATES)
            * len(STRESS_TAGS)
        )

        self.assertEqual(expected, len(cases))
        self.assertEqual({"synthetic_grid"}, {row["sample_origin"] for row in cases})
        self.assertEqual(1, len(cases[0]["selected_asset_ids"]))


class EvaluationTests(unittest.TestCase):
    def test_gold_eval_cases_score_cleanly_against_target_output(self):
        rows = read_jsonl(REPO_ROOT / "training" / "eval" / "gold_eval_cases.jsonl")
        summary = evaluate_predictions(rows, prediction_key="target_output")

        self.assertEqual(1.0, summary.json_schema_compliance_rate)
        self.assertEqual(0.0, summary.hard_constraint_violation_rate)
        self.assertGreater(summary.provenance_coverage_rate, 0.5)


if __name__ == "__main__":
    unittest.main()
