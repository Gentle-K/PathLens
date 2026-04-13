import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCheck,
  ExternalLink,
  Loader2,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { DetailDrawer } from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { shortAddress } from '@/lib/web3/hashkey'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type { PortfolioAlert } from '@/types'

function formatUsd(value?: number) {
  if (value == null || Number.isNaN(value)) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
}

function formatPercent(value?: number) {
  if (value == null || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function formatDateTime(value?: string) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function severityTone(value?: string) {
  if (value === 'critical') return 'danger' as const
  if (value === 'warning') return 'warning' as const
  return 'info' as const
}

function severityRank(value?: string) {
  if (value === 'critical') return 0
  if (value === 'warning') return 1
  return 2
}

export function PortfolioPage() {
  const { address = '' } = useParams()
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'

  const bootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap', 'portfolio-page'],
    queryFn: () => adapter.rwa.getBootstrap(),
  })

  const wallet = useHashKeyWallet(bootstrapQuery.data?.chainConfig)
  const network =
    wallet.walletNetwork ??
    (bootstrapQuery.data?.chainConfig.defaultExecutionNetwork === 'mainnet' ? 'mainnet' : 'testnet')
  const resolvedAddress = address || wallet.walletAddress || ''

  const portfolioQuery = useQuery({
    queryKey: ['rwa', 'portfolio', resolvedAddress, network],
    queryFn: () => adapter.rwa.getPortfolio(resolvedAddress, network),
    enabled: Boolean(resolvedAddress),
    refetchInterval: 30_000,
  })

  const alertsQuery = useQuery({
    queryKey: ['rwa', 'portfolio-alerts', resolvedAddress, network],
    queryFn: () => adapter.rwa.getPortfolioAlerts(resolvedAddress, network),
    enabled: Boolean(resolvedAddress),
    refetchInterval: 30_000,
  })

  const [selectedAlert, setSelectedAlert] = useState<PortfolioAlert | null>(null)

  const syncQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rwa', 'portfolio', resolvedAddress, network] }),
      queryClient.invalidateQueries({ queryKey: ['rwa', 'portfolio-alerts', resolvedAddress, network] }),
    ])
  }

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => adapter.rwa.ackPortfolioAlert(resolvedAddress, alertId),
    onSuccess: async () => {
      await syncQueries()
    },
  })

  const readMutation = useMutation({
    mutationFn: (alertId: string) => adapter.rwa.readPortfolioAlert(resolvedAddress, alertId),
    onSuccess: async () => {
      await syncQueries()
    },
  })

  const portfolio = portfolioQuery.data
  const alerts = [...(alertsQuery.data ?? portfolio?.alerts ?? [])].sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity)
    if (severityDelta !== 0) return severityDelta
    return new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime()
  })
  const proofByAsset = new Map((portfolio?.proofSnapshots ?? []).map((proof) => [proof.assetId, proof]))

  if (bootstrapQuery.isLoading || portfolioQuery.isLoading || alertsQuery.isLoading) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {isZh ? '正在加载 portfolio monitor...' : 'Loading portfolio monitor...'}
        </div>
      </Card>
    )
  }

  if (!resolvedAddress) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          {isZh
            ? '先连接钱包，再读取持仓、proof freshness 和告警时间线。'
            : 'Connect a wallet first to load holdings, proof freshness, and the alert timeline.'}
        </p>
        <Button onClick={() => void wallet.connectWallet()} disabled={!wallet.hasProvider || wallet.isWalletBusy}>
          <Wallet className="size-4" />
          {isZh ? '连接钱包' : 'Connect wallet'}
        </Button>
      </Card>
    )
  }

  if (!portfolio) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          {isZh ? '暂时无法加载这个地址的组合视图。' : 'This address is not available right now.'}
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? '事件驱动监控' : 'Event-driven monitoring'}
        title={isZh ? 'HashKey RWA Portfolio' : 'HashKey RWA Portfolio'}
        description={
          isZh
            ? '组合价值、收益、赎回预测、allocation mix 和告警时间线在一个操作面板里。'
            : 'Portfolio value, yield, redemption forecast, allocation mix, and the alert timeline stay in one operating surface.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate('/assets')}>
              {isZh ? '资产中心' : 'Asset hub'}
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/new-analysis')}>
              <BarChart3 className="size-4" />
              {isZh ? '新建分析' : 'New analysis'}
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[32px] border border-border-subtle bg-[linear-gradient(135deg,rgba(11,21,40,0.97),rgba(17,38,69,0.92)_52%,rgba(8,19,33,0.98))]">
        <div className="grid gap-7 px-6 py-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:px-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{network}</Badge>
              <Badge tone={alerts.some((item) => item.severity === 'critical') ? 'danger' : alerts.length ? 'warning' : 'success'}>
                {alerts.length} alerts
              </Badge>
            </div>
            <div className="space-y-3">
              <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-text-primary md:text-4xl">
                {shortAddress(resolvedAddress)}
              </h2>
              <p className="max-w-3xl break-all text-sm leading-7 text-text-secondary md:text-[15px]">
                {resolvedAddress}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Current value' : 'Current value'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatUsd(portfolio.totalValueUsd)}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Cost basis' : 'Cost basis'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatUsd(portfolio.totalCostBasis)}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Unrealized PnL' : 'Unrealized PnL'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatUsd(portfolio.totalUnrealizedPnl)}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Realized income' : 'Realized income'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatUsd(portfolio.totalRealizedIncome)}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Accrued yield' : 'Accrued yield'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatUsd(portfolio.totalAccruedYield)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border-subtle bg-[rgba(9,18,34,0.72)] p-5">
            <div className="flex items-center gap-2">
              <BellRing className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Alert summary' : 'Alert summary'}
              </p>
            </div>
            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Critical / warning / info</p>
                <p className="mt-2 text-text-primary">
                  {alerts.filter((item) => item.severity === 'critical').length} / {alerts.filter((item) => item.severity === 'warning').length} / {alerts.filter((item) => item.severity === 'info').length}
                </p>
              </div>
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Redemption forecast</p>
                <p className="mt-2 text-text-primary">{formatUsd(portfolio.totalRedemptionForecast)}</p>
              </div>
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Last sync</p>
                <p className="mt-2 text-text-primary">{formatDateTime(portfolio.lastSyncAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-5">
          <Card className="space-y-4 p-5">
            <p className="text-lg font-semibold text-text-primary">
              {isZh ? 'Allocation mix' : 'Allocation mix'}
            </p>
            <div className="space-y-3">
              {Object.entries(portfolio.allocationMix).map(([assetId, weight]) => (
                <div key={assetId} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-text-primary">{assetId}</span>
                    <span className="text-text-secondary">{formatPercent(weight)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-app-bg-elevated">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.88),rgba(79,124,255,0.92))]"
                      style={{ width: `${Math.max(6, Math.round(weight * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <p className="text-lg font-semibold text-text-primary">
              {isZh ? 'Alert timeline' : 'Alert timeline'}
            </p>
            <div className="space-y-3">
              {alerts.length ? (
                alerts.map((alert) => (
                  <div key={alert.id} className="rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
                          {alert.acked ? <Badge tone="success">acked</Badge> : null}
                          {alert.read ? <Badge tone="info">read</Badge> : null}
                        </div>
                        <p className="font-semibold text-text-primary">{alert.title}</p>
                        <p className="text-sm leading-6 text-text-secondary">{alert.detail}</p>
                        <p className="text-xs text-text-muted">{formatDateTime(alert.detectedAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setSelectedAlert(alert)}>
                          {isZh ? '详情' : 'Detail'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={ackMutation.isPending || Boolean(alert.acked)}
                          onClick={() => void ackMutation.mutateAsync(alert.id)}
                        >
                          <CheckCheck className="size-4" />
                          {isZh ? 'Ack' : 'Ack'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={readMutation.isPending || Boolean(alert.read)}
                          onClick={() => void readMutation.mutateAsync(alert.id)}
                        >
                          {isZh ? '标记已读' : 'Mark read'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm text-text-secondary">
                  {isZh ? '当前没有活动告警。' : 'No active alert right now.'}
                </div>
              )}
            </div>
          </Card>
        </section>

        <section className="space-y-5">
          {(portfolio.positions ?? []).map((position) => {
            const proof = proofByAsset.get(position.assetId)
            return (
              <Card key={position.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-text-primary">{position.assetName}</p>
                      {proof ? <Badge tone={severityTone(proof.executionReadiness === 'view_only' ? 'warning' : 'info')}>{proof.executionAdapterKind}</Badge> : null}
                      {proof ? <Badge tone="info">{proof.proofFreshness.label}</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {proof?.monitoringNotes[0] || (isZh ? '组合监控正在跟踪 proof、赎回和执行回执。' : 'Monitoring is tracking proof freshness, redemption, and execution receipts.')}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => void navigate(`/assets/${position.assetId}/proof`)}>
                    <ArrowRight className="size-4" />
                    {isZh ? '查看 proof' : 'View proof'}
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-6">
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Value</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.currentValue)}</p>
                  </div>
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Cost basis</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.costBasis)}</p>
                  </div>
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Unrealized</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.unrealizedPnl)}</p>
                  </div>
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Income</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.realizedIncome)}</p>
                  </div>
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Yield</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.accruedYield)}</p>
                  </div>
                  <div className="rounded-[20px] bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Redemption</p>
                    <p className="mt-2 text-text-primary">{formatUsd(position.redemptionForecast)}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Allocation</p>
                    <p className="mt-2 text-text-primary">{formatPercent(position.allocationWeightPct)}</p>
                  </div>
                  <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Liquidity risk</p>
                    <p className="mt-2 text-text-primary">{position.liquidityRisk || 'N/A'}</p>
                  </div>
                  <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Next window</p>
                    <p className="mt-2 text-text-primary">
                      {proof?.redemptionWindow.label || position.nextRedemptionWindow || 'T+0'}
                    </p>
                  </div>
                </div>
              </Card>
            )
          })}
        </section>
      </div>

      {!portfolio.positions.length ? (
        <Card className="p-6 text-sm text-text-secondary">
          {isZh
            ? '当前地址还没有识别到可监控的 HashKey RWA 持仓。'
            : 'No recognized HashKey RWA position was found for this address.'}
        </Card>
      ) : null}

      <DetailDrawer
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title || 'Alert'}
        description={selectedAlert ? `${selectedAlert.alertType} · ${selectedAlert.severity}` : ''}
        actions={
          selectedAlert?.sourceUrl ? (
            <Button
              variant="secondary"
              onClick={() => window.open(selectedAlert.sourceUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="size-4" />
              {isZh ? '打开来源' : 'Open source'}
            </Button>
          ) : undefined
        }
      >
        {selectedAlert ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Asset / source</p>
                <p className="mt-2 text-text-primary">{selectedAlert.assetName || selectedAlert.assetId || 'Portfolio level'}</p>
                <p className="mt-2 text-sm text-text-secondary">{selectedAlert.sourceRef || selectedAlert.sourceUrl || 'No source ref'}</p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">State</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={severityTone(selectedAlert.severity)}>{selectedAlert.severity}</Badge>
                  {selectedAlert.acked ? <Badge tone="success">acked</Badge> : null}
                  {selectedAlert.read ? <Badge tone="info">read</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {formatDateTime(selectedAlert.detectedAt)}{selectedAlert.resolvedAt ? ` · resolved ${formatDateTime(selectedAlert.resolvedAt)}` : ''}
                </p>
              </div>
            </div>
            <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {selectedAlert.detail}
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  )
}
