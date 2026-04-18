import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TradingCockpitPage } from '@/features/stocks/trading-cockpit-page'
import { renderWithAppState } from '@/tests/test-utils'
import type {
  DecisionCycleRecord,
  StockBrokerAccount,
  StockPositionState,
  StocksBootstrap,
} from '@/types'

const getBootstrap = vi.fn()
const getAccount = vi.fn()
const getPositions = vi.fn()
const getDecisionCycles = vi.fn()
const setAutopilotState = vi.fn()
const triggerKillSwitch = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    stocks: {
      getBootstrap,
      getAccount,
      getPositions,
      getDecisionCycles,
      setAutopilotState,
      triggerKillSwitch,
    },
  }),
}))

function buildBootstrap(): StocksBootstrap {
  return {
    settings: {
      whitelist: ['AAPL', 'MSFT', 'NVDA'],
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
    modes: ['paper', 'live'],
    autopilotStates: ['paused', 'armed', 'running', 'halted'],
    strategies: ['trend_follow', 'pullback_reclaim', 'breakout_confirmation'],
    providerStatuses: [],
    promotionGate: {
      eligibleForLiveArm: false,
      paperTradingDays: 18,
      fillSuccessRate: 1,
      unresolvedOrdersCount: 0,
      maxDrawdownPct: 0.02,
      riskExceptions: 0,
      blockers: ['Paper validation still needs 2 more trading days.'],
      evaluatedAt: '2026-04-19T03:00:00Z',
    },
  }
}

function buildAccount(): StockBrokerAccount {
  return {
    mode: 'paper',
    equity: 100000,
    cash: 93000,
    buyingPower: 93000,
    dayPnl: 420,
    grossExposurePct: 0.07,
    openPositions: 1,
    autopilotState: 'paused',
    killSwitchActive: false,
    providerStatus: 'simulated',
    providerName: 'alpaca-paper',
    updatedAt: '2026-04-19T03:00:00Z',
  }
}

function buildPosition(): StockPositionState {
  return {
    ticker: 'AAPL',
    companyName: 'Apple',
    mode: 'paper',
    direction: 'long',
    quantity: 30,
    averageEntryPrice: 197.5,
    marketPrice: 199.1,
    marketValue: 5973,
    unrealizedPnl: 48,
    realizedPnlToday: 0,
    entryStrategy: 'trend_follow',
    stopPrice: 191.5,
    takeProfitPrice: 209.3,
    openedAt: '2026-04-19T02:30:00Z',
    updatedAt: '2026-04-19T03:00:00Z',
  }
}

function buildCycle(): DecisionCycleRecord {
  return {
    cycleId: 'cycle-1',
    mode: 'paper',
    createdAt: '2026-04-19T03:00:00Z',
    summary: 'Candidate scan refreshed signals.',
    marketPhase: 'regular_session',
    snapshots: [],
    candidates: [],
    aiDecisions: [
      {
        decisionId: 'dec-1',
        ticker: 'AAPL',
        action: 'buy',
        selectedStrategy: 'trend_follow',
        confidence: 0.82,
        rankingScore: 81,
        rationale: 'AAPL remains the highest-ranked bounded long idea.',
        modelName: 'mock-hybrid-decider',
        generatedAt: '2026-04-19T03:00:00Z',
      },
    ],
    orderIntents: [],
    ordersSubmitted: [],
    riskOutcomes: [],
    accountEquity: 100000,
    status: 'scanned',
  }
}

describe('TradingCockpitPage', () => {
  beforeEach(() => {
    getBootstrap.mockReset()
    getAccount.mockReset()
    getPositions.mockReset()
    getDecisionCycles.mockReset()
    setAutopilotState.mockReset()
    triggerKillSwitch.mockReset()

    const account = buildAccount()
    getBootstrap.mockResolvedValue(buildBootstrap())
    getAccount.mockResolvedValue(account)
    getPositions.mockResolvedValue({
      mode: 'paper',
      positions: [buildPosition()],
      account,
    })
    getDecisionCycles.mockResolvedValue([buildCycle()])
    setAutopilotState.mockResolvedValue({
      mode: 'paper',
      state: 'armed',
      account: { ...account, autopilotState: 'armed' },
      promotionGate: buildBootstrap().promotionGate,
    })
    triggerKillSwitch.mockResolvedValue({
      mode: 'paper',
      state: 'halted',
      account: { ...account, autopilotState: 'halted', killSwitchActive: true },
      reason: 'Manual operator halt.',
    })
  })

  it('renders the cockpit summary, positions, and cycle snapshot', async () => {
    renderWithAppState(<TradingCockpitPage />, {
      route: '/stocks?mode=paper',
      apiMode: 'rest',
      locale: 'en',
    })

    expect(await screen.findByRole('heading', { name: 'Trading Cockpit' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Arm autopilot' })).toBeInTheDocument()
    await waitFor(() => {
      expect(getPositions).toHaveBeenCalledWith('paper')
      expect(getDecisionCycles).toHaveBeenCalledWith('paper')
    })
  })
})
