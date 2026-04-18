import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, PauseCircle, PlayCircle, RefreshCw, ShieldBan } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'

import { ErrorState } from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { formatDateTime, formatMoney, formatPercent } from '@/lib/utils/format'
import { StocksWorkbenchShell } from '@/features/stocks/workbench-shell'
import { useStocksCopy } from '@/features/stocks/copy'
import {
  autopilotTone,
  getStocksErrorMessage,
  providerTone,
  useStocksLabels,
  useStocksMode,
  strategyLabel,
} from '@/features/stocks/lib'

export function TradingCockpitPage() {
  const adapter = useApiAdapter()
  const copy = useStocksCopy()
  const locale = useAppStore((state) => state.locale)
  const queryClient = useQueryClient()
  const bootstrapQuery = useQuery({
    queryKey: ['stocks', 'bootstrap'],
    queryFn: adapter.stocks.getBootstrap,
  })
  const { mode, setMode } = useStocksMode(bootstrapQuery.data?.settings.defaultMode ?? 'paper')

  const accountQuery = useQuery({
    queryKey: ['stocks', 'account', mode],
    queryFn: () => adapter.stocks.getAccount(mode),
    refetchInterval: 15_000,
  })
  const positionsQuery = useQuery({
    queryKey: ['stocks', 'positions', mode],
    queryFn: () => adapter.stocks.getPositions(mode),
    refetchInterval: 15_000,
  })
  const cyclesQuery = useQuery({
    queryKey: ['stocks', 'decision-cycles', mode],
    queryFn: () => adapter.stocks.getDecisionCycles(mode),
    refetchInterval: 15_000,
  })

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stocks', 'bootstrap'] }),
      queryClient.invalidateQueries({ queryKey: ['stocks', 'account', mode] }),
      queryClient.invalidateQueries({ queryKey: ['stocks', 'positions', mode] }),
      queryClient.invalidateQueries({ queryKey: ['stocks', 'decision-cycles', mode] }),
    ])
  }

  const stateMutation = useMutation({
    mutationFn: (nextState: 'paused' | 'armed' | 'running' | 'halted') =>
      adapter.stocks.setAutopilotState(mode, nextState),
    onSuccess: async () => {
      toast.success(copy.messages.stateUpdated)
      await refreshAll()
    },
    onError: (error) => {
      toast.error(getStocksErrorMessage(error, copy.actions.retry))
    },
  })
  const killSwitchMutation = useMutation({
    mutationFn: () => adapter.stocks.triggerKillSwitch(mode, 'Manual operator halt.'),
    onSuccess: async () => {
      toast.error(copy.messages.killSwitch)
      await refreshAll()
    },
    onError: (error) => {
      toast.error(getStocksErrorMessage(error, copy.actions.retry))
    },
  })

  const account = accountQuery.data
  const positions = positionsQuery.data?.positions ?? []
  const latestCycle = cyclesQuery.data?.[0]
  const { autopilotLabel, providerLabel } = useStocksLabels()

  const actions = useMemo(() => {
    if (!account) {
      return null
    }

    return (
      <>
        {account.autopilotState === 'paused' ? (
          <Button
            variant="secondary"
            onClick={() => stateMutation.mutate('armed')}
            disabled={stateMutation.isPending}
          >
            <PlayCircle className="size-4" />
            {copy.actions.arm}
          </Button>
        ) : null}
        {account.autopilotState === 'armed' ? (
          <Button onClick={() => stateMutation.mutate('running')} disabled={stateMutation.isPending}>
            <PlayCircle className="size-4" />
            {copy.actions.run}
          </Button>
        ) : null}
        {account.autopilotState === 'running' ? (
          <Button
            variant="secondary"
            onClick={() => stateMutation.mutate('paused')}
            disabled={stateMutation.isPending}
          >
            <PauseCircle className="size-4" />
            {copy.actions.pause}
          </Button>
        ) : null}
        <Button
          variant="danger"
          onClick={() => killSwitchMutation.mutate()}
          disabled={killSwitchMutation.isPending}
        >
          <ShieldBan className="size-4" />
          {copy.actions.halt}
        </Button>
        <Button variant="secondary" onClick={() => void refreshAll()}>
          <RefreshCw className="size-4" />
          {copy.actions.refresh}
        </Button>
      </>
    )
  }, [account, copy.actions.arm, copy.actions.halt, copy.actions.pause, copy.actions.refresh, copy.actions.run, killSwitchMutation, refreshAll, stateMutation])

  if (bootstrapQuery.isError || accountQuery.isError || positionsQuery.isError || cyclesQuery.isError) {
    return (
      <ErrorState
        title={copy.pages.cockpit.title}
        description={getStocksErrorMessage(
          bootstrapQuery.error ?? accountQuery.error ?? positionsQuery.error ?? cyclesQuery.error,
          copy.actions.retry,
        )}
        action={
          <Button variant="secondary" onClick={() => void refreshAll()}>
            {copy.actions.retry}
          </Button>
        }
      />
    )
  }

  return (
    <StocksWorkbenchShell
      title={copy.pages.cockpit.title}
      description={copy.pages.cockpit.description}
      mode={mode}
      onModeChange={setMode}
      account={account}
      bootstrap={bootstrapQuery.data}
      actions={actions}
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              {account ? (
                <>
                  <Badge tone={autopilotTone(account.autopilotState)}>
                    {autopilotLabel(account.autopilotState)}
                  </Badge>
                  <Badge tone={providerTone(account.providerStatus)}>
                    {providerLabel(account.providerStatus)}
                  </Badge>
                  {account.killSwitchActive ? (
                    <Badge tone="danger">{copy.states.halted}</Badge>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label={copy.metrics.equity}
                value={formatMoney(account?.equity, 'USD', locale)}
              />
              <MetricCard
                label={copy.metrics.buyingPower}
                value={formatMoney(account?.buyingPower, 'USD', locale)}
              />
              <MetricCard
                label={copy.metrics.dayPnl}
                value={formatMoney(account?.dayPnl, 'USD', locale)}
              />
              <MetricCard
                label={copy.metrics.grossExposure}
                value={formatPercent(account?.grossExposurePct ?? 0, locale)}
              />
              <MetricCard
                label={copy.metrics.openPositions}
                value={String(account?.openPositions ?? 0)}
              />
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-text-primary">{copy.sections.positions}</p>
                <p className="text-sm text-text-secondary">
                  {mode === 'live' ? copy.shell.mode.live : copy.shell.mode.paper}
                </p>
              </div>
              <Badge tone={positions.length ? 'info' : 'neutral'}>
                {copy.metrics.openPositions}: {positions.length}
              </Badge>
            </div>
            {positions.length ? (
              <div className="space-y-3">
                {positions.map((position) => (
                  <div
                    key={position.ticker}
                    className="grid gap-3 rounded-[22px] bg-app-bg-elevated p-4 md:grid-cols-[minmax(0,1fr)_repeat(3,auto)] md:items-center"
                  >
                    <div>
                      <p className="text-base font-semibold text-text-primary">{position.ticker}</p>
                      <p className="text-sm text-text-secondary">
                        {position.companyName}
                        {position.entryStrategy
                          ? ` · ${strategyLabel(position.entryStrategy)}`
                          : ''}
                      </p>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {formatMoney(position.marketValue, 'USD', locale)}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {formatMoney(position.unrealizedPnl, 'USD', locale)}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {formatMoney(position.stopPrice, 'USD', locale)}
                      {' / '}
                      {formatMoney(position.takeProfitPrice, 'USD', locale)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{copy.empty.positions}</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.promotionGate}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard
                label={copy.metrics.paperDays}
                value={`${bootstrapQuery.data?.promotionGate.paperTradingDays ?? 0}/20`}
              />
              <MetricCard
                label={copy.metrics.fillRate}
                value={formatPercent(bootstrapQuery.data?.promotionGate.fillSuccessRate ?? 0, locale)}
              />
              <MetricCard
                label={copy.metrics.maxDrawdown}
                value={formatPercent(bootstrapQuery.data?.promotionGate.maxDrawdownPct ?? 0, locale)}
              />
              <MetricCard
                label={copy.metrics.unresolved}
                value={String(bootstrapQuery.data?.promotionGate.unresolvedOrdersCount ?? 0)}
              />
            </div>
            {(bootstrapQuery.data?.promotionGate.blockers ?? []).length ? (
              <div className="space-y-2 rounded-[22px] border border-warning/25 bg-warning/8 p-4">
                {(bootstrapQuery.data?.promotionGate.blockers ?? []).map((blocker) => (
                  <div key={blocker} className="flex gap-2 text-sm text-text-secondary">
                    <AlertTriangle className="mt-0.5 size-4 text-warning" />
                    <span>{blocker}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.latestCycle}</p>
            {latestCycle ? (
              <>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-text-primary">{latestCycle.summary}</p>
                  <p className="text-sm text-text-secondary">
                    {formatDateTime(latestCycle.createdAt, locale)}
                  </p>
                </div>
                <div className="space-y-3">
                  {latestCycle.aiDecisions.slice(0, 3).map((decision) => (
                    <div
                      key={decision.decisionId}
                      className="rounded-[20px] bg-app-bg-elevated p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-text-primary">{decision.ticker}</p>
                        <Badge tone="info">
                          {Math.round(decision.confidence * 100)}%
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {decision.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-text-secondary">{copy.empty.candidates}</p>
            )}
          </Card>
        </div>
      </section>
    </StocksWorkbenchShell>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-app-bg-elevated p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-text-primary">{value}</p>
    </div>
  )
}

