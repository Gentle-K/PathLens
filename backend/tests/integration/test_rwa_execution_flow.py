from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import Mock, patch

from app.domain.models import AnalysisMode
from app.domain.rwa import KycOnchainResult, KycStatus, PositionSnapshot, WalletBalance
from tests.support import build_test_services, complete_session_via_api, patched_test_client


ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
TX_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"


def _session_payload(problem_statement: str, *, mode: str = "strategy_compare"):
    return {
        "mode": mode,
        "locale": "en",
        "problem_statement": problem_statement,
        "intake_context": {
            "investment_amount": 10000,
            "base_currency": "USDT",
            "preferred_asset_ids": [],
            "holding_period_days": 30,
            "risk_tolerance": "balanced",
            "liquidity_need": "t_plus_3",
            "minimum_kyc_level": 0,
            "wallet_address": ADDRESS,
            "wants_onchain_attestation": True,
            "additional_constraints": "",
        },
    }


def _kyc(level: int = 2, status: KycStatus = KycStatus.APPROVED) -> KycOnchainResult:
    return KycOnchainResult(
        wallet_address=ADDRESS,
        network="testnet",
        contract_address="0xkyc",
        status=status,
        is_human=True,
        level=level,
        fetched_at=datetime.now(timezone.utc),
    )


class RwaExecutionFlowTests(unittest.TestCase):
    def test_wallet_summary_flows_into_eligible_catalog(self):
        services = build_test_services()
        services.wallet_service.build_wallet_summary = Mock(
            return_value=(
                "testnet",
                [
                    WalletBalance(
                        symbol="USDT",
                        amount=12000,
                        chain_id=133,
                        contract_address="0xusdt",
                        usd_value=12000,
                        price=1.0,
                    )
                ],
                _kyc(level=2),
                False,
                datetime.now(timezone.utc),
            )
        )

        with patched_test_client(services) as client:
            summary = client.get(f"/api/wallet/summary?address={ADDRESS}&network=testnet")
            self.assertEqual(200, summary.status_code)
            self.assertEqual(2, summary.json()["kyc"]["level"])

            created = client.post(
                "/api/sessions",
                json=_session_payload(
                    "Build a 30-day HashKey Chain RWA allocation for treasury cash."
                ),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            session = services.session_service.get_session(session_id)
            session.wallet_address = ADDRESS
            session.kyc_level = 2
            session.kyc_status = "approved"
            session.investor_type = "professional"
            session.jurisdiction = "hk"
            session.ticket_size = 10000
            session.source_asset = "USDT"
            session.source_chain = "hashkey"
            services.session_service.repository.save(session)

            eligible = client.get(
                f"/api/rwa/eligible-catalog?address={ADDRESS}&session_id={session_id}&network=testnet"
            )
            self.assertEqual(200, eligible.status_code)
            payload = eligible.json()
            self.assertIn("eligible", payload)
            self.assertIn("conditional", payload)
            self.assertIn("blocked", payload)
            self.assertGreater(len(payload["eligible"]), 0)
            self.assertIn("status", payload["eligible"][0]["decision"])

    def test_execute_then_anchor_write_back_records_receipts_and_monitoring(self):
        services = build_test_services()
        services.wallet_service.build_wallet_positions = Mock(
            return_value=(
                "testnet",
                [
                    PositionSnapshot(
                        asset_id="cpic-estable-mmf",
                        asset_name="CPIC Estable MMF",
                        chain_id=177,
                        contract_address="0xmmf",
                        wallet_address=ADDRESS,
                        current_balance=9980,
                        latest_nav_or_price=1.002,
                        current_value=0,
                        cost_basis=0,
                        unrealized_pnl=0,
                        accrued_yield=0,
                        next_redemption_window="T+2",
                        oracle_staleness_flag=False,
                        kyc_change_flag=False,
                    )
                ],
                datetime.now(timezone.utc),
            )
        )

        with patched_test_client(services) as client:
            created = client.post(
                "/api/sessions",
                json=_session_payload(
                    "Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                    mode=AnalysisMode.STRATEGY_COMPARE.value,
                ),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            completed = complete_session_via_api(
                client,
                session_id,
                answer_value="Use a professional investor profile and preserve T+3 liquidity.",
            )
            self.assertEqual("READY_FOR_EXECUTION", completed["status"])

            session = services.session_service.get_session(session_id)
            session.wallet_address = ADDRESS
            session.kyc_level = 2
            session.kyc_status = "approved"
            session.investor_type = "professional"
            session.jurisdiction = "hk"
            session.ticket_size = 10000
            session.source_asset = "USDT"
            session.source_chain = "hashkey"
            services.session_service.repository.save(session)

            execute = client.post(
                "/api/rwa/execute",
                json={
                    "session_id": session_id,
                    "source_asset": "USDT",
                    "target_asset": "cpic-estable-mmf",
                    "amount": 10000,
                    "wallet_address": ADDRESS,
                    "source_chain": "hashkey",
                    "include_attestation": True,
                    "generate_only": True,
                },
            )
            self.assertEqual(200, execute.status_code)
            self.assertIn("plan_hash", execute.json()["execution_plan"])

            anchored = client.post(
                f"/api/reports/{session_id}/anchor",
                json={
                    "network": "testnet",
                    "transaction_hash": TX_HASH,
                    "submitted_by": ADDRESS,
                    "block_number": 88,
                },
            )
            self.assertEqual(200, anchored.status_code)
            self.assertEqual(TX_HASH, anchored.json()["record"]["transaction_hash"])

            refreshed = client.get(f"/api/sessions/{session_id}")
            self.assertEqual(200, refreshed.status_code)
            payload = refreshed.json()
            self.assertEqual(TX_HASH, payload["transaction_receipts"][-1]["tx_hash"])
            self.assertEqual("MONITORING", payload["status"])
            self.assertEqual(TX_HASH, payload["report"]["transaction_receipts"][-1]["tx_hash"])
            self.assertEqual(TX_HASH, payload["report_anchor_records"][-1]["transaction_hash"])

            with patch("app.services.monitoring.read_kyc_from_chain", return_value=_kyc(level=2)):
                monitor = client.get(f"/api/rwa/monitor?session_id={session_id}")
            self.assertEqual(200, monitor.status_code)
            monitor_payload = monitor.json()
            self.assertGreater(monitor_payload["current_balance"], 0)
            self.assertEqual("T+2", monitor_payload["next_redemption_window"])
            self.assertIn("position_snapshots", monitor_payload)

    def test_anchor_endpoint_supports_draft_record_creation(self):
        services = build_test_services()

        with patched_test_client(services) as client:
            created = client.post(
                "/api/sessions",
                json=_session_payload("Prepare a report that can later be anchored."),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            completed = complete_session_via_api(
                client,
                session_id,
                answer_value="Keep the report anchorable even before the wallet signs.",
            )
            self.assertEqual("READY_FOR_EXECUTION", completed["status"])

            draft_anchor = client.post(
                f"/api/reports/{session_id}/anchor",
                json={
                    "network": "testnet",
                    "submitted_by": ADDRESS,
                    "note": "draft before signing",
                },
            )
            self.assertEqual(200, draft_anchor.status_code)
            self.assertEqual("draft", draft_anchor.json()["record"]["status"])

            refreshed = client.get(f"/api/sessions/{session_id}")
            self.assertEqual(200, refreshed.status_code)
            self.assertEqual("draft", refreshed.json()["report_anchor_records"][-1]["status"])
