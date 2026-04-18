import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import {
  PageContainer,
  PageHeader,
  PageSection,
} from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { StockBrokerAccount, StocksBootstrap, TradingMode } from '@/types'

import { useStocksCopy } from '@/features/stocks/copy'
import {
  autopilotTone,
  providerTone,
  useStocksLabels,
} from '@/features/stocks/lib'

interface StocksWorkbenchShellProps {
  title: string
  description: string
  mode: TradingMode
  onModeChange: (mode: TradingMode) => void
  account?: StockBrokerAccount
  bootstrap?: StocksBootstrap
  actions?: ReactNode
  children: ReactNode
}

export function StocksWorkbenchShell({
  title,
  description,
  mode,
  onModeChange,
  account,
  bootstrap,
  actions,
  children,
}: StocksWorkbenchShellProps) {
  const copy = useStocksCopy()
  const { modeLabel, autopilotLabel, providerLabel } = useStocksLabels()

  const tabs = [
    { to: '/stocks', label: copy.shell.tabs.cockpit },
    { to: '/stocks/candidates', label: copy.shell.tabs.candidates },
    { to: '/stocks/orders', label: copy.shell.tabs.orders },
    { to: '/stocks/settings', label: copy.shell.tabs.settings },
  ] as const

  return (
    <PageContainer>
      <PageHeader
        eyebrow={copy.shell.eyebrow}
        title={title}
        description={description}
        actions={actions}
      />

      <PageSection className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={`${tab.to}?mode=${mode}`}>
                {({ isActive }) => (
                  <div
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-primary text-white shadow-[0_10px_22px_rgba(49,95,221,0.24)]'
                        : 'bg-app-bg-elevated text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {tab.label}
                  </div>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={mode === 'paper' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onModeChange('paper')}
            >
              {copy.shell.mode.paper}
            </Button>
            <Button
              variant={mode === 'live' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onModeChange('live')}
            >
              {copy.shell.mode.live}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {copy.shell.labels.autopilot}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold text-text-primary">{modeLabel(mode)}</p>
              {account ? (
                <Badge tone={autopilotTone(account.autopilotState)}>
                  {autopilotLabel(account.autopilotState)}
                </Badge>
              ) : null}
            </div>
          </Card>
          <Card className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {copy.shell.labels.provider}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold text-text-primary">
                {account?.providerName ?? 'alpaca'}
              </p>
              {account ? (
                <Badge tone={providerTone(account.providerStatus)}>
                  {providerLabel(account.providerStatus)}
                </Badge>
              ) : null}
            </div>
          </Card>
          <Card className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {copy.shell.labels.liveGate}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold text-text-primary">
                {bootstrap?.promotionGate.paperTradingDays ?? 0}/20
              </p>
              <Badge
                tone={bootstrap?.promotionGate.eligibleForLiveArm ? 'success' : 'warning'}
              >
                {bootstrap?.promotionGate.eligibleForLiveArm
                  ? copy.states.approved
                  : copy.states.blocked}
              </Badge>
            </div>
          </Card>
          <Card className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
              {copy.shell.labels.whitelist}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold text-text-primary">
                {bootstrap?.settings.whitelist.length ?? 0}
              </p>
              <p className="text-sm text-text-secondary">
                {copy.shell.labels.updated}
                {' · '}
                {account?.updatedAt
                  ? new Date(account.updatedAt).toLocaleTimeString()
                  : '--'}
              </p>
            </div>
          </Card>
        </div>
      </PageSection>

      {children}
    </PageContainer>
  )
}

