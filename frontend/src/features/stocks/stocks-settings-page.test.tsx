import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StocksSettingsPage } from '@/features/stocks/stocks-settings-page'
import { renderWithAppState } from '@/tests/test-utils'
import type { StocksBootstrap } from '@/types'

const getBootstrap = vi.fn()
const updateSettings = vi.fn()

vi.mock('@/lib/api/use-api-adapter', () => ({
  useApiAdapter: () => ({
    stocks: {
      getBootstrap,
      updateSettings,
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
    providerStatuses: [
      {
        provider: 'polygon',
        status: 'simulated',
        detail: 'Structured stock snapshots are simulated in mock mode.',
        updatedAt: '2026-04-19T03:00:00Z',
      },
    ],
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

describe('StocksSettingsPage', () => {
  beforeEach(() => {
    getBootstrap.mockReset()
    updateSettings.mockReset()

    getBootstrap.mockResolvedValue(buildBootstrap())
    updateSettings.mockResolvedValue(buildBootstrap())
  })

  it('saves whitelist and guardrail settings through the stocks adapter', async () => {
    const user = userEvent.setup()
    renderWithAppState(<StocksSettingsPage />, {
      route: '/stocks/settings?mode=paper',
      apiMode: 'rest',
      locale: 'en',
    })

    expect(await screen.findByRole('heading', { name: 'Stocks Settings' })).toBeInTheDocument()

    const whitelistField = await screen.findByDisplayValue('AAPL, MSFT, NVDA')
    await user.clear(whitelistField)
    await user.type(whitelistField, 'AAPL, META, GOOGL')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        whitelist: ['AAPL', 'META', 'GOOGL'],
        defaultMode: 'paper',
        notificationsEnabled: true,
      }),
    )
  })
})
