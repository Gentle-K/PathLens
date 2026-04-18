from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.stocks.models import (
    AiAction,
    AiDecision,
    AutopilotState,
    BrokerAccount,
    MarketSnapshot,
    PositionState,
    RiskGateResult,
    RiskGateStatus,
    RiskLimits,
)


NY_TZ = ZoneInfo("America/New_York")


class StocksRiskEngine:
    def evaluate(
        self,
        *,
        decision: AiDecision,
        snapshot: MarketSnapshot,
        account: BrokerAccount,
        positions: list[PositionState],
        risk_limits: RiskLimits,
        autopilot_state: AutopilotState,
        opened_today: dict[str, int],
        now_et: datetime | None = None,
    ) -> RiskGateResult:
        now = now_et or datetime.now(NY_TZ)
        reasons: list[str] = []
        warnings: list[str] = []
        target_weight = min(risk_limits.single_position_cap_pct, max(0.03, decision.confidence * 0.12))
        current_symbols = {item.ticker for item in positions if item.quantity > 0}

        if decision.action == AiAction.SKIP:
            reasons.append("AI action is skip.")
        if autopilot_state == AutopilotState.HALTED:
            reasons.append("Kill switch is active.")
        if decision.action == AiAction.BUY and not self._within_open_window(now, risk_limits.trading_window_et):
            reasons.append("New entries are only allowed during the configured regular-hours window.")
        if decision.action == AiAction.BUY and snapshot.source_status.value == "unavailable":
            reasons.append("Market data provider is unavailable.")
        if decision.action == AiAction.BUY and account.day_pnl <= -(account.equity * risk_limits.daily_loss_stop_pct):
            reasons.append("Daily loss stop is active.")
        if decision.action == AiAction.BUY and decision.ticker in current_symbols:
            reasons.append("Averaging into an existing loser or open long is disabled in v1.")
        if decision.action == AiAction.BUY and opened_today.get(decision.ticker, 0) >= risk_limits.max_new_entries_per_symbol_per_day:
            reasons.append("This symbol already opened a new position today.")
        if decision.action == AiAction.BUY and len(current_symbols) >= risk_limits.max_open_positions:
            reasons.append("Max concurrent positions reached.")

        gross_remaining_pct = max(0.0, risk_limits.gross_exposure_cap_pct - account.gross_exposure_pct)
        max_notional = max(0.0, min(target_weight, gross_remaining_pct) * account.equity)
        if decision.action == AiAction.BUY and max_notional <= 0:
            reasons.append("Gross exposure cap reached.")
        suggested_quantity = int(max_notional // max(snapshot.last_price * 1.002, 0.01)) if decision.action == AiAction.BUY else 0
        if decision.action == AiAction.BUY and suggested_quantity < 1:
            reasons.append("Ticket size is below one whole share after caps.")

        if decision.action == AiAction.SELL_TO_CLOSE and decision.ticker not in current_symbols:
            warnings.append("No open position found; sell signal will be ignored.")

        status = RiskGateStatus.APPROVED
        if reasons:
            status = RiskGateStatus.BLOCKED
        elif autopilot_state != AutopilotState.RUNNING:
            status = RiskGateStatus.WATCH_ONLY
            warnings.append("Autopilot is not running, so the order intent stays staged.")

        return RiskGateResult(
            ticker=decision.ticker,
            status=status,
            reasons=reasons,
            warnings=warnings,
            target_weight_pct=round(target_weight, 4),
            max_notional_usd=round(max_notional, 2),
            suggested_quantity=max(suggested_quantity, 0),
        )

    def _within_open_window(self, now: datetime, trading_window_et: str) -> bool:
        try:
            start_raw, end_raw = trading_window_et.split("-", 1)
            start_hour, start_minute = [int(part) for part in start_raw.split(":", 1)]
            end_hour, end_minute = [int(part) for part in end_raw.split(":", 1)]
        except ValueError:
            return True
        minutes = now.hour * 60 + now.minute
        return (start_hour * 60 + start_minute) <= minutes < (end_hour * 60 + end_minute)

