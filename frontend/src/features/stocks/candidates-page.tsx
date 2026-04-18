import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

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
  getStocksErrorMessage,
  riskTone,
  strategyLabel,
  useStocksLabels,
  useStocksMode,
} from '@/features/stocks/lib'

export function StocksCandidatesPage() {
  const adapter = useApiAdapter()
  const copy = useStocksCopy()
  const locale = useAppStore((state) => state.locale)
  const bootstrapQuery = useQuery({
    queryKey: ['stocks', 'bootstrap'],
    queryFn: adapter.stocks.getBootstrap,
  })
  const { mode, setMode } = useStocksMode(bootstrapQuery.data?.settings.defaultMode ?? 'paper')
  const accountQuery = useQuery({
    queryKey: ['stocks', 'account', mode],
    queryFn: () => adapter.stocks.getAccount(mode),
  })
  const candidatesQuery = useQuery({
    queryKey: ['stocks', 'candidates', mode],
    queryFn: () => adapter.stocks.getCandidates(mode),
    refetchInterval: 15_000,
  })

  const riskMap = useMemo(
    () => new Map((candidatesQuery.data?.riskOutcomes ?? []).map((item) => [item.ticker, item])),
    [candidatesQuery.data?.riskOutcomes],
  )
  const aiMap = useMemo(
    () => new Map((candidatesQuery.data?.aiDecisions ?? []).map((item) => [item.ticker, item])),
    [candidatesQuery.data?.aiDecisions],
  )
  const approvedCount = (candidatesQuery.data?.riskOutcomes ?? []).filter(
    (result) => result.status === 'approved',
  ).length
  const watchOnlyCount = (candidatesQuery.data?.riskOutcomes ?? []).filter(
    (result) => result.status === 'watch_only',
  ).length
  const bestScore = Math.max(
    0,
    ...(candidatesQuery.data?.candidates ?? []).map((candidate) => candidate.score),
  )
  const { riskLabel } = useStocksLabels()

  if (bootstrapQuery.isError || accountQuery.isError || candidatesQuery.isError) {
    return (
      <ErrorState
        title={copy.pages.candidates.title}
        description={getStocksErrorMessage(
          bootstrapQuery.error ?? accountQuery.error ?? candidatesQuery.error,
          copy.actions.retry,
        )}
        action={<Button variant="secondary">{copy.actions.retry}</Button>}
      />
    )
  }

  return (
    <StocksWorkbenchShell
      title={copy.pages.candidates.title}
      description={copy.pages.candidates.description}
      mode={mode}
      onModeChange={setMode}
      account={accountQuery.data}
      bootstrap={bootstrapQuery.data}
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="space-y-5">
          <Card className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={copy.metrics.candidates}
              value={String(candidatesQuery.data?.candidates.length ?? 0)}
            />
            <MetricCard label={copy.metrics.approved} value={String(approvedCount)} />
            <MetricCard label={copy.metrics.watchOnly} value={String(watchOnlyCount)} />
            <MetricCard
              label={copy.metrics.bestScore}
              value={formatPercent(bestScore, locale)}
            />
          </Card>

          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.candidateStream}</p>
            {(candidatesQuery.data?.candidates ?? []).length ? (
              <div className="space-y-4">
                {(candidatesQuery.data?.candidates ?? []).map((candidate) => {
                  const risk = riskMap.get(candidate.ticker)
                  const decision = aiMap.get(candidate.ticker)

                  return (
                    <div
                      key={candidate.candidateId}
                      className="rounded-[24px] bg-app-bg-elevated p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-text-primary">
                            {candidate.ticker}
                          </p>
                          <p className="text-sm text-text-secondary">{candidate.companyName}</p>
                        </div>
                        {risk ? (
                          <Badge tone={riskTone(risk.status)}>{riskLabel(risk.status)}</Badge>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                          label="Last"
                          value={formatMoney(candidate.snapshot.lastPrice, 'USD', locale)}
                        />
                        <MetricCard
                          label="Day"
                          value={formatPercent(candidate.snapshot.dayChangePct, locale)}
                        />
                        <MetricCard
                          label="Volume"
                          value={formatPercent(candidate.features.volumeRatio, locale)}
                        />
                        <MetricCard
                          label="Score"
                          value={formatPercent(candidate.score, locale)}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {candidate.triggeredStrategies.map((strategy) => (
                          <Badge key={strategy} tone="info">
                            {strategyLabel(strategy)}
                          </Badge>
                        ))}
                      </div>

                      {decision ? (
                        <p className="mt-4 text-sm leading-6 text-text-secondary">
                          {decision.rationale}
                        </p>
                      ) : null}

                      {(risk?.reasons.length ?? 0) > 0 ? (
                        <div className="mt-4 space-y-2 rounded-[20px] border border-danger/18 bg-danger/6 p-4">
                          {risk?.reasons.map((reason) => (
                            <p key={reason} className="text-sm text-text-secondary">
                              {reason}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {(candidate.notes ?? []).length ? (
                        <div className="mt-4 space-y-2">
                          {candidate.notes.map((note) => (
                            <p key={note} className="text-sm text-text-secondary">
                              {note}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{copy.empty.candidates}</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.aiVerdict}</p>
            {candidatesQuery.data?.latestCycle ? (
              <>
                <p className="text-sm text-text-secondary">
                  {formatDateTime(candidatesQuery.data.latestCycle.createdAt, locale)}
                </p>
                <div className="space-y-3">
                  {candidatesQuery.data.latestCycle.aiDecisions.map((decision) => {
                    const risk = riskMap.get(decision.ticker)
                    return (
                      <div key={decision.decisionId} className="rounded-[20px] bg-app-bg-elevated p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-text-primary">
                            {decision.ticker}
                          </p>
                          <div className="flex items-center gap-2">
                            {risk ? (
                              <Badge tone={riskTone(risk.status)}>{riskLabel(risk.status)}</Badge>
                            ) : null}
                            <Badge tone="neutral">
                              {Math.round(decision.confidence * 100)}%
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">
                          {decision.rationale}
                        </p>
                        {risk?.warnings.length ? (
                          <p className="mt-2 text-sm text-warning">
                            {risk.warnings.join(' ')}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
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

