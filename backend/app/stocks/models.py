from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


class TradingMode(StrEnum):
    PAPER = "paper"
    LIVE = "live"


class AutopilotState(StrEnum):
    PAUSED = "paused"
    ARMED = "armed"
    RUNNING = "running"
    HALTED = "halted"


class StrategyTemplate(StrEnum):
    TREND_FOLLOW = "trend_follow"
    PULLBACK_RECLAIM = "pullback_reclaim"
    BREAKOUT_CONFIRMATION = "breakout_confirmation"


class AiAction(StrEnum):
    BUY = "buy"
    HOLD = "hold"
    SELL_TO_CLOSE = "sell_to_close"
    SKIP = "skip"


class RiskGateStatus(StrEnum):
    APPROVED = "approved"
    BLOCKED = "blocked"
    WATCH_ONLY = "watch_only"


class OrderLifecycleStatus(StrEnum):
    DRAFT = "draft"
    READY_NOT_SENT = "ready_not_sent"
    SUBMITTED = "submitted"
    FILLED = "filled"
    CANCELED = "canceled"
    REJECTED = "rejected"


class ProviderConnectionStatus(StrEnum):
    CONNECTED = "connected"
    SIMULATED = "simulated"
    UNAVAILABLE = "unavailable"


class PositionDirection(StrEnum):
    LONG = "long"


class RiskLimits(BaseModel):
    single_position_cap_pct: float = 0.10
    gross_exposure_cap_pct: float = 0.35
    daily_loss_stop_pct: float = 0.03
    max_open_positions: int = 4
    max_new_entries_per_symbol_per_day: int = 1
    allow_extended_hours: bool = False
    use_marketable_limit_orders: bool = True
    trading_window_et: str = "09:35-15:45"


class ProviderStatus(BaseModel):
    provider: str
    mode: TradingMode | None = None
    status: ProviderConnectionStatus
    detail: str = ""
    updated_at: str = Field(default_factory=utc_now_iso)


class MarketSnapshot(BaseModel):
    ticker: str
    company_name: str = ""
    as_of: str = Field(default_factory=utc_now_iso)
    last_price: float
    open_price: float
    high_price: float
    low_price: float
    previous_close: float
    day_change_pct: float
    volume: int
    average_volume: int
    minute_close: float
    minute_open: float
    minute_high: float
    minute_low: float
    minute_volume: int
    source: str = "simulated"
    source_status: ProviderConnectionStatus = ProviderConnectionStatus.SIMULATED


class SignalFeatureSet(BaseModel):
    price_above_short_sma: bool = False
    short_sma_above_long_sma: bool = False
    volume_ratio: float = 1.0
    intraday_breakout: bool = False
    pullback_reclaim: bool = False
    momentum_pct: float = 0.0
    distance_from_open_pct: float = 0.0
    risk_buffer_pct: float = 0.0
    signal_score: float = 0.0


class TradeCandidate(BaseModel):
    candidate_id: str = Field(default_factory=lambda: uuid4().hex)
    ticker: str
    company_name: str = ""
    snapshot: MarketSnapshot
    features: SignalFeatureSet
    triggered_strategies: list[StrategyTemplate] = Field(default_factory=list)
    preferred_strategy: StrategyTemplate | None = None
    score: float = 0.0
    eligible: bool = True
    notes: list[str] = Field(default_factory=list)


class AiDecision(BaseModel):
    decision_id: str = Field(default_factory=lambda: uuid4().hex)
    ticker: str
    action: AiAction
    selected_strategy: StrategyTemplate | None = None
    confidence: float = 0.0
    ranking_score: float = 0.0
    rationale: str = ""
    model_name: str = "mock-hybrid-decider"
    generated_at: str = Field(default_factory=utc_now_iso)


class RiskGateResult(BaseModel):
    gate_id: str = Field(default_factory=lambda: uuid4().hex)
    ticker: str
    status: RiskGateStatus
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    target_weight_pct: float = 0.0
    max_notional_usd: float = 0.0
    suggested_quantity: int = 0
    evaluated_at: str = Field(default_factory=utc_now_iso)


class OrderIntent(BaseModel):
    intent_id: str = Field(default_factory=lambda: uuid4().hex)
    cycle_id: str
    ticker: str
    mode: TradingMode
    action: AiAction
    quantity: int = 0
    side: str = ""
    order_type: str = "limit"
    time_in_force: str = "day"
    limit_price: float = 0.0
    status: OrderLifecycleStatus = OrderLifecycleStatus.DRAFT
    rationale: str = ""
    risk_gate: RiskGateResult
    submitted_order_id: str = ""
    created_at: str = Field(default_factory=utc_now_iso)


class StockOrder(BaseModel):
    order_id: str = Field(default_factory=lambda: uuid4().hex)
    client_order_id: str = ""
    mode: TradingMode
    ticker: str
    side: str
    quantity: int
    filled_quantity: int = 0
    limit_price: float
    average_fill_price: float = 0.0
    status: OrderLifecycleStatus
    source_intent_id: str = ""
    broker: str = "simulated"
    submitted_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PositionState(BaseModel):
    ticker: str
    company_name: str = ""
    mode: TradingMode
    direction: PositionDirection = PositionDirection.LONG
    quantity: int
    average_entry_price: float
    market_price: float
    market_value: float
    unrealized_pnl: float = 0.0
    realized_pnl_today: float = 0.0
    entry_strategy: StrategyTemplate | None = None
    stop_price: float = 0.0
    take_profit_price: float = 0.0
    opened_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class BrokerAccount(BaseModel):
    mode: TradingMode
    equity: float
    cash: float
    buying_power: float
    day_pnl: float = 0.0
    gross_exposure_pct: float = 0.0
    open_positions: int = 0
    autopilot_state: AutopilotState = AutopilotState.PAUSED
    kill_switch_active: bool = False
    provider_status: ProviderConnectionStatus = ProviderConnectionStatus.SIMULATED
    provider_name: str = "simulated"
    updated_at: str = Field(default_factory=utc_now_iso)


class PromotionGateResult(BaseModel):
    eligible_for_live_arm: bool = False
    paper_trading_days: int = 0
    fill_success_rate: float = 0.0
    unresolved_orders_count: int = 0
    max_drawdown_pct: float = 0.0
    risk_exceptions: int = 0
    blockers: list[str] = Field(default_factory=list)
    evaluated_at: str = Field(default_factory=utc_now_iso)


class EquityPoint(BaseModel):
    timestamp: str = Field(default_factory=utc_now_iso)
    equity: float


class DecisionCycleRecord(BaseModel):
    cycle_id: str = Field(default_factory=lambda: uuid4().hex)
    mode: TradingMode
    created_at: str = Field(default_factory=utc_now_iso)
    summary: str = ""
    market_phase: str = "regular"
    snapshots: list[MarketSnapshot] = Field(default_factory=list)
    candidates: list[TradeCandidate] = Field(default_factory=list)
    ai_decisions: list[AiDecision] = Field(default_factory=list)
    order_intents: list[OrderIntent] = Field(default_factory=list)
    orders_submitted: list[str] = Field(default_factory=list)
    risk_outcomes: list[RiskGateResult] = Field(default_factory=list)
    account_equity: float = 0.0
    status: str = "completed"


class TaskRunRecord(BaseModel):
    task_id: str = Field(default_factory=lambda: uuid4().hex)
    mode: TradingMode
    task_name: str
    status: str = "success"
    summary: str = ""
    started_at: str = Field(default_factory=utc_now_iso)
    completed_at: str = Field(default_factory=utc_now_iso)


class StocksSettings(BaseModel):
    whitelist: list[str] = Field(
        default_factory=lambda: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "SPY", "QQQ"]
    )
    notifications_enabled: bool = True
    default_mode: TradingMode = TradingMode.PAPER
    risk_limits: RiskLimits = Field(default_factory=RiskLimits)


class StocksSettingsUpdateRequest(BaseModel):
    whitelist: list[str] | None = None
    notifications_enabled: bool | None = None
    default_mode: TradingMode | None = None
    risk_limits: RiskLimits | None = None


class ModeWorkspace(BaseModel):
    mode: TradingMode
    autopilot_state: AutopilotState = AutopilotState.PAUSED
    account: BrokerAccount
    positions: list[PositionState] = Field(default_factory=list)
    orders: list[StockOrder] = Field(default_factory=list)
    latest_snapshots: list[MarketSnapshot] = Field(default_factory=list)
    snapshot_history: dict[str, list[MarketSnapshot]] = Field(default_factory=dict)
    decision_cycles: list[DecisionCycleRecord] = Field(default_factory=list)
    task_runs: list[TaskRunRecord] = Field(default_factory=list)
    equity_curve: list[EquityPoint] = Field(default_factory=list)
    opened_today: dict[str, int] = Field(default_factory=dict)
    kill_switch_reason: str = ""
    last_market_poll_at: str = ""
    last_candidate_scan_at: str = ""
    last_reconcile_at: str = ""
    last_end_of_day_report_at: str = ""


class TradingWorkspace(BaseModel):
    owner_client_id: str
    settings: StocksSettings = Field(default_factory=StocksSettings)
    paper: ModeWorkspace = Field(
        default_factory=lambda: ModeWorkspace(
            mode=TradingMode.PAPER,
            account=BrokerAccount(
                mode=TradingMode.PAPER,
                equity=100000.0,
                cash=100000.0,
                buying_power=100000.0,
            ),
        )
    )
    live: ModeWorkspace = Field(
        default_factory=lambda: ModeWorkspace(
            mode=TradingMode.LIVE,
            account=BrokerAccount(
                mode=TradingMode.LIVE,
                equity=25000.0,
                cash=25000.0,
                buying_power=25000.0,
                provider_status=ProviderConnectionStatus.UNAVAILABLE,
                provider_name="alpaca-live",
            ),
        )
    )
    provider_statuses: list[ProviderStatus] = Field(default_factory=list)
    updated_at: str = Field(default_factory=utc_now_iso)

    def state_for(self, mode: TradingMode) -> ModeWorkspace:
        return self.paper if mode == TradingMode.PAPER else self.live


class StocksBootstrapResponse(BaseModel):
    settings: StocksSettings
    modes: list[TradingMode]
    autopilot_states: list[AutopilotState]
    strategies: list[StrategyTemplate]
    provider_statuses: list[ProviderStatus]
    promotion_gate: PromotionGateResult


class StocksAccountResponse(BaseModel):
    account: BrokerAccount


class StocksCandidatesResponse(BaseModel):
    mode: TradingMode
    candidates: list[TradeCandidate]
    ai_decisions: list[AiDecision]
    risk_outcomes: list[RiskGateResult]
    latest_cycle: DecisionCycleRecord | None = None


class StocksPositionsResponse(BaseModel):
    mode: TradingMode
    positions: list[PositionState]
    account: BrokerAccount


class StocksOrdersResponse(BaseModel):
    mode: TradingMode
    orders: list[StockOrder]
    positions: list[PositionState]
    account: BrokerAccount


class StocksDecisionCyclesResponse(BaseModel):
    mode: TradingMode | None = None
    items: list[DecisionCycleRecord]


class StocksAutopilotStateRequest(BaseModel):
    mode: TradingMode
    state: AutopilotState


class StocksAutopilotStateResponse(BaseModel):
    mode: TradingMode
    state: AutopilotState
    account: BrokerAccount
    promotion_gate: PromotionGateResult


class StocksKillSwitchRequest(BaseModel):
    mode: TradingMode
    reason: str = "Manual kill switch."


class StocksKillSwitchResponse(BaseModel):
    mode: TradingMode
    state: AutopilotState
    account: BrokerAccount
    reason: str

