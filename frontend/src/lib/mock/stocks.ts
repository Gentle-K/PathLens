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
  StocksSettings,
  TradeCandidate,
  TradingMode,
  StrategyTemplate,
} from '@/types'

interface MockModeWorkspace {
  account: StockBrokerAccount
  positions: StockPositionState[]
  orders: StockOrder[]
  cycles: DecisionCycleRecord[]
  openedToday: Record<string, number>
  killSwitchReason: string
}

interface MockStocksWorkspace {
  settings: StocksSettings
  paper: MockModeWorkspace
  live: MockModeWorkspace
}

const STRATEGIES: StrategyTemplate[] = [
  'trend_follow',
  'pullback_reclaim',
  'breakout_confirmation',
]

const AUTOPILOT_STATES: AutopilotState[] = [
  'paused',
  'armed',
  'running',
  'halted',
]

const DEFAULT_WHITELIST = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL']

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  NVDA: 'NVIDIA',
  AMZN: 'Amazon',
  META: 'Meta',
  GOOGL: 'Alphabet',
  SPY: 'SPDR S&P 500 ETF',
  QQQ: 'Invesco QQQ',
}

const BASE_PRICES: Record<string, number> = {
  AAPL: 198,
  MSFT: 425,
  NVDA: 122,
  AMZN: 182,
  META: 501,
  GOOGL: 162,
  SPY: 512,
  QQQ: 438,
}

const createId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const nowIso = () => new Date().toISOString()

function createAccount(
  mode: TradingMode,
  providerStatus: StockBrokerAccount['providerStatus'],
  providerName: string,
  equity: number,
): StockBrokerAccount {
  return {
    mode,
    equity,
    cash: equity,
    buyingPower: equity,
    dayPnl: 0,
    grossExposurePct: 0,
    openPositions: 0,
    autopilotState: 'paused',
    killSwitchActive: false,
    providerStatus,
    providerName,
    updatedAt: nowIso(),
  }
}

function createModeWorkspace(
  mode: TradingMode,
  providerStatus: StockBrokerAccount['providerStatus'],
  providerName: string,
  equity: number,
): MockModeWorkspace {
  return {
    account: createAccount(mode, providerStatus, providerName, equity),
    positions: [],
    orders: [],
    cycles: [],
    openedToday: {},
    killSwitchReason: '',
  }
}

function createWorkspace(): MockStocksWorkspace {
  return {
    settings: {
      whitelist: [...DEFAULT_WHITELIST],
      notificationsEnabled: true,
      defaultMode: 'paper',
      riskLimits: {
        singlePositionCapPct: 0.1,
        grossExposureCapPct: 0.35,
        dailyLossStopPct: 0.03,
        maxOpenPositions: 4,
        maxNewEntriesPerSymbolPerDay: 1,
        allowExtendedHours: false,
        useMarketableLimitOrders: true,
        tradingWindowEt: '09:35-15:45',
      },
    },
    paper: createModeWorkspace('paper', 'simulated', 'alpaca-paper', 100000),
    live: createModeWorkspace('live', 'unavailable', 'alpaca-live', 25000),
  }
}

const workspace = createWorkspace()

function modeState(mode: TradingMode) {
  return mode === 'paper' ? workspace.paper : workspace.live
}

function refreshAccount(mode: TradingMode) {
  const state = modeState(mode)
  const marketValue = state.positions.reduce((total, position) => total + position.marketValue, 0)
  const equity = state.account.cash + marketValue
  const costBasis = state.positions.reduce(
    (total, position) => total + position.quantity * position.averageEntryPrice,
    0,
  )
  const unrealized = state.positions.reduce((total, position) => total + position.unrealizedPnl, 0)

  state.account = {
    ...state.account,
    equity,
    buyingPower: state.account.cash,
    grossExposurePct: equity > 0 ? marketValue / equity : 0,
    openPositions: state.positions.length,
    dayPnl: unrealized + (equity - state.account.cash - costBasis),
    updatedAt: nowIso(),
    killSwitchActive: state.account.autopilotState === 'halted',
  }

  return state.account
}

function providerStatuses(): StocksProviderStatus[] {
  return [
    {
      provider: 'polygon',
      status: 'simulated',
      detail: 'Structured stock snapshots are simulated in mock mode.',
      updatedAt: nowIso(),
    },
    {
      provider: 'alpaca',
      mode: 'paper',
      status: 'simulated',
      detail: 'Paper mode mirrors Alpaca account and order shapes without real submission.',
      updatedAt: nowIso(),
    },
    {
      provider: 'alpaca',
      mode: 'live',
      status: 'unavailable',
      detail: 'Live brokerage remains blocked in mock mode until promotion checks pass.',
      updatedAt: nowIso(),
    },
  ]
}

function buildSnapshot(ticker: string, index: number, mode: TradingMode): StockMarketSnapshot {
  const seed = ticker
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const base = BASE_PRICES[ticker] ?? 100 + index * 14
  const drift = ((seed % 7) - 2) * 0.002 + (mode === 'paper' ? 0.0015 : 0.0005)
  const openPrice = base * (1 - 0.004 + index * 0.0012)
  const lastPrice = base * (1 + drift)
  const highPrice = Math.max(lastPrice, openPrice) * 1.005
  const lowPrice = Math.min(lastPrice, openPrice) * 0.994
  const minuteClose = lastPrice * 1.001
  const minuteOpen = lastPrice * 0.997
  const minuteHigh = Math.max(minuteClose, minuteOpen) * 1.002
  const minuteLow = Math.min(minuteClose, minuteOpen) * 0.998
  const previousClose = base * (1 - drift * 0.8)

  return {
    ticker,
    companyName: COMPANY_NAMES[ticker] ?? ticker,
    asOf: nowIso(),
    lastPrice,
    openPrice,
    highPrice,
    lowPrice,
    previousClose,
    dayChangePct: (lastPrice - previousClose) / previousClose,
    volume: 1_300_000 + seed * 11 + index * 90_000,
    averageVolume: 1_000_000 + seed * 7,
    minuteClose,
    minuteOpen,
    minuteHigh,
    minuteLow,
    minuteVolume: 60_000 + index * 4_000,
    source: 'mock-snapshot',
    sourceStatus: 'simulated',
  }
}

function buildFeatures(snapshot: StockMarketSnapshot, index: number) {
  const volumeRatio = snapshot.volume / Math.max(snapshot.averageVolume, 1)
  const momentumPct = (snapshot.minuteClose - snapshot.openPrice) / snapshot.openPrice
  const intradayBreakout = snapshot.lastPrice >= snapshot.highPrice * 0.997
  const pullbackReclaim =
    snapshot.lastPrice > snapshot.openPrice &&
    snapshot.minuteOpen < snapshot.openPrice &&
    snapshot.minuteClose > snapshot.openPrice

  return {
    priceAboveShortSma: snapshot.lastPrice > snapshot.openPrice,
    shortSmaAboveLongSma: snapshot.minuteClose > snapshot.previousClose,
    volumeRatio,
    intradayBreakout,
    pullbackReclaim,
    momentumPct,
    distanceFromOpenPct: (snapshot.lastPrice - snapshot.openPrice) / snapshot.openPrice,
    riskBufferPct: 0.012 + index * 0.002,
    signalScore:
      (snapshot.dayChangePct > 0 ? 0.3 : 0) +
      (volumeRatio > 1.15 ? 0.25 : 0) +
      (intradayBreakout ? 0.25 : 0) +
      (pullbackReclaim ? 0.2 : 0),
  }
}

function preferredStrategyFor(index: number, features: ReturnType<typeof buildFeatures>) {
  if (features.intradayBreakout) {
    return 'breakout_confirmation' as const
  }
  if (features.pullbackReclaim) {
    return 'pullback_reclaim' as const
  }
  return index % 2 === 0 ? 'trend_follow' : 'pullback_reclaim'
}

function buildCandidates(mode: TradingMode) {
  return workspace.settings.whitelist.slice(0, 6).map((ticker, index) => {
    const snapshot = buildSnapshot(ticker, index, mode)
    const features = buildFeatures(snapshot, index)
    const preferredStrategy = preferredStrategyFor(index, features)
    const triggeredStrategies = STRATEGIES.filter((strategy) => {
      if (strategy === 'breakout_confirmation') return features.intradayBreakout
      if (strategy === 'pullback_reclaim') return features.pullbackReclaim
      return features.priceAboveShortSma && features.shortSmaAboveLongSma
    })

    const candidate: TradeCandidate = {
      candidateId: createId('cand'),
      ticker,
      companyName: snapshot.companyName,
      snapshot,
      features,
      triggeredStrategies: triggeredStrategies.length ? triggeredStrategies : [preferredStrategy],
      preferredStrategy,
      score: Math.min(0.98, 0.42 + features.signalScore),
      eligible: features.signalScore >= 0.45,
      notes: [
        `${ticker} is inside the whitelist universe.`,
        snapshot.dayChangePct > 0
          ? 'Relative strength remains constructive intraday.'
          : 'Signal quality is weaker until price reclaims the open.',
      ],
    }

    return candidate
  })
}

function buildDecision(candidate: TradeCandidate, index: number): AiDecision {
  const action: AiDecision['action'] =
    candidate.eligible && candidate.score > 0.68
      ? 'buy'
      : candidate.score > 0.55
        ? 'hold'
        : 'skip'

  return {
    decisionId: createId('dec'),
    ticker: candidate.ticker,
    action,
    selectedStrategy: candidate.preferredStrategy,
    confidence: Math.min(0.97, candidate.score + 0.08),
    rankingScore: Math.round((candidate.score - index * 0.015) * 1000) / 10,
    rationale:
      action === 'buy'
        ? `${candidate.ticker} shows aligned price, volume, and template behavior for a bounded long entry.`
        : action === 'hold'
          ? `${candidate.ticker} is constructive but still below the threshold for a fresh entry.`
          : `${candidate.ticker} is monitored but not actionable under the current template set.`,
    modelName: 'mock-hybrid-decider',
    generatedAt: nowIso(),
  }
}

function buildRiskGate(
  mode: TradingMode,
  candidate: TradeCandidate,
  decision: AiDecision,
): RiskGateResult {
  const state = modeState(mode)
  const limits = workspace.settings.riskLimits
  const maxNotionalUsd = refreshAccount(mode).equity * limits.singlePositionCapPct
  const suggestedQuantity = Math.max(0, Math.floor(maxNotionalUsd / candidate.snapshot.lastPrice))
  const existingPosition = state.positions.find((position) => position.ticker === candidate.ticker)
  const reasons: string[] = []
  const warnings: string[] = []
  let status: RiskGateResult['status'] = 'approved'

  if (decision.action !== 'buy') {
    status = 'watch_only'
    warnings.push('No new entry is being routed for this ticker.')
  }
  if (state.positions.length >= limits.maxOpenPositions && decision.action === 'buy' && !existingPosition) {
    status = 'blocked'
    reasons.push('Max concurrent positions reached.')
  }
  if (state.account.autopilotState === 'halted') {
    status = 'blocked'
    reasons.push('Kill switch is active for this mode.')
  }
  if ((state.openedToday[candidate.ticker] ?? 0) >= limits.maxNewEntriesPerSymbolPerDay && decision.action === 'buy') {
    status = 'blocked'
    reasons.push('This symbol already opened a new position today.')
  }
  if (
    refreshAccount(mode).grossExposurePct >= limits.grossExposureCapPct &&
    decision.action === 'buy' &&
    !existingPosition
  ) {
    status = 'blocked'
    reasons.push('Gross exposure cap reached.')
  }
  if (candidate.snapshot.dayChangePct < 0.001 && status === 'approved') {
    status = 'watch_only'
    warnings.push('Momentum is positive but not decisive enough for full conviction.')
  }

  return {
    gateId: createId('gate'),
    ticker: candidate.ticker,
    status,
    reasons,
    warnings,
    targetWeightPct: limits.singlePositionCapPct,
    maxNotionalUsd,
    suggestedQuantity,
    evaluatedAt: nowIso(),
  }
}

function executeApprovedIntent(
  mode: TradingMode,
  candidate: TradeCandidate,
  decision: AiDecision,
  riskGate: RiskGateResult,
  cycleId: string,
) {
  if (decision.action !== 'buy' || riskGate.status !== 'approved') {
    return null
  }

  const state = modeState(mode)
  if (state.positions.some((position) => position.ticker === candidate.ticker)) {
    return null
  }

  const limitPrice = Number((candidate.snapshot.lastPrice * 1.0015).toFixed(2))
  const notional = limitPrice * riskGate.suggestedQuantity
  if (riskGate.suggestedQuantity <= 0 || state.account.cash < notional) {
    return null
  }

  const intent: OrderIntent = {
    intentId: createId('intent'),
    cycleId,
    ticker: candidate.ticker,
    mode,
    action: 'buy',
    quantity: riskGate.suggestedQuantity,
    side: 'buy',
    orderType: 'limit',
    timeInForce: 'day',
    limitPrice,
    status: 'filled',
    rationale: decision.rationale,
    riskGate,
    submittedOrderId: createId('ord'),
    createdAt: nowIso(),
  }

  const order: StockOrder = {
    orderId: intent.submittedOrderId,
    clientOrderId: createId('clord'),
    mode,
    ticker: candidate.ticker,
    side: 'buy',
    quantity: intent.quantity,
    filledQuantity: intent.quantity,
    limitPrice,
    averageFillPrice: limitPrice,
    status: 'filled',
    sourceIntentId: intent.intentId,
    broker: mode === 'paper' ? 'alpaca-paper' : 'alpaca-live',
    submittedAt: nowIso(),
    updatedAt: nowIso(),
    metadata: {
      route: 'mock-mkt-limit',
      strategy: decision.selectedStrategy,
    },
  }

  const position: StockPositionState = {
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    mode,
    direction: 'long',
    quantity: intent.quantity,
    averageEntryPrice: limitPrice,
    marketPrice: candidate.snapshot.lastPrice,
    marketValue: candidate.snapshot.lastPrice * intent.quantity,
    unrealizedPnl: (candidate.snapshot.lastPrice - limitPrice) * intent.quantity,
    realizedPnlToday: 0,
    entryStrategy: decision.selectedStrategy,
    stopPrice: Number((limitPrice * 0.97).toFixed(2)),
    takeProfitPrice: Number((limitPrice * 1.06).toFixed(2)),
    openedAt: nowIso(),
    updatedAt: nowIso(),
  }

  state.orders.unshift(order)
  state.positions.unshift(position)
  state.account.cash -= notional
  state.openedToday[candidate.ticker] = (state.openedToday[candidate.ticker] ?? 0) + 1
  refreshAccount(mode)

  return { intent, order }
}

function revaluePositions(mode: TradingMode, snapshots: StockMarketSnapshot[]) {
  const state = modeState(mode)
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.ticker, snapshot]))

  state.positions = state.positions.map((position) => {
    const snapshot = snapshotMap.get(position.ticker)
    if (!snapshot) {
      return position
    }

    return {
      ...position,
      marketPrice: snapshot.lastPrice,
      marketValue: snapshot.lastPrice * position.quantity,
      unrealizedPnl: (snapshot.lastPrice - position.averageEntryPrice) * position.quantity,
      updatedAt: nowIso(),
    }
  })

  refreshAccount(mode)
}

function generateCycle(mode: TradingMode) {
  const state = modeState(mode)
  const candidates = buildCandidates(mode)
  const decisions = candidates.map(buildDecision)
  const riskOutcomes = candidates.map((candidate, index) =>
    buildRiskGate(mode, candidate, decisions[index]!),
  )
  const cycleId = createId('cycle')
  const orderIntents: OrderIntent[] = []
  const ordersSubmitted: string[] = []

  revaluePositions(
    mode,
    candidates.map((candidate) => candidate.snapshot),
  )

  if (state.account.autopilotState === 'running') {
    const topCandidate = candidates.find((candidate) => candidate.eligible)
    const topDecision = topCandidate
      ? decisions.find((decision) => decision.ticker === topCandidate.ticker)
      : undefined
    const topRiskGate = topCandidate
      ? riskOutcomes.find((risk) => risk.ticker === topCandidate.ticker)
      : undefined

    if (topCandidate && topDecision && topRiskGate) {
      const executed = executeApprovedIntent(
        mode,
        topCandidate,
        topDecision,
        topRiskGate,
        cycleId,
      )
      if (executed) {
        orderIntents.push(executed.intent)
        ordersSubmitted.push(executed.order.orderId)
      }
    }
  }

  const cycle: DecisionCycleRecord = {
    cycleId,
    mode,
    createdAt: nowIso(),
    summary:
      state.account.autopilotState === 'running'
        ? 'Decision cycle evaluated candidates and routed one bounded order when all gates passed.'
        : 'Candidate scan refreshed signals, AI ranking, and hard risk gates without routing orders.',
    marketPhase: 'regular_session',
    snapshots: candidates.map((candidate) => candidate.snapshot),
    candidates,
    aiDecisions: decisions,
    orderIntents,
    ordersSubmitted,
    riskOutcomes,
    accountEquity: refreshAccount(mode).equity,
    status: state.account.autopilotState === 'running' ? 'executed' : 'scanned',
  }

  state.cycles.unshift(cycle)
  state.cycles = state.cycles.slice(0, 25)
  state.orders = state.orders.slice(0, 25)
  refreshAccount(mode)

  return cycle
}

function fillSuccessRate() {
  const totalOrders = workspace.paper.orders.length
  if (!totalOrders) {
    return 1
  }
  const filledOrders = workspace.paper.orders.filter((order) => order.status === 'filled').length
  return filledOrders / totalOrders
}

export function getMockStocksPromotionGate(): PromotionGateResult {
  const paperTradingDays = Math.min(20, 18 + Math.floor(workspace.paper.cycles.length / 2))
  const maxDrawdownPct = 0.028
  const unresolvedOrdersCount = workspace.paper.orders.filter(
    (order) => order.status === 'submitted' || order.status === 'ready_not_sent',
  ).length
  const riskExceptions = 0
  const blockers: string[] = []

  if (paperTradingDays < 20) {
    blockers.push(`Paper validation still needs ${20 - paperTradingDays} more trading days.`)
  }
  if (fillSuccessRate() < 0.99) {
    blockers.push('Order lifecycle reliability is still below the 99% promotion threshold.')
  }
  if (unresolvedOrdersCount > 0) {
    blockers.push('There are unresolved orders waiting for reconciliation.')
  }
  if (maxDrawdownPct > 0.05) {
    blockers.push('Maximum drawdown exceeds the live promotion ceiling.')
  }
  if (riskExceptions > 0) {
    blockers.push('Risk exception logs must be cleared before live arming is allowed.')
  }

  return {
    eligibleForLiveArm: blockers.length === 0,
    paperTradingDays,
    fillSuccessRate: fillSuccessRate(),
    unresolvedOrdersCount,
    maxDrawdownPct,
    riskExceptions,
    blockers,
    evaluatedAt: nowIso(),
  }
}

export function getMockStocksBootstrap(): StocksBootstrap {
  refreshAccount('paper')
  refreshAccount('live')
  return {
    settings: structuredClone(workspace.settings),
    modes: ['paper', 'live'],
    autopilotStates: AUTOPILOT_STATES,
    strategies: STRATEGIES,
    providerStatuses: providerStatuses(),
    promotionGate: getMockStocksPromotionGate(),
  }
}

export function getMockStocksAccount(mode: TradingMode) {
  return structuredClone(refreshAccount(mode))
}

export function getMockStocksCandidates(mode: TradingMode) {
  const cycle = generateCycle(mode)
  return {
    mode,
    candidates: structuredClone(cycle.candidates),
    aiDecisions: structuredClone(cycle.aiDecisions),
    riskOutcomes: structuredClone(cycle.riskOutcomes),
    latestCycle: structuredClone(cycle),
  }
}

export function getMockStocksPositions(mode: TradingMode) {
  const state = modeState(mode)
  refreshAccount(mode)
  return {
    mode,
    positions: structuredClone(state.positions),
    account: structuredClone(state.account),
  }
}

export function getMockStocksOrders(mode: TradingMode) {
  const state = modeState(mode)
  refreshAccount(mode)
  return {
    mode,
    orders: structuredClone(state.orders),
    positions: structuredClone(state.positions),
    account: structuredClone(state.account),
  }
}

export function setMockStocksAutopilotState(mode: TradingMode, nextState: AutopilotState) {
  const state = modeState(mode)
  const promotionGate = getMockStocksPromotionGate()

  if (nextState === 'armed' && mode === 'live' && !promotionGate.eligibleForLiveArm) {
    throw new Error('Live mode cannot be armed until the promotion gate passes.')
  }
  if (nextState === 'running' && state.account.autopilotState !== 'armed') {
    throw new Error('Autopilot must be armed before it can run.')
  }

  state.account.autopilotState = nextState
  state.account.killSwitchActive = nextState === 'halted'
  if (nextState !== 'halted') {
    state.killSwitchReason = ''
  }
  refreshAccount(mode)

  return {
    mode,
    state: nextState,
    account: structuredClone(state.account),
    promotionGate,
  }
}

export function triggerMockStocksKillSwitch(mode: TradingMode, reason: string) {
  const state = modeState(mode)
  state.account.autopilotState = 'halted'
  state.account.killSwitchActive = true
  state.killSwitchReason = reason
  refreshAccount(mode)

  return {
    mode,
    state: 'halted' as const,
    account: structuredClone(state.account),
    reason,
  }
}

export function updateMockStocksSettings(payload: Partial<StocksSettings>) {
  workspace.settings = {
    ...workspace.settings,
    ...payload,
    whitelist:
      payload.whitelist?.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean) ??
      workspace.settings.whitelist,
    riskLimits: payload.riskLimits
      ? {
          ...workspace.settings.riskLimits,
          ...payload.riskLimits,
        }
      : workspace.settings.riskLimits,
  }

  return getMockStocksBootstrap()
}

export function getMockStocksDecisionCycles(mode?: TradingMode) {
  if (!mode) {
    return structuredClone([...workspace.paper.cycles, ...workspace.live.cycles]).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
  }
  return structuredClone(modeState(mode).cycles)
}
