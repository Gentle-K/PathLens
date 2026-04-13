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

    def test_submit_endpoint_distinguishes_issuer_flow_and_portfolio_api_returns_proof(self):
        services = build_test_services()
        services.wallet_service.build_wallet_positions = Mock(
            return_value=(
                "testnet",
                [
                    PositionSnapshot(
                        asset_id="cpic-estable-mmf",
                        asset_name="CPIC Estable MMF",
                        chain_id=177,
                        contract_address="",
                        wallet_address=ADDRESS,
                        current_balance=10000,
                        latest_nav_or_price=1.001,
                        current_value=10010,
                        cost_basis=10000,
                        unrealized_pnl=10,
                        accrued_yield=24,
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
                    "Build a portfolio around a professional-investor MMF sleeve.",
                    mode=AnalysisMode.STRATEGY_COMPARE.value,
                ),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            completed = complete_session_via_api(
                client,
                session_id,
                answer_value="User is a professional investor and accepts T+2 redemption.",
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

            submit = client.post(
                "/api/rwa/execute/submit",
                json={
                    "session_id": session_id,
                    "source_asset": "USDT",
                    "target_asset": "cpic-estable-mmf",
                    "amount": 10000,
                    "wallet_address": ADDRESS,
                    "source_chain": "hashkey",
                    "include_attestation": True,
                    "network": "testnet",
                },
            )
            self.assertEqual(200, submit.status_code)
            self.assertEqual("redirect_required", submit.json()["submission_status"])

            portfolio = client.get(f"/api/rwa/portfolio/{ADDRESS}?network=testnet")
            self.assertEqual(200, portfolio.status_code)
            portfolio_payload = portfolio.json()
            self.assertEqual(ADDRESS, portfolio_payload["address"])
            self.assertGreaterEqual(len(portfolio_payload["proof_snapshots"]), 1)
            self.assertGreaterEqual(len(portfolio_payload["alerts"]), 1)

    def test_direct_contract_submission_exposes_receipt_lookup_and_proof_history(self):
        services = build_test_services()

        with patched_test_client(services) as client:
            created = client.post(
                "/api/sessions",
                json=_session_payload(
                    "Prepare a stablecoin sleeve with a direct contract route.",
                    mode=AnalysisMode.STRATEGY_COMPARE.value,
                ),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            complete_session_via_api(
                client,
                session_id,
                answer_value="User is professional, KYC approved, and wants stablecoin execution.",
            )

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

            proof_response = client.get("/api/rwa/assets/hsk-usdt/proof?network=testnet")
            self.assertEqual(200, proof_response.status_code)
            self.assertIn("latest_proof", proof_response.json())
            self.assertIn("onchain_anchor_status", proof_response.json())
            self.assertIn("proof_timeline_preview", proof_response.json())

            proof_history = client.get("/api/rwa/assets/hsk-usdt/proof/history?network=testnet")
            self.assertEqual(200, proof_history.status_code)
            self.assertEqual("hsk-usdt", proof_history.json()["asset_id"])
            self.assertGreaterEqual(len(proof_history.json()["history"]), 1)

            submit = client.post(
                "/api/rwa/execute/submit",
                json={
                    "session_id": session_id,
                    "source_asset": "USDT",
                    "target_asset": "hsk-usdt",
                    "amount": 10000,
                    "wallet_address": ADDRESS,
                    "source_chain": "hashkey",
                    "include_attestation": True,
                    "network": "testnet",
                },
            )
            self.assertEqual(200, submit.status_code)
            submit_payload = submit.json()
            self.assertEqual("prepared", submit_payload["submission_status"])
            self.assertEqual("direct_contract", submit_payload["receipt"]["adapter_kind"])
            self.assertTrue(submit_payload["receipt"]["submit_payload"]["data"].startswith("0x"))

            receipt_id = submit_payload["receipt"]["receipt_id"]
            receipt_detail = client.get(f"/api/rwa/execution/receipts/{receipt_id}")
            self.assertEqual(200, receipt_detail.status_code)
            self.assertEqual(receipt_id, receipt_detail.json()["receipt"]["receipt_id"])

            receipt_list = client.get(f"/api/rwa/execution/receipts?session_id={session_id}")
            self.assertEqual(200, receipt_list.status_code)
            self.assertGreaterEqual(len(receipt_list.json()["receipts"]), 1)

    def test_portfolio_alert_ack_read_and_benchmark_submit_block(self):
        services = build_test_services()
        services.wallet_service.build_wallet_positions = Mock(
            return_value=(
                "testnet",
                [
                    PositionSnapshot(
                        asset_id="cpic-estable-mmf",
                        asset_name="CPIC Estable MMF",
                        chain_id=177,
                        contract_address="",
                        wallet_address=ADDRESS,
                        current_balance=10000,
                        latest_nav_or_price=1.001,
                        current_value=10010,
                        cost_basis=10000,
                        unrealized_pnl=10,
                        realized_income=8,
                        accrued_yield=24,
                        redemption_forecast=10010,
                        allocation_weight_pct=1.0,
                        liquidity_risk="medium",
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
                    "Verify benchmark and live isolation in the execution submit flow.",
                    mode=AnalysisMode.STRATEGY_COMPARE.value,
                ),
            )
            self.assertEqual(200, created.status_code)
            session_id = created.json()["session_id"]
            complete_session_via_api(
                client,
                session_id,
                answer_value="User is professional and wants live execution only.",
            )

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

            portfolio_alerts = client.get(f"/api/rwa/portfolio/{ADDRESS}/alerts?network=testnet")
            self.assertEqual(200, portfolio_alerts.status_code)
            alerts = portfolio_alerts.json()["alerts"]
            self.assertGreaterEqual(len(alerts), 1)

            alert_id = alerts[0]["alert_id"]
            acked = client.post(f"/api/rwa/portfolio/{ADDRESS}/alerts/{alert_id}/ack")
            self.assertEqual(200, acked.status_code)
            self.assertTrue(acked.json()["state"]["acked"])

            marked_read = client.post(f"/api/rwa/portfolio/{ADDRESS}/alerts/{alert_id}/read")
            self.assertEqual(200, marked_read.status_code)
            self.assertTrue(marked_read.json()["state"]["read"])

            blocked = client.post(
                "/api/rwa/execute/submit",
                json={
                    "session_id": session_id,
                    "source_asset": "USDT",
                    "target_asset": "hsk-wbtc-benchmark",
                    "amount": 10000,
                    "wallet_address": ADDRESS,
                    "source_chain": "hashkey",
                    "include_attestation": True,
                    "network": "testnet",
                },
            )
            self.assertEqual(409, blocked.status_code)
