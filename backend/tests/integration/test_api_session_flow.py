import sqlite3
import unittest
from unittest.mock import patch

from app.domain.models import AnalysisMode
from tests.support import build_test_services, complete_session_via_api, patched_test_client


def _session_payload(problem_statement: str, *, mode: str = "multi_option"):
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
            "wallet_address": "",
            "wants_onchain_attestation": True,
            "additional_constraints": "",
        },
    }


class SessionApiFlowTests(unittest.TestCase):
    def test_bootstrap_and_full_session_flow_return_structured_json(self):
        services = build_test_services()

        with patched_test_client(services, oracle_snapshots=[]) as client:
            bootstrap = client.get("/api/frontend/bootstrap", headers={"X-App-Locale": "en"})
            self.assertEqual(200, bootstrap.status_code)
            self.assertIn("asset_library", bootstrap.json())
            self.assertIn("demo_scenarios", bootstrap.json())

            create_response = client.post(
                "/api/sessions",
                json=_session_payload("Should I apply for graduate school now or work for two years first?"),
            )
            self.assertEqual(200, create_response.status_code)
            payload = create_response.json()
            self.assertEqual("CLARIFYING", payload["status"])
            session_id = payload["session_id"]

            completed = complete_session_via_api(
                client,
                session_id,
                answer_value="I want the lower-risk path and need a conservative recommendation.",
            )

            self.assertEqual("COMPLETED", completed["status"])
            self.assertIn("report", completed)
            self.assertIn("markdown", completed["report"])
            self.assertTrue(completed["report"]["markdown"])

            session_list = client.get("/api/my/sessions")
            self.assertEqual(200, session_list.status_code)
            self.assertEqual(1, len(session_list.json()))

    def test_attestation_round_trip_persists_transaction_hash(self):
        services = build_test_services()

        with patched_test_client(services, oracle_snapshots=[]) as client:
            create_response = client.post(
                "/api/sessions",
                json=_session_payload(
                    "Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                    mode=AnalysisMode.MULTI_OPTION.value,
                ),
            )
            self.assertEqual(200, create_response.status_code)
            session_id = create_response.json()["session_id"]
            completed = complete_session_via_api(
                client,
                session_id,
                answer_value="Keep liquidity inside T+3 and preserve evidence traceability.",
            )
            self.assertEqual("COMPLETED", completed["status"])
            self.assertIn("attestation_draft", completed["report"])

            record_response = client.post(
                f"/api/sessions/{session_id}/attestation",
                json={
                    "network": "testnet",
                    "transaction_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                    "submitted_by": "0x1234",
                    "block_number": 42,
                },
            )
            self.assertEqual(200, record_response.status_code)
            self.assertEqual(
                "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                record_response.json()["report"]["attestation_draft"]["transaction_hash"],
            )

    def test_unknown_session_returns_404_json(self):
        services = build_test_services()

        with patched_test_client(services) as client:
            response = client.get("/api/sessions/does-not-exist")
            self.assertEqual(404, response.status_code)
            self.assertEqual("Session not found.", response.json()["detail"])

    def test_debug_routes_require_authentication(self):
        services = build_test_services()

        with patched_test_client(services) as client:
            response = client.get("/api/debug/auth/me")
            self.assertEqual(401, response.status_code)

    def test_database_unavailability_returns_structured_503(self):
        services = build_test_services()
        with patched_test_client(services) as client:
            with patch(
                "app.api.routes.get_app_services",
                side_effect=sqlite3.OperationalError("database locked"),
            ):
                response = client.post(
                    "/api/sessions",
                    json=_session_payload("Should I buy a car?"),
                )

        self.assertEqual(503, response.status_code)
        self.assertIn("temporarily unavailable", response.json()["detail"])
