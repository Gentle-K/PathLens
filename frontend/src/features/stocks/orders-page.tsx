import { useQuery } from '@tanstack/react-query'

import { ErrorState } from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { formatDateTime, formatMoney } from '@/lib/utils/format'
import { StocksWorkbenchShell } from '@/features/stocks/workbench-shell'
import { useStocksCopy } from '@/features/stocks/copy'
import { getStocksErrorMessage, strategyLabel, useStocksMode } from '@/features/stocks/lib'

export function StocksOrdersPage() {
  const adapter = useApiAdapter()
  const copy = useStocksCopy()
  const locale = useAppStore((state) => state.locale)
  const bootstrapQuery = useQuery({
    queryKey: ['stocks', 'bootstrap'],
    queryFn: adapter.stocks.getBootstrap,
  })
  const { mode, setMode } = useStocksMode(bootstrapQuery.data?.settings.defaultMode ?? 'paper')
  const ordersQuery = useQuery({
    queryKey: ['stocks', 'orders', mode],
    queryFn: () => adapter.stocks.getOrders(mode),
    refetchInterval: 15_000,
  })
  const cyclesQuery = useQuery({
    queryKey: ['stocks', 'decision-cycles', mode],
    queryFn: () => adapter.stocks.getDecisionCycles(mode),
    refetchInterval: 15_000,
  })

  if (bootstrapQuery.isError || ordersQuery.isError || cyclesQuery.isError) {
    return (
      <ErrorState
        title={copy.pages.orders.title}
        description={getStocksErrorMessage(
          bootstrapQuery.error ?? ordersQuery.error ?? cyclesQuery.error,
          copy.actions.retry,
        )}
        action={<Button variant="secondary">{copy.actions.retry}</Button>}
      />
    )
  }

  return (
    <StocksWorkbenchShell
      title={copy.pages.orders.title}
      description={copy.pages.orders.description}
      mode={mode}
      onModeChange={setMode}
      account={ordersQuery.data?.account}
      bootstrap={bootstrapQuery.data}
    >
      <section className="space-y-5">
        <Card className="space-y-4 p-6">
          <p className="text-lg font-semibold text-text-primary">{copy.sections.positions}</p>
          {(ordersQuery.data?.positions ?? []).length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-text-muted">
                  <tr>
                    <th className="px-4 py-2">Ticker</th>
                    <th className="px-4 py-2">Strategy</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Entry</th>
                    <th className="px-4 py-2">Market</th>
                    <th className="px-4 py-2">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQuery.data?.positions.map((position) => (
                    <tr key={position.ticker} className="bg-app-bg-elevated text-text-primary">
                      <td className="rounded-l-[18px] px-4 py-3 font-medium">
                        {position.ticker}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {strategyLabel(position.entryStrategy)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{position.quantity}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatMoney(position.averageEntryPrice, 'USD', locale)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatMoney(position.marketPrice, 'USD', locale)}
                      </td>
                      <td className="rounded-r-[18px] px-4 py-3 text-text-secondary">
                        {formatMoney(position.unrealizedPnl, 'USD', locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">{copy.empty.positions}</p>
          )}
        </Card>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.orderLog}</p>
            {(ordersQuery.data?.orders ?? []).length ? (
              <div className="space-y-3">
                {ordersQuery.data?.orders.map((order) => (
                  <div key={order.orderId} className="rounded-[20px] bg-app-bg-elevated p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {order.ticker}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {order.side.toUpperCase()} · {order.quantity} shares
                        </p>
                      </div>
                      <Badge tone={order.status === 'filled' ? 'success' : 'warning'}>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-text-secondary">
                      {formatMoney(order.averageFillPrice || order.limitPrice, 'USD', locale)}
                      {' · '}
                      {formatDateTime(order.updatedAt, locale)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{copy.empty.orders}</p>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <p className="text-lg font-semibold text-text-primary">{copy.sections.cycleReplay}</p>
            {(cyclesQuery.data ?? []).length ? (
              <div className="space-y-3">
                {(cyclesQuery.data ?? []).slice(0, 6).map((cycle) => (
                  <div key={cycle.cycleId} className="rounded-[20px] bg-app-bg-elevated p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary">
                        {cycle.status}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {formatDateTime(cycle.createdAt, locale)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {cycle.summary}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{copy.empty.candidates}</p>
            )}
          </Card>
        </section>
      </section>
    </StocksWorkbenchShell>
  )
}

