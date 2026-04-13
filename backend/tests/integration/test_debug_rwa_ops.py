import unittest

from tests.support import build_test_services, patched_test_client


class DebugRwaOpsIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.services = build_test_services()

    def test_debug_rwa_ops_summary_requires_debug_auth_and_returns_sections(self):
        with patched_test_client(self.services) as client:
            unauthorized = client.get("/api/debug/rwa/ops/summary")
            self.assertEqual(401, unauthorized.status_code)

            response = client.get(
                "/api/debug/rwa/ops/summary?network=testnet",
                auth=("debug-admin", "change-me-debug-password"),
            )
            self.assertEqual(200, response.status_code)
            payload = response.json()["summary"]
            self.assertIn("proof_queue", payload)
            self.assertIn("attester_status", payload)
            self.assertIn("indexer_health", payload)
            self.assertGreaterEqual(len(payload["proof_queue"]), 4)

    def test_debug_write_operations_return_receipts(self):
        with patched_test_client(self.services) as client:
            refresh = client.post(
                "/api/debug/rwa/proofs/refresh?network=testnet",
                auth=("debug-admin", "change-me-debug-password"),
            )
            self.assertEqual(200, refresh.status_code)
            self.assertEqual("success", refresh.json()["receipt"]["status"])

            jobs = client.get(
                "/api/debug/rwa/jobs",
                auth=("debug-admin", "change-me-debug-password"),
            )
            self.assertEqual(200, jobs.status_code)
            self.assertGreaterEqual(len(jobs.json()["jobs"]), 1)

            manual_publish = client.post(
                "/api/debug/rwa/proofs/missing-snapshot/publish",
                auth=("debug-admin", "change-me-debug-password"),
            )
            self.assertEqual(200, manual_publish.status_code)
            self.assertEqual("failed", manual_publish.json()["receipt"]["status"])

            indexer = client.post(
                "/api/debug/rwa/indexer/run",
                auth=("debug-admin", "change-me-debug-password"),
            )
            self.assertEqual(200, indexer.status_code)
            self.assertIn(indexer.json()["receipt"]["status"], {"success", "failed"})
