import { startTransition } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ApiError } from '@/lib/api/client'
import type { RiskGateStatus, TradingMode, StockBrokerAccount } from '@/types'

import { useStocksCopy } from '@/features/stocks/copy'

export function useStocksMode(defaultMode: TradingMode = 'paper') {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchMode = searchParams.get('mode')
  const mode: TradingMode =
    searchMode === 'live' || searchMode === 'paper' ? searchMode : defaultMode

  const setMode = (nextMode: TradingMode) => {
    startTransition(() => {
      setSearchParams((current) => {
        const nextParams = new URLSearchParams(current)
        nextParams.set('mode', nextMode)
        return nextParams
      })
    })
  }

  return { mode, setMode }
}

export function getStocksErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const detail =
      error.details && typeof error.details === 'object' && 'detail' in error.details
        ? String((error.details as { detail?: unknown }).detail ?? '').trim()
        : ''

    if (detail) {
      return detail
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

export function useStocksLabels() {
  const copy = useStocksCopy()

  return {
    modeLabel(mode: TradingMode) {
      return mode === 'live' ? copy.shell.mode.live : copy.shell.mode.paper
    },
    autopilotLabel(state: StockBrokerAccount['autopilotState']) {
      return copy.states[state]
    },
    providerLabel(status: StockBrokerAccount['providerStatus']) {
      return copy.states[status]
    },
    riskLabel(status: RiskGateStatus) {
      return status === 'watch_only' ? copy.states.watchOnly : copy.states[status]
    },
  }
}

export function autopilotTone(state: StockBrokerAccount['autopilotState']) {
  if (state === 'running') return 'success' as const
  if (state === 'armed') return 'warning' as const
  if (state === 'halted') return 'danger' as const
  return 'neutral' as const
}

export function providerTone(status: StockBrokerAccount['providerStatus']) {
  if (status === 'connected') return 'success' as const
  if (status === 'simulated') return 'info' as const
  return 'warning' as const
}

export function riskTone(status: RiskGateStatus) {
  if (status === 'approved') return 'success' as const
  if (status === 'watch_only') return 'warning' as const
  return 'danger' as const
}

export function strategyLabel(strategy?: string) {
  if (!strategy) {
    return ''
  }

  return strategy
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}
