import type {
  AiDecision,
  AutopilotState,
  DecisionCycleRecord,
  OrderIntent,
  PromotionGateResult,
  RiskGateResult,
  StockBrokerAccount,
  StockMarketSnapshot,
  StockOrder,
  StockPositionState,
  StocksBootstrap,
  StocksProviderStatus,
  StocksRiskLimits,
  StocksSettings,
  TradeCandidate,
  TradingMode,
  SignalFeatureSet,
} from '@/types'

export interface BackendStocksRiskLimits {
  single_position_cap_pct: number
  gross_exposure_cap_pct: number
  daily_loss_stop_pct: number
  max_open_positions: number
  max_new_entries_per_symbol_per_day: number
  allow_extended_hours: boolean
  use_marketable_limit_orders: boolean
  trading_window_et: string
}

export interface BackendStocksSettings {
  whitelist: string[]
  notifications_enabled: boolean
  default_mode: TradingMode
  risk_limits: BackendStocksRiskLimits
}

export interface BackendStocksProviderStatus {
  provider: string
  mode?: TradingMode | null
  status: StockBrokerAccount['providerStatus']
  detail: string
  updated_at: string
}

export interface BackendStockMarketSnapshot {
  ticker: string
  company_name: string
  as_of: string
  last_price: number
  open_price: number
  high_price: number
  low_price: number
  previous_close: number
  day_change_pct: number
  volume: number
  average_volume: number
  minute_close: number
  minute_open: number
  minute_high: number
  minute_low: number
  minute_volume: number
  source: string
  source_status: StockBrokerAccount['providerStatus']
}

export interface BackendSignalFeatureSet {
  price_above_short_sma: boolean
  short_sma_above_long_sma: boolean
  volume_ratio: number
  intraday_breakout: boolean
  pullback_reclaim: boolean
  momentum_pct: number
  distance_from_open_pct: number
  risk_buffer_pct: number
  signal_score: number
}

export interface BackendTradeCandidate {
  candidate_id: string
  ticker: string
  company_name: string
  snapshot: BackendStockMarketSnapshot
  features: BackendSignalFeatureSet
  triggered_strategies: TradeCandidate['triggeredStrategies']
  preferred_strategy?: TradeCandidate['preferredStrategy'] | null
  score: number
  eligible: boolean
  notes: string[]
}

export interface BackendAiDecision {
  decision_id: string
  ticker: string
  action: AiDecision['action']
  selected_strategy?: AiDecision['selectedStrategy'] | null
  confidence: number
  ranking_score: number
  rationale: string
  model_name: string
  generated_at: string
}

export interface BackendRiskGateResult {
  gate_id: string
  ticker: string
  status: RiskGateResult['status']
  reasons: string[]
  warnings: string[]
  target_weight_pct: number
  max_notional_usd: number
  suggested_quantity: number
  evaluated_at: string
}

export interface BackendOrderIntent {
  intent_id: string
  cycle_id: string
  ticker: string
  mode: TradingMode
  action: OrderIntent['action']
  quantity: number
  side: string
  order_type: string
  time_in_force: string
  limit_price: number
  status: OrderIntent['status']
  rationale: string
  risk_gate: BackendRiskGateResult
  submitted_order_id: string
  created_at: string
}

export interface BackendStockOrder {
  order_id: string
  client_order_id: string
  mode: TradingMode
  ticker: string
  side: string
  quantity: number
  filled_quantity: number
  limit_price: number
  average_fill_price: number
  status: StockOrder['status']
  source_intent_id: string
  broker: string
  submitted_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface BackendStockPositionState {
  ticker: string
  company_name: string
  mode: TradingMode
  direction: StockPositionState['direction']
  quantity: number
  average_entry_price: number
  market_price: number
  market_value: number
  unrealized_pnl: number
  realized_pnl_today: number
  entry_strategy?: StockPositionState['entryStrategy'] | null
  stop_price: number
  take_profit_price: number
  opened_at: string
  updated_at: string
}

export interface BackendStockBrokerAccount {
  mode: TradingMode
  equity: number
  cash: number
  buying_power: number
  day_pnl: number
  gross_exposure_pct: number
  open_positions: number
  autopilot_state: AutopilotState
  kill_switch_active: boolean
  provider_status: StockBrokerAccount['providerStatus']
  provider_name: string
  updated_at: string
}

export interface BackendPromotionGateResult {
  eligible_for_live_arm: boolean
  paper_trading_days: number
  fill_success_rate: number
  unresolved_orders_count: number
  max_drawdown_pct: number
  risk_exceptions: number
  blockers: string[]
  evaluated_at: string
}

export interface BackendDecisionCycleRecord {
  cycle_id: string
  mode: TradingMode
  created_at: string
  summary: string
  market_phase: string
  snapshots: BackendStockMarketSnapshot[]
  candidates: BackendTradeCandidate[]
  ai_decisions: BackendAiDecision[]
  order_intents: BackendOrderIntent[]
  orders_submitted: string[]
  risk_outcomes: BackendRiskGateResult[]
  account_equity: number
  status: string
}

export interface BackendStocksBootstrapResponse {
  settings: BackendStocksSettings
  modes: TradingMode[]
  autopilot_states: AutopilotState[]
  strategies: StocksBootstrap['strategies']
  provider_statuses: BackendStocksProviderStatus[]
  promotion_gate: BackendPromotionGateResult
}

export interface BackendStocksAccountResponse {
  account: BackendStockBrokerAccount
}

export interface BackendStocksCandidatesResponse {
  mode: TradingMode
  candidates: BackendTradeCandidate[]
  ai_decisions: BackendAiDecision[]
  risk_outcomes: BackendRiskGateResult[]
  latest_cycle?: BackendDecisionCycleRecord | null
}

export interface BackendStocksPositionsResponse {
  mode: TradingMode
  positions: BackendStockPositionState[]
  account: BackendStockBrokerAccount
}

export interface BackendStocksOrdersResponse {
  mode: TradingMode
  orders: BackendStockOrder[]
  positions: BackendStockPositionState[]
  account: BackendStockBrokerAccount
}

export interface BackendStocksAutopilotStateResponse {
  mode: TradingMode
  state: AutopilotState
  account: BackendStockBrokerAccount
  promotion_gate: BackendPromotionGateResult
}

export interface BackendStocksKillSwitchResponse {
  mode: TradingMode
  state: AutopilotState
  account: BackendStockBrokerAccount
  reason: string
}

export interface BackendStocksDecisionCyclesResponse {
  mode?: TradingMode | null
  items: BackendDecisionCycleRecord[]
}

function mapRiskLimits(payload: BackendStocksRiskLimits): StocksRiskLimits {
  return {
    singlePositionCapPct: payload.single_position_cap_pct,
    grossExposureCapPct: payload.gross_exposure_cap_pct,
    dailyLossStopPct: payload.daily_loss_stop_pct,
    maxOpenPositions: payload.max_open_positions,
    maxNewEntriesPerSymbolPerDay: payload.max_new_entries_per_symbol_per_day,
    allowExtendedHours: payload.allow_extended_hours,
    useMarketableLimitOrders: payload.use_marketable_limit_orders,
    tradingWindowEt: payload.trading_window_et,
  }
}

export function mapStocksSettings(payload: BackendStocksSettings): StocksSettings {
  return {
    whitelist: payload.whitelist ?? [],
    notificationsEnabled: Boolean(payload.notifications_enabled),
    defaultMode: payload.default_mode,
    riskLimits: mapRiskLimits(payload.risk_limits),
  }
}

export function mapStocksProviderStatus(
  payload: BackendStocksProviderStatus,
): StocksProviderStatus {
  return {
    provider: payload.provider,
    mode: payload.mode ?? undefined,
    status: payload.status,
    detail: payload.detail,
    updatedAt: payload.updated_at,
  }
}

export function mapStockMarketSnapshot(
  payload: BackendStockMarketSnapshot,
): StockMarketSnapshot {
  return {
    ticker: payload.ticker,
    companyName: payload.company_name,
    asOf: payload.as_of,
    lastPrice: payload.last_price,
    openPrice: payload.open_price,
    highPrice: payload.high_price,
    lowPrice: payload.low_price,
    previousClose: payload.previous_close,
    dayChangePct: payload.day_change_pct,
    volume: payload.volume,
    averageVolume: payload.average_volume,
    minuteClose: payload.minute_close,
    minuteOpen: payload.minute_open,
    minuteHigh: payload.minute_high,
    minuteLow: payload.minute_low,
    minuteVolume: payload.minute_volume,
    source: payload.source,
    sourceStatus: payload.source_status,
  }
}

export function mapSignalFeatureSet(payload: BackendSignalFeatureSet): SignalFeatureSet {
  return {
    priceAboveShortSma: payload.price_above_short_sma,
    shortSmaAboveLongSma: payload.short_sma_above_long_sma,
    volumeRatio: payload.volume_ratio,
    intradayBreakout: payload.intraday_breakout,
    pullbackReclaim: payload.pullback_reclaim,
    momentumPct: payload.momentum_pct,
    distanceFromOpenPct: payload.distance_from_open_pct,
    riskBufferPct: payload.risk_buffer_pct,
    signalScore: payload.signal_score,
  }
}

export function mapTradeCandidate(payload: BackendTradeCandidate): TradeCandidate {
  return {
    candidateId: payload.candidate_id,
    ticker: payload.ticker,
    companyName: payload.company_name,
    snapshot: mapStockMarketSnapshot(payload.snapshot),
    features: mapSignalFeatureSet(payload.features),
    triggeredStrategies: payload.triggered_strategies ?? [],
    preferredStrategy: payload.preferred_strategy ?? undefined,
    score: payload.score,
    eligible: Boolean(payload.eligible),
    notes: payload.notes ?? [],
  }
}

export function mapAiDecision(payload: BackendAiDecision): AiDecision {
  return {
    decisionId: payload.decision_id,
    ticker: payload.ticker,
    action: payload.action,
    selectedStrategy: payload.selected_strategy ?? undefined,
    confidence: payload.confidence,
    rankingScore: payload.ranking_score,
    rationale: payload.rationale,
    modelName: payload.model_name,
    generatedAt: payload.generated_at,
  }
}

export function mapRiskGateResult(payload: BackendRiskGateResult): RiskGateResult {
  return {
    gateId: payload.gate_id,
    ticker: payload.ticker,
    status: payload.status,
    reasons: payload.reasons ?? [],
    warnings: payload.warnings ?? [],
    targetWeightPct: payload.target_weight_pct,
    maxNotionalUsd: payload.max_notional_usd,
    suggestedQuantity: payload.suggested_quantity,
    evaluatedAt: payload.evaluated_at,
  }
}

export function mapOrderIntent(payload: BackendOrderIntent): OrderIntent {
  return {
    intentId: payload.intent_id,
    cycleId: payload.cycle_id,
    ticker: payload.ticker,
    mode: payload.mode,
    action: payload.action,
    quantity: payload.quantity,
    side: payload.side,
    orderType: payload.order_type,
    timeInForce: payload.time_in_force,
    limitPrice: payload.limit_price,
    status: payload.status,
    rationale: payload.rationale,
    riskGate: mapRiskGateResult(payload.risk_gate),
    submittedOrderId: payload.submitted_order_id,
    createdAt: payload.created_at,
  }
}

export function mapStockOrder(payload: BackendStockOrder): StockOrder {
  return {
    orderId: payload.order_id,
    clientOrderId: payload.client_order_id,
    mode: payload.mode,
    ticker: payload.ticker,
    side: payload.side,
    quantity: payload.quantity,
    filledQuantity: payload.filled_quantity,
    limitPrice: payload.limit_price,
    averageFillPrice: payload.average_fill_price,
    status: payload.status,
    sourceIntentId: payload.source_intent_id,
    broker: payload.broker,
    submittedAt: payload.submitted_at,
    updatedAt: payload.updated_at,
    metadata: payload.metadata ?? {},
  }
}

export function mapStockPositionState(
  payload: BackendStockPositionState,
): StockPositionState {
  return {
    ticker: payload.ticker,
    companyName: payload.company_name,
    mode: payload.mode,
    direction: payload.direction,
    quantity: payload.quantity,
    averageEntryPrice: payload.average_entry_price,
    marketPrice: payload.market_price,
    marketValue: payload.market_value,
    unrealizedPnl: payload.unrealized_pnl,
    realizedPnlToday: payload.realized_pnl_today,
    entryStrategy: payload.entry_strategy ?? undefined,
    stopPrice: payload.stop_price,
    takeProfitPrice: payload.take_profit_price,
    openedAt: payload.opened_at,
    updatedAt: payload.updated_at,
  }
}

export function mapStockBrokerAccount(
  payload: BackendStockBrokerAccount,
): StockBrokerAccount {
  return {
    mode: payload.mode,
    equity: payload.equity,
    cash: payload.cash,
    buyingPower: payload.buying_power,
    dayPnl: payload.day_pnl,
    grossExposurePct: payload.gross_exposure_pct,
    openPositions: payload.open_positions,
    autopilotState: payload.autopilot_state,
    killSwitchActive: Boolean(payload.kill_switch_active),
    providerStatus: payload.provider_status,
    providerName: payload.provider_name,
    updatedAt: payload.updated_at,
  }
}

export function mapPromotionGateResult(
  payload: BackendPromotionGateResult,
): PromotionGateResult {
  return {
    eligibleForLiveArm: Boolean(payload.eligible_for_live_arm),
    paperTradingDays: payload.paper_trading_days,
    fillSuccessRate: payload.fill_success_rate,
    unresolvedOrdersCount: payload.unresolved_orders_count,
    maxDrawdownPct: payload.max_drawdown_pct,
    riskExceptions: payload.risk_exceptions,
    blockers: payload.blockers ?? [],
    evaluatedAt: payload.evaluated_at,
  }
}

export function mapDecisionCycleRecord(
  payload: BackendDecisionCycleRecord,
): DecisionCycleRecord {
  return {
    cycleId: payload.cycle_id,
    mode: payload.mode,
    createdAt: payload.created_at,
    summary: payload.summary,
    marketPhase: payload.market_phase,
    snapshots: (payload.snapshots ?? []).map(mapStockMarketSnapshot),
    candidates: (payload.candidates ?? []).map(mapTradeCandidate),
    aiDecisions: (payload.ai_decisions ?? []).map(mapAiDecision),
    orderIntents: (payload.order_intents ?? []).map(mapOrderIntent),
    ordersSubmitted: payload.orders_submitted ?? [],
    riskOutcomes: (payload.risk_outcomes ?? []).map(mapRiskGateResult),
    accountEquity: payload.account_equity,
    status: payload.status,
  }
}

export function mapStocksBootstrap(
  payload: BackendStocksBootstrapResponse,
): StocksBootstrap {
  return {
    settings: mapStocksSettings(payload.settings),
    modes: payload.modes ?? [],
    autopilotStates: payload.autopilot_states ?? [],
    strategies: payload.strategies ?? [],
    providerStatuses: (payload.provider_statuses ?? []).map(mapStocksProviderStatus),
    promotionGate: mapPromotionGateResult(payload.promotion_gate),
  }
}

export function toBackendStocksSettingsUpdate(payload: Partial<StocksSettings>) {
  const nextPayload: Record<string, unknown> = {}

  if (payload.whitelist) {
    nextPayload['whitelist'] = payload.whitelist
  }
  if (typeof payload.notificationsEnabled === 'boolean') {
    nextPayload['notifications_enabled'] = payload.notificationsEnabled
  }
  if (payload.defaultMode) {
    nextPayload['default_mode'] = payload.defaultMode
  }
  if (payload.riskLimits) {
    nextPayload['risk_limits'] = {
      single_position_cap_pct: payload.riskLimits.singlePositionCapPct,
      gross_exposure_cap_pct: payload.riskLimits.grossExposureCapPct,
      daily_loss_stop_pct: payload.riskLimits.dailyLossStopPct,
      max_open_positions: payload.riskLimits.maxOpenPositions,
      max_new_entries_per_symbol_per_day: payload.riskLimits.maxNewEntriesPerSymbolPerDay,
      allow_extended_hours: payload.riskLimits.allowExtendedHours,
      use_marketable_limit_orders: payload.riskLimits.useMarketableLimitOrders,
      trading_window_et: payload.riskLimits.tradingWindowEt,
    }
  }

  return nextPayload
}
