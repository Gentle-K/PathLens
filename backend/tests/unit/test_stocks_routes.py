from __future__ import annotations

import unittest

from tests.support import build_test_services, patched_test_client


class StocksRoutesTests(unittest.TestCase):
    def test_bootstrap_and_candidates_flow(self) -> None:
        services = build_test_services()
        with patched_test_client(services) as client:
            bootstrap = client.get("/api/stocks/bootstrap")
            self.assertEqual(bootstrap.status_code, 200, bootstrap.text)
            payload = bootstrap.json()
            self.assertIn("settings", payload)
            self.assertIn("provider_statuses", payload)

            armed = client.post(
                "/api/stocks/autopilot/state",
                json={"mode": "paper", "state": "armed"},
            )
            self.assertEqual(armed.status_code, 200, armed.text)

            running = client.post(
                "/api/stocks/autopilot/state",
                json={"mode": "paper", "state": "running"},
            )
            self.assertEqual(running.status_code, 200, running.text)

            candidates = client.get("/api/stocks/candidates?mode=paper")
            self.assertEqual(candidates.status_code, 200, candidates.text)
            candidate_payload = candidates.json()
            self.assertEqual(candidate_payload["mode"], "paper")
            self.assertGreaterEqual(len(candidate_payload["candidates"]), 1)
            self.assertIn("latest_cycle", candidate_payload)

            orders = client.get("/api/stocks/orders?mode=paper")
            self.assertEqual(orders.status_code, 200, orders.text)
            orders_payload = orders.json()
            self.assertEqual(orders_payload["mode"], "paper")

    def test_live_arm_is_blocked_until_promotion_gate_passes(self) -> None:
        services = build_test_services()
        with patched_test_client(services) as client:
            response = client.post(
                "/api/stocks/autopilot/state",
                json={"mode": "live", "state": "armed"},
            )
            self.assertEqual(response.status_code, 409, response.text)

    def test_kill_switch_halts_mode(self) -> None:
        services = build_test_services()
        with patched_test_client(services) as client:
            response = client.post(
                "/api/stocks/kill-switch",
                json={"mode": "paper", "reason": "Manual test halt."},
            )
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual(payload["state"], "halted")
            self.assertEqual(payload["reason"], "Manual test halt.")


if __name__ == "__main__":
    unittest.main()

