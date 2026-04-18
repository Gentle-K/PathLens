from __future__ import annotations

from app.stocks.models import (
    AiAction,
    AiDecision,
    MarketSnapshot,
    OrderIntent,
    OrderLifecycleStatus,
    PositionState,
    RiskGateResult,
    TradingMode,
)


class StocksExecutionRouter:
    def build_intent(
        self,
        *,
        cycle_id: str,
        mode: TradingMode,
        decision: AiDecision,
        gate: RiskGateResult,
        snapshot: MarketSnapshot,
        positions: list[PositionState],
    ) -> OrderIntent | None:
        if decision.action == AiAction.SKIP:
            return None
        if decision.action == AiAction.SELL_TO_CLOSE:
            position = next((item for item in positions if item.ticker == decision.ticker and item.quantity > 0), None)
            if position is None:
                return None
            return OrderIntent(
                cycle_id=cycle_id,
                ticker=decision.ticker,
                mode=mode,
                action=decision.action,
                quantity=position.quantity,
                side="sell",
                limit_price=round(snapshot.last_price * 0.998, 2),
                rationale=decision.rationale,
                risk_gate=gate,
                status=(
                    OrderLifecycleStatus.DRAFT
                    if gate.status == "approved"
                    else OrderLifecycleStatus.REJECTED
                ),
            )
        if gate.suggested_quantity < 1:
            return None
        return OrderIntent(
            cycle_id=cycle_id,
            ticker=decision.ticker,
            mode=mode,
            action=decision.action,
            quantity=gate.suggested_quantity,
            side="buy",
            limit_price=round(snapshot.last_price * 1.002, 2),
            rationale=decision.rationale,
            risk_gate=gate,
            status=(
                OrderLifecycleStatus.DRAFT
                if gate.status == "approved"
                else (
                    OrderLifecycleStatus.READY_NOT_SENT
                    if gate.status == "watch_only"
                    else OrderLifecycleStatus.REJECTED
                )
            ),
        )

