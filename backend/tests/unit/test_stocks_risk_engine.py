from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo
import unittest

from app.stocks.models import (
    AiAction,
    AiDecision,
    AutopilotState,
    BrokerAccount,
    MarketSnapshot,
    PositionState,
    RiskLimits,
    TradingMode,
)
from app.stocks.risk_engine import StocksRiskEngine


class StocksRiskEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = StocksRiskEngine()
        self.snapshot = MarketSnapshot(
            ticker="AAPL",
            company_name="Apple",
            last_price=200.0,
            open_price=198.0,
            high_price=201.0,
            low_price=197.5,
            previous_close=197.0,
            day_change_pct=0.015,
            volume=1_500_000,
            average_volume=1_000_000,
            minute_close=200.0,
            minute_open=199.2,
            minute_high=200.4,
            minute_low=198.9,
            minute_volume=25_000,
        )
        self.account = BrokerAccount(
            mode=TradingMode.PAPER,
            equity=100000.0,
            cash=65000.0,
            buying_power=65000.0,
            gross_exposure_pct=0.10,
        )

    def test_blocks_buy_when_max_positions_reached(self) -> None:
        positions = [
            PositionState(
                ticker=ticker,
                mode=TradingMode.PAPER,
                quantity=10,
                average_entry_price=100.0,
                market_price=101.0,
                market_value=1010.0,
            )
            for ticker in ["MSFT", "NVDA", "AMZN", "META"]
        ]
        gate = self.engine.evaluate(
            decision=AiDecision(ticker="AAPL", action=AiAction.BUY, confidence=0.9),
            snapshot=self.snapshot,
            account=self.account,
            positions=positions,
            risk_limits=RiskLimits(),
            autopilot_state=AutopilotState.RUNNING,
            opened_today={},
            now_et=datetime(2026, 4, 20, 10, 0, tzinfo=ZoneInfo("America/New_York")),
        )
        self.assertEqual(gate.status.value, "blocked")
        self.assertTrue(any("Max concurrent positions" in reason for reason in gate.reasons))

    def test_blocks_buy_after_daily_loss_stop(self) -> None:
        account = self.account.model_copy(update={"day_pnl": -4000.0})
        gate = self.engine.evaluate(
            decision=AiDecision(ticker="AAPL", action=AiAction.BUY, confidence=0.9),
            snapshot=self.snapshot,
            account=account,
            positions=[],
            risk_limits=RiskLimits(daily_loss_stop_pct=0.03),
            autopilot_state=AutopilotState.RUNNING,
            opened_today={},
            now_et=datetime(2026, 4, 20, 10, 0, tzinfo=ZoneInfo("America/New_York")),
        )
        self.assertEqual(gate.status.value, "blocked")
        self.assertTrue(any("Daily loss stop" in reason for reason in gate.reasons))

