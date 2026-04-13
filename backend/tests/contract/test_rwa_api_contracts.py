import unittest

from fastapi.testclient import TestClient

from app.main import create_app


class RwaApiContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app())

    def test_catalog_contract_includes_statuses_and_demo_scenarios(self):
        response = self.client.get("/api/rwa/catalog", headers={"X-App-Locale": "en"})

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertIn("assets", payload)
        self.assertIn("chain_config", payload)
        self.assertIn("demo_scenarios", payload)
        self.assertGreaterEqual(len(payload["assets"]), 6)
        self.assertTrue(all("statuses" in asset for asset in payload["assets"]))

    def test_clarify_contract_returns_structured_questions(self):
        response = self.client.post(
            "/api/rwa/clarify",
            json={
                "problem_statement": "Compare stablecoins and silver RWAs for an inflation hedge.",
                "locale": "en",
            },
        )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertIn("questions", payload)
        self.assertGreaterEqual(len(payload["questions"]), 5)
        self.assertTrue(all("question_text" in item for item in payload["questions"]))

    def test_clarify_contract_validates_problem_statement(self):
        response = self.client.post(
            "/api/rwa/clarify",
            json={"problem_statement": "bad", "locale": "en"},
        )

        self.assertEqual(422, response.status_code)

    def test_asset_proof_contract_returns_status_cards(self):
        response = self.client.get(
            "/api/rwa/assets/hsk-usdt/proof",
            headers={"X-App-Locale": "en"},
        )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertIn("asset", payload)
        self.assertIn("proof", payload)
        self.assertIn("latest_proof", payload)
        self.assertIn("onchain_anchor_status", payload)
        self.assertIn("proof_timeline_preview", payload)
        self.assertEqual("hsk-usdt", payload["proof"]["asset_id"])
        self.assertGreaterEqual(len(payload["proof"]["status_cards"]), 5)

    def test_asset_proof_history_contract_returns_timeline(self):
        self.client.get(
            "/api/rwa/assets/hsk-usdt/proof",
            headers={"X-App-Locale": "en"},
        )
        response = self.client.get(
            "/api/rwa/assets/hsk-usdt/proof/history",
            headers={"X-App-Locale": "en"},
        )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual("hsk-usdt", payload["asset_id"])
        self.assertIn("history", payload)
        self.assertGreaterEqual(len(payload["history"]), 1)
        self.assertIn("history_source", payload)

    def test_indexer_status_contract_returns_structured_status(self):
        response = self.client.get("/api/rwa/indexer/status")

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertIn("status", payload)

    def test_asset_readiness_contract_returns_route_summary(self):
        response = self.client.get(
            "/api/rwa/assets/cpic-estable-mmf/readiness?amount=10000&network=testnet",
            headers={"X-App-Locale": "en"},
        )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual("cpic-estable-mmf", payload["asset"]["asset_id"])
        self.assertIn("execution_adapter_kind", payload)
        self.assertIn("execution_readiness", payload)
        self.assertTrue(payload["route_summary"])

    def test_analyze_contract_returns_extended_report_payload(self):
        response = self.client.post(
            "/api/rwa/analyze",
            json={
                "problem_statement": "Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
                "preferred_asset_ids": ["hsk-usdc", "cpic-estable-mmf", "hk-regulated-silver"],
                "investment_amount": 10000,
                "base_currency": "USDT",
                "holding_period_days": 30,
                "risk_tolerance": "balanced",
                "liquidity_need": "t_plus_3",
                "minimum_kyc_level": 0,
                "wallet_address": "",
                "wallet_network": "",
                "locale": "en",
                "include_multi_horizon": True,
                "include_defi_llama_evidence": False,
                "include_non_production_assets": False,
                "demo_mode": False,
            },
        )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        report = payload["report"]
        self.assertIn("comparison_matrix", report)
        self.assertIn("recommendation_reason", report)
        self.assertIn("action_intents", report)
        self.assertIn("evidence_governance", report)
        self.assertIn("unknowns", report)
        self.assertIn("warnings", report)
        self.assertIn("multi_horizon_simulations", payload)
