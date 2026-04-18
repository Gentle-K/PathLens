from __future__ import annotations

from statistics import mean

from app.stocks.models import (
    AiAction,
    AiDecision,
    MarketSnapshot,
    SignalFeatureSet,
    StrategyTemplate,
    TradeCandidate,
)


ALLOWED_ACTIONS = {item.value for item in AiAction}
ALLOWED_STRATEGIES = {item.value for item in StrategyTemplate}


def parse_llm_decision_payload(payload: dict) -> AiDecision:
    action = str(payload.get("action", "")).strip()
    strategy = str(payload.get("selected_strategy", "")).strip()
    if action not in ALLOWED_ACTIONS:
        raise ValueError(f"Unsupported decision action '{action}'.")
    if strategy and strategy not in ALLOWED_STRATEGIES:
        raise ValueError(f"Unsupported strategy '{strategy}'.")
    return AiDecision(
        ticker=str(payload.get("ticker", "")).strip(),
        action=AiAction(action),
        selected_strategy=StrategyTemplate(strategy) if strategy else None,
        confidence=float(payload.get("confidence", 0.0)),
        ranking_score=float(payload.get("ranking_score", 0.0)),
        rationale=str(payload.get("rationale", "")).strip(),
        model_name=str(payload.get("model_name", "mock-hybrid-decider")).strip(),
    )


class StocksDecisionEngine:
    def build_candidate(
        self,
        ticker: str,
        company_name: str,
        snapshot: MarketSnapshot,
        history: list[MarketSnapshot],
    ) -> TradeCandidate:
        closes = [item.minute_close for item in history] or [snapshot.last_price]
        highs = [item.minute_high for item in history] or [snapshot.high_price]
        short_sma = mean(closes[-3:])
        long_sma = mean(closes[-6:]) if len(closes) >= 6 else mean(closes)
        volume_ratio = snapshot.volume / max(snapshot.average_volume, 1)
        prior_high = max(highs[:-1], default=snapshot.high_price)
        intraday_breakout = snapshot.last_price > prior_high * 1.001
        pullback_reclaim = len(closes) >= 4 and min(closes[-4:-1]) < long_sma and snapshot.last_price > short_sma
        momentum_pct = (snapshot.last_price - closes[0]) / closes[0] if closes[0] else 0.0
        distance_from_open_pct = (
            (snapshot.last_price - snapshot.open_price) / snapshot.open_price
            if snapshot.open_price
            else 0.0
        )
        signal_score = max(
            0.0,
            min(
                1.0,
                0.42
                + (0.12 if snapshot.last_price > short_sma else 0.0)
                + (0.10 if short_sma > long_sma else 0.0)
                + (0.10 if intraday_breakout else 0.0)
                + (0.08 if pullback_reclaim else 0.0)
                + min(0.10, volume_ratio / 20)
                + min(0.08, max(momentum_pct, 0.0)),
            ),
        )
        features = SignalFeatureSet(
            price_above_short_sma=snapshot.last_price > short_sma,
            short_sma_above_long_sma=short_sma > long_sma,
            volume_ratio=volume_ratio,
            intraday_breakout=intraday_breakout,
            pullback_reclaim=pullback_reclaim,
            momentum_pct=momentum_pct,
            distance_from_open_pct=distance_from_open_pct,
            risk_buffer_pct=max(0.0, snapshot.last_price - long_sma) / snapshot.last_price,
            signal_score=signal_score,
        )
        strategies: list[StrategyTemplate] = []
        if features.price_above_short_sma and features.short_sma_above_long_sma and features.momentum_pct > 0:
            strategies.append(StrategyTemplate.TREND_FOLLOW)
        if features.pullback_reclaim:
            strategies.append(StrategyTemplate.PULLBACK_RECLAIM)
        if features.intraday_breakout and features.volume_ratio >= 0.8:
            strategies.append(StrategyTemplate.BREAKOUT_CONFIRMATION)
        preferred = strategies[0] if strategies else None
        notes = []
        if features.volume_ratio < 0.6:
            notes.append("Volume confirmation is still thin.")
        if features.momentum_pct < 0:
            notes.append("Intraday momentum is negative.")
        return TradeCandidate(
            ticker=ticker,
            company_name=company_name,
            snapshot=snapshot,
            features=features,
            triggered_strategies=strategies,
            preferred_strategy=preferred,
            score=signal_score,
            eligible=bool(strategies),
            notes=notes,
        )

    def decide(
        self,
        candidates: list[TradeCandidate],
        open_positions: set[str],
    ) -> list[AiDecision]:
        decisions: list[AiDecision] = []
        for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
            if candidate.ticker in open_positions and candidate.score < 0.48:
                action = AiAction.SELL_TO_CLOSE
            elif candidate.ticker in open_positions:
                action = AiAction.HOLD
            elif candidate.score >= 0.62 and candidate.eligible:
                action = AiAction.BUY
            else:
                action = AiAction.SKIP
            rationale = self._rationale_for(candidate, action)
            decisions.append(
                AiDecision(
                    ticker=candidate.ticker,
                    action=action,
                    selected_strategy=candidate.preferred_strategy,
                    confidence=round(candidate.score, 4),
                    ranking_score=round(candidate.score * (1.1 if action == AiAction.BUY else 1.0), 4),
                    rationale=rationale,
                )
            )
        return decisions

    def _rationale_for(self, candidate: TradeCandidate, action: AiAction) -> str:
        parts = []
        if candidate.preferred_strategy is not None:
            parts.append(f"Primary template: {candidate.preferred_strategy.value}.")
        parts.append(f"Signal score {candidate.score:.2f}.")
        parts.append(f"Volume ratio {candidate.features.volume_ratio:.2f}.")
        if action == AiAction.BUY:
            parts.append("Trend and liquidity checks support a controlled long entry.")
        elif action == AiAction.HOLD:
            parts.append("Position stays open because the trend structure remains intact.")
        elif action == AiAction.SELL_TO_CLOSE:
            parts.append("Exit is preferred because the open position lost signal support.")
        else:
            parts.append("No entry because the candidate did not clear the minimum signal bar.")
        return " ".join(parts)

