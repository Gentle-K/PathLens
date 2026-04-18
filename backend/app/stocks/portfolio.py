from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from app.stocks.models import ModeWorkspace, PromotionGateResult, TradingWorkspace, TradingMode, utc_now_iso


class StocksPortfolioService:
    def compute_promotion_gate(self, workspace: TradingWorkspace) -> PromotionGateResult:
        paper_state = workspace.paper
        unique_days = {item.created_at[:10] for item in paper_state.decision_cycles}
        intents = [intent for cycle in paper_state.decision_cycles for intent in cycle.order_intents]
        executable = [item for item in intents if item.action.value in {"buy", "sell_to_close"}]
        submitted = [item for item in executable if item.status.value not in {"rejected", "draft"}]
        unresolved = [order for order in paper_state.orders if order.status.value in {"draft", "submitted", "ready_not_sent"}]
        fill_rate = (len([item for item in paper_state.orders if item.status.value == "filled"]) / len(submitted)) if submitted else 0.0
        drawdown = self._max_drawdown(paper_state)
        risk_exceptions = len(
            [
                gate
                for cycle in paper_state.decision_cycles
                for gate in cycle.risk_outcomes
                if gate.status.value == "blocked"
            ]
        )
        blockers: list[str] = []
        if len(unique_days) < 20:
            blockers.append("Paper trading needs at least 20 distinct trading days.")
        if fill_rate < 0.99:
            blockers.append("Fill success rate must stay at or above 99%.")
        if unresolved:
            blockers.append("Reconcile or clear unresolved orders before live arming.")
        if drawdown > 0.05:
            blockers.append("Max drawdown is above the 5% promotion threshold.")
        return PromotionGateResult(
            eligible_for_live_arm=not blockers,
            paper_trading_days=len(unique_days),
            fill_success_rate=round(fill_rate, 4),
            unresolved_orders_count=len(unresolved),
            max_drawdown_pct=round(drawdown, 4),
            risk_exceptions=risk_exceptions,
            blockers=blockers,
            evaluated_at=utc_now_iso(),
        )

    def record_end_of_day(self, state: ModeWorkspace) -> str:
        state.last_end_of_day_report_at = utc_now_iso()
        state.opened_today.clear()
        return state.last_end_of_day_report_at

    def _max_drawdown(self, state: ModeWorkspace) -> float:
        peak = 0.0
        max_drawdown = 0.0
        for point in state.equity_curve:
            equity = point.equity if hasattr(point, "equity") else point["equity"]
            peak = max(peak, equity)
            if peak > 0:
                max_drawdown = max(max_drawdown, (peak - equity) / peak)
        return max_drawdown

