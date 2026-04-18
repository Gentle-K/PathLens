from __future__ import annotations

import unittest

from app.stocks.decision_engine import parse_llm_decision_payload


class StocksDecisionEngineTests(unittest.TestCase):
    def test_parse_decision_rejects_unknown_action(self) -> None:
        with self.assertRaises(ValueError):
            parse_llm_decision_payload(
                {
                    "ticker": "AAPL",
                    "action": "short",
                    "selected_strategy": "trend_follow",
                }
            )

    def test_parse_decision_rejects_unknown_strategy(self) -> None:
        with self.assertRaises(ValueError):
            parse_llm_decision_payload(
                {
                    "ticker": "AAPL",
                    "action": "buy",
                    "selected_strategy": "invented_edge",
                }
            )

