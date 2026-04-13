import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { PageHeader } from '@/components/layout/page-header'
import {
  CalculationCard,
  CalculationEmptyHint,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MetricCard,
  SearchInput,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { fetchAnalysisCatalog, flattenCalculations } from '@/features/analysis/lib/catalog'
import { calculationTitle } from '@/features/analysis/lib/view-models'
import { useState } from 'react'

function matchCalculationValue(
  calculations: Array<{ task: import('@/types').CalculationTask }>,
  patterns: string[],
) {
  return (
    calculations.find(({ task }) =>
      patterns.some((pattern) => task.taskType.toLowerCase().includes(pattern)),
    )?.task.result ?? 'Unavailable'
  )
}

export function CalculationsPage() {
  const adapter = useApiAdapter()
  const [search, setSearch] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')

  const catalogQuery = useQuery({
    queryKey: ['analysis', 'catalog', 'calculations'],
    queryFn: () => fetchAnalysisCatalog(adapter),
  })

  const calculations = useMemo(() => {
    return flattenCalculations(catalogQuery.data ?? { sessions: [], reportsBySession: {} }).filter(
      ({ session, task }) => {
        const matchesSearch =
          !search ||
          `${calculationTitle(task)} ${task.formulaExpression}`
            .toLowerCase()
            .includes(search.toLowerCase())
        const matchesSession = sessionFilter === 'all' || session.id === sessionFilter
        return matchesSearch && matchesSession
      },
    )
  }, [catalogQuery.data, search, sessionFilter])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calculations"
        title="Calculations"
        description="Inspect deterministic RWA and execution calculations, including yield, fees, slippage, gas, break-even, and where each result is used in the report or execution plan."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Expected yield"
          value={matchCalculationValue(calculations, ['yield', 'apy', 'apr'])}
          detail="Derived yield assumptions stay separate from narrative recommendation text."
          tone="brand"
        />
        <MetricCard
          title="Fee breakdown"
          value={matchCalculationValue(calculations, ['fee', 'cost'])}
          detail="Shows the deterministic fee leg used for quote, execution, or redemption math."
          tone="success"
        />
        <MetricCard
          title="Slippage / gas"
          value={matchCalculationValue(calculations, ['slippage', 'gas'])}
          detail="Execution friction stays inspectable instead of being folded into the recommendation."
          tone="warning"
        />
        <MetricCard
          title="Redemption break-even"
          value={matchCalculationValue(calculations, ['break-even', 'breakeven', 'redemption'])}
          detail="Highlights the crossover or redemption threshold when exit timing matters."
          tone="success"
        />
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search calculations"
        />
        <Select
          value={sessionFilter}
          onChange={(event) => setSessionFilter(event.target.value)}
        >
          <option value="all">All sessions</option>
          {(catalogQuery.data?.sessions ?? []).map((session) => (
            <option key={session.id} value={session.id}>
              {session.problemStatement}
            </option>
          ))}
        </Select>
      </FilterBar>

      <CalculationEmptyHint />

      {catalogQuery.isLoading ? (
        <LoadingState
          title="Loading calculations"
          description="Preparing formulas, input parameters, and result values."
        />
      ) : catalogQuery.isError ? (
        <ErrorState
          title="Could not load calculations"
          description={(catalogQuery.error as Error).message}
          action={
            <Button variant="secondary" onClick={() => void catalogQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : calculations.length ? (
        <div className="space-y-4">
          {calculations.map(({ session, task }) => (
            <div key={task.id} className="space-y-3">
              <CalculationCard task={task} sessionTitle={session.problemStatement} />
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Report linkage
                    </p>
                    <p className="mt-2">
                      {task.reportSectionKeys?.length
                        ? task.reportSectionKeys.join(' · ')
                        : 'Not linked to a report section yet.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Execution linkage
                    </p>
                    <p className="mt-2">
                      {task.executionStepIds?.length
                        ? task.executionStepIds.join(' · ')
                        : 'Not linked to an execution step yet.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/reports/${session.id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 text-sm text-text-primary transition hover:border-border-strong hover:bg-panel-strong"
                  >
                    Open report
                  </a>
                  <a
                    href={`/sessions/${session.id}/execute`}
                    className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 text-sm text-text-primary transition hover:border-border-strong hover:bg-panel-strong"
                  >
                    Open execute page
                  </a>
                </div>
              </div>
            </div>
          ))}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel-card rounded-[24px] p-5">
              <p className="text-sm font-semibold text-text-primary">Supported calculation surfaces</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Breakeven, budget range, opportunity cost, sensitivity, fee drag, and liquidity-window calculations should read as first-class analytical outputs.
              </p>
            </div>
            <div className="panel-card rounded-[24px] p-5">
              <p className="text-sm font-semibold text-text-primary">Trust rule</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                If the structured input is too weak, the page keeps the empty or warning state visible instead of overstating result readiness.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No calculations available"
          description="There is not enough structured data yet to show deterministic results for the current filters."
        />
      )}
    </div>
  )
}
