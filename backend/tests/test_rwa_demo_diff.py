import unittest
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.domain.models import AnalysisMode, EvidenceItem, SessionStatus
from app.domain.rwa import (
    EvidenceFactType,
    LiquidityNeed,
    RiskTolerance,
    RwaIntakeContext,
)
from app.persistence.memory import InMemorySessionRepository
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.demo import build_demo_scenarios
from app.rwa.diff import build_reanalysis_diff
from app.rwa.engine import build_rwa_report
from app.rwa.evidence import build_evidence_governance, enrich_report_evidence
from app.services.audit import AuditLogService
from app.services.sessions import SessionService


class RepositoryWithAudit(InMemorySessionRepository):
    def __init__(self) -> None:
        super().__init__()
        self._audit_logs = {}

    def save_audit_log(self, entry):
        self._audit_logs[entry.log_id] = entry
        return entry

    def list_audit_logs(self, limit: int = 200):
        return list(self._audit_logs.values())[:limit]

    def get_audit_log(self, log_id: str):
        return self._audit_logs.get(log_id)


def _settings():
    return Settings.from_env()


def _chain_config():
    return build_chain_config(_settings())


def _asset_library(locale="en"):
    return build_asset_library(_chain_config(), locale=locale)


class DemoModeTests(unittest.TestCase):
    def test_demo_mode_is_deterministic_across_runs(self):
        chain_config = _chain_config()
        asset_library = _asset_library()
        scenario = next(
            item
            for item in build_demo_scenarios(locale="en")
            if item.scenario_id == "conservative-10000-usdt"
        )
        context = scenario.intake_context.model_copy(deep=True)

        report_one, _ = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement=scenario.problem_statement,
            context=context,
            chain_config=chain_config,
            asset_library=asset_library,
            locale="en",
        )
        report_two, _ = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement=scenario.problem_statement,
            context=context,
            chain_config=chain_config,
            asset_library=asset_library,
            locale="en",
        )

        self.assertEqual(report_one.summary, report_two.summary)
        self.assertEqual(
            report_one.simulations[0].ending_value_base,
            report_two.simulations[0].ending_value_base,
        )
        self.assertEqual(
            report_one.comparison_matrix.rows[0].cells[0].display_value,
            report_two.comparison_matrix.rows[0].cells[0].display_value,
        )


class EvidenceGovernanceTests(unittest.TestCase):
    def test_evidence_governance_detects_stale_and_conflicting_facts(self):
        asset = _asset_library()[0]
        reference_time = datetime(2026, 4, 11, 12, 0, tzinfo=timezone.utc)
        stale_time = reference_time - timedelta(days=10)

        items = [
            EvidenceItem(
                asset_id=asset.asset_id,
                title="Primary evidence",
                source_url="https://example.com/primary",
                source_name="Primary",
                fetched_at=stale_time,
                summary="Primary summary",
                extracted_facts=[
                    "Earliest exit: T+0",
                    "KYC requirement: 0",
                    "Onchain verified: yes",
                    "Issuer disclosed: yes",
                    "Estimated all-in cost: 10 bps over a 30d hold",
                ],
                confidence=0.9,
                fact_type=EvidenceFactType.ONCHAIN_VERIFIED_FACT,
            ),
            EvidenceItem(
                asset_id=asset.asset_id,
                title="Secondary evidence",
                source_url="https://example.com/secondary",
                source_name="Secondary",
                fetched_at=reference_time,
                summary="Secondary summary",
                extracted_facts=[
                    "Earliest exit: T+2",
                    "KYC requirement: 0",
                    "Onchain verified: no",
                    "Issuer disclosed: yes",
                    "Estimated all-in cost: 20 bps over a 30d hold",
                ],
                confidence=0.7,
                fact_type=EvidenceFactType.OFFCHAIN_DISCLOSED_FACT,
            ),
        ]

        enriched = enrich_report_evidence(items, reference_time=reference_time)
        governance = build_evidence_governance(
            items,
            [asset],
            reference_time=reference_time,
        )

        self.assertEqual("stale", enriched[0].freshness.bucket.value)
        self.assertTrue(enriched[1].conflict_keys)
        self.assertGreater(len(governance.conflicts), 0)
        self.assertGreater(governance.coverage[0].coverage_score, 0.5)


class ReanalysisDiffTests(unittest.TestCase):
    def test_request_more_follow_up_persists_snapshot_and_diff(self):
        repository = RepositoryWithAudit()
        audit_log_service = AuditLogService(repository)
        session_service = SessionService(repository, audit_log_service)
        chain_config = _chain_config()
        asset_library = _asset_library()

        context = RwaIntakeContext(
            investment_amount=10_000,
            holding_period_days=90,
            risk_tolerance=RiskTolerance.BALANCED,
            liquidity_need=LiquidityNeed.T_PLUS_3,
        )
        session = session_service.create_session(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Build an RWA allocation.",
            owner_client_id="client-1",
            locale="en",
            intake_context=context,
            ip_address="127.0.0.1",
        )
        report, _ = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement=session.problem_statement,
            context=context,
            chain_config=chain_config,
            asset_library=asset_library,
            locale="en",
            oracle_snapshots=[],
        )
        session.report = report
        session.status = SessionStatus.COMPLETED
        repository.save(session)

        updated = session_service.request_more_follow_up(session.session_id)
        self.assertIsNotNone(updated)
        self.assertEqual(1, len(updated.report_snapshots))

        changed_context = context.model_copy(deep=True)
        changed_context.liquidity_need = LiquidityNeed.INSTANT
        changed_report, _ = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement=session.problem_statement,
            context=changed_context,
            chain_config=chain_config,
            asset_library=asset_library,
            locale="en",
            oracle_snapshots=[],
        )
        diff = build_reanalysis_diff(
            updated.report_snapshots[-1],
            changed_report,
            current_context=changed_context,
        )

        self.assertIsNotNone(diff)
        self.assertGreater(len(diff.changed_constraints), 0)
        self.assertGreater(len(diff.why_changed), 0)


if __name__ == "__main__":
    unittest.main()
