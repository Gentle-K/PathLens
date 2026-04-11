import { useQuery } from '@tanstack/react-query'
import { Blocks, Cable, ExternalLink, Radio, ScrollText, ShieldCheck, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ChartCard } from '@/components/charts/chart-card'
import { PageHeader } from '@/components/layout/page-header'
import { ReportMarkdown } from '@/components/markdown/report-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ReportTableCard } from '@/features/analysis/components/report-table-card'
import { EvidencePanelEnhanced, KycSnapshotSection, OracleSnapshotSection, TxReceiptSection } from '@/features/analysis/components/result-sections'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { exportToCsv } from '@/lib/export/csv'
import { exportToPdf } from '@/lib/export/pdf'
import { useAppStore } from '@/lib/store/app-store'
import { formatDateTime, formatMoney } from '@/lib/utils/format'
import { errorMessage } from '@/lib/web3/transaction-errors'
import { useHashKeyWallet, useLiveMarketSnapshots } from '@/lib/web3/use-hashkey-wallet'
import type { AnalysisReport, AssetAnalysisCard, LanguageCode, TxReceipt } from '@/types'

function money(value: number | undefined, currency = 'USD', locale: LanguageCode = 'zh') {
  return formatMoney(value, currency, locale, { maximumFractionDigits: 2 })
}

function pct(value: number | undefined, locale: LanguageCode = 'zh') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--'
  }
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    maximumFractionDigits: 2,
  }).format(value)
}

function assetTypeLabel(value: AssetAnalysisCard['assetType'], isZh: boolean) {
  const labels: Record<AssetAnalysisCard['assetType'], string> = {
    stablecoin: isZh ? '稳定币' : 'Stablecoin',
    mmf: 'MMF',
    precious_metal: isZh ? '贵金属' : 'Precious metal',
    real_estate: isZh ? '房地产' : 'Real estate',
    stocks: isZh ? '股票' : 'Stocks',
    benchmark: isZh ? '基准资产' : 'Benchmark',
  }
  return labels[value]
}

function txReceiptFromReport(report: AnalysisReport): TxReceipt | undefined {
  if (!report.attestationDraft?.transactionHash || !report.attestationDraft.transactionUrl) {
    return undefined
  }
  return {
    transactionHash: report.attestationDraft.transactionHash,
    transactionUrl: report.attestationDraft.transactionUrl,
    blockNumber: report.attestationDraft.blockNumber,
    submittedBy: report.attestationDraft.submittedBy,
    submittedAt: report.attestationDraft.submittedAt,
    network: report.attestationDraft.network ?? 'testnet',
  }
}

export function ReportPage() {
  const navigate = useNavigate()
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const sessionQuery = useQuery({ queryKey: ['analysis', sessionId], queryFn: () => adapter.analysis.getById(sessionId) })
  const reportQuery = useQuery({ queryKey: ['analysis', sessionId, 'report'], queryFn: () => adapter.analysis.getReport(sessionId) })

  const session = sessionQuery.data
  const report = reportQuery.data
  const wallet = useHashKeyWallet(report?.chainConfig)
  const marketQuery = useLiveMarketSnapshots(report?.chainConfig, report?.attestationDraft?.network === 'mainnet' ? 'mainnet' : 'testnet')

  useEffect(() => {
    if (session && session.status !== 'COMPLETED' && session.status !== 'FAILED') {
      void navigate(`/analysis/session/${sessionId}`, { replace: true })
    }
  }, [navigate, session, sessionId])

  const latestSnapshots = useMemo(() => (marketQuery.data?.length ? marketQuery.data : report?.marketSnapshots ?? []), [marketQuery.data, report?.marketSnapshots])
  const txReceipt = useMemo(() => (report ? txReceiptFromReport(report) : undefined), [report])
  const hiddenCalculations = useMemo(() => (session?.calculations ?? []).filter((task) => task.userVisible === false || task.status === 'failed' || task.status === 'rejected'), [session?.calculations])

  const handleExport = async (kind: 'csv' | 'pdf') => {
    if (!session || !report) return
    setExporting(kind)
    try {
      const payload = {
        title: `hashkey-rwa-report-${session.id}-${locale}`,
        headers: ['Section', 'Item', 'Value', 'Details'],
        rows: [
          ['overview', 'session_id', session.id, session.status],
          ['overview', 'problem', report.summaryTitle, report.mode],
          ['wallet', 'address', session.intakeContext.walletAddress || '--', session.intakeContext.walletNetwork || '--'],
          ...report.recommendedAllocations.map((allocation) => ['allocation', allocation.assetName, allocation.targetWeightPct.toFixed(2), allocation.blockedReason || allocation.rationale] as Array<string | number>),
          ...(report.methodologyReferences ?? []).map((item) => ['methodology', item.title, item.url, item.summary] as Array<string | number>),
        ],
      }
      if (kind === 'csv') await exportToCsv(payload)
      else await exportToPdf(payload)
    } finally {
      setExporting(null)
    }
  }

  if (sessionQuery.error || reportQuery.error) {
    return (
      <Card className="space-y-3 p-6 text-sm text-text-secondary">
        <p className="text-base font-semibold text-text-primary">{isZh ? '结果页暂时无法读取' : 'The result page is temporarily unavailable'}</p>
        <p>{isZh ? '报告可能包含旧格式数据，或后端返回了错误；现在会展示可恢复状态，而不是整页崩溃。' : 'The report may contain older payloads or the backend returned an error, so a recoverable state is shown instead of crashing.'}</p>
        <p className="text-xs text-text-muted">{errorMessage(sessionQuery.error ?? reportQuery.error)}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void sessionQuery.refetch()}>{isZh ? '重试会话' : 'Retry session'}</Button>
          <Button variant="secondary" onClick={() => void reportQuery.refetch()}>{isZh ? '重试报告' : 'Retry report'}</Button>
          <Button onClick={() => void navigate('/resources/analyses')}>{isZh ? '返回历史记录' : 'Back to history'}</Button>
        </div>
      </Card>
    )
  }

  if (!session || !report) {
    return <Card className="p-6 text-sm text-text-secondary">{isZh ? '正在准备结果页...' : 'Preparing the result page...'}</Card>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? '页面 3 / RWA 报告' : 'Page 3 / RWA Report'}
        title={report.summaryTitle}
        description={isZh ? '汇总分析、证据、链上上下文与执行路径，并把无效计算隔离展示。' : 'Analysis, evidence, on-chain context, execution path, and isolated invalid calculations.'}
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/analysis/session/${sessionId}`)}>{isZh ? '返回分析页' : 'Back to Analysis'}</Button>
            <Button variant="secondary" onClick={() => void handleExport('csv')} disabled={exporting !== null}>{isZh ? '导出 CSV' : 'Export CSV'}</Button>
            <Button variant="secondary" onClick={() => void handleExport('pdf')} disabled={exporting !== null}>{isZh ? '导出 PDF' : 'Export PDF'}</Button>
            {report.attestationDraft ? <Button onClick={() => void navigate(`/analysis/session/${sessionId}/execute`)}>{isZh ? '打开执行控制台' : 'Open Execution Console'}</Button> : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.highlights.map((highlight) => (
          <Card key={highlight.id} className="p-5">
            <p className="text-sm text-text-secondary">{highlight.label}</p>
            <p className="mt-3 text-3xl font-semibold text-text-primary">{highlight.value}</p>
            <p className="mt-3 text-sm leading-7 text-text-secondary">{highlight.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-4">
          {report.chainConfig ? <Card className="space-y-4 p-5"><div className="flex items-center gap-3"><Blocks className="size-5 text-gold-primary" /><h2 className="text-lg font-semibold text-text-primary">{isZh ? 'HashKey 链配置' : 'HashKey Chain Config'}</h2></div><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">Mainnet</p><p className="mt-2 text-text-primary">{report.chainConfig.mainnetChainId}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">Testnet</p><p className="mt-2 text-text-primary">{report.chainConfig.testnetChainId}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">Plan Registry</p><p className="mt-2 break-all text-sm text-text-primary">{report.attestationDraft?.contractAddress || report.chainConfig.planRegistryAddress || '--'}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">Created</p><p className="mt-2 text-sm text-text-primary">{report.attestationDraft ? formatDateTime(report.attestationDraft.createdAt, locale) : '--'}</p></div></div></Card> : null}

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-3"><WalletCards className="size-5 text-gold-primary" /><h2 className="text-lg font-semibold text-text-primary">{isZh ? '钱包与执行入口' : 'Wallet and Execution'}</h2></div>
            <div className="flex flex-wrap gap-2">
              {wallet.isConnected ? <Button variant="secondary" onClick={() => wallet.disconnectWallet()} disabled={wallet.isWalletBusy}>{isZh ? '断开连接' : 'Disconnect'}</Button> : <Button onClick={() => void wallet.connectWallet()} disabled={!wallet.hasProvider || wallet.isWalletBusy}><Cable className="size-4" />{isZh ? '连接钱包' : 'Connect Wallet'}</Button>}
              <Button variant="secondary" onClick={() => void wallet.switchNetwork('testnet')} disabled={!wallet.hasProvider || wallet.isWalletBusy}>{isZh ? '切到 Testnet' : 'Switch Testnet'}</Button>
              <Button variant="secondary" onClick={() => void wallet.switchNetwork('mainnet')} disabled={!wallet.hasProvider || wallet.isWalletBusy}>{isZh ? '切到 Mainnet' : 'Switch Mainnet'}</Button>
              {report.attestationDraft ? <Button onClick={() => void navigate(`/analysis/session/${sessionId}/execute`)}><Radio className="size-4" />{isZh ? '执行存证' : 'Execute Attestation'}</Button> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '钱包' : 'Wallet'}</p><p className="mt-2 break-all text-sm text-text-primary">{wallet.walletAddress || (isZh ? '未连接' : 'Not connected')}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '网络' : 'Network'}</p><p className="mt-2 text-sm text-text-primary">{wallet.networkLabel}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '实时 KYC' : 'Live KYC'}</p><p className="mt-2 text-sm text-text-primary">{wallet.kycSnapshot ? `${wallet.kycSnapshot.status} / L${wallet.kycSnapshot.level}` : (isZh ? '未连接' : 'Unavailable')}</p><p className="mt-2 text-xs text-text-muted">{wallet.kycSnapshot?.note || (wallet.kycError ? errorMessage(wallet.kycError) : '')}</p></div></div>
          </Card>

          {report.kycSnapshot ? <KycSnapshotSection kyc={report.kycSnapshot} locale={locale} /> : null}
          {txReceipt ? <TxReceiptSection receipt={txReceipt} locale={locale} /> : null}
        </div>

        <div className="space-y-4">
          <OracleSnapshotSection snapshots={latestSnapshots} locale={locale} />
          {marketQuery.error ? <Card className="p-4 text-sm text-[#f3ddbb]">{isZh ? '实时刷新失败，当前展示报告快照。' : 'Live refresh failed, showing the report snapshot.'}<span className="ml-2 text-text-muted">{errorMessage(marketQuery.error)}</span></Card> : null}
        </div>
      </div>

      {report.assetCards.length ? <div className="space-y-4"><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-gold-primary" /><h2 className="text-xl font-semibold text-text-primary">{isZh ? '资产卡片' : 'Asset Cards'}</h2></div><div className="grid gap-4 xl:grid-cols-3">{report.assetCards.map((asset) => { const topRisk = [...asset.riskBreakdown].sort((left, right) => right.normalizedScore * right.weight - left.normalizedScore * left.weight)[0]; return <Card key={asset.assetId} className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-text-primary">{asset.name}</h3><Badge tone="neutral">{asset.symbol}</Badge></div><p className="mt-2 text-sm leading-7 text-text-secondary">{asset.fitSummary}</p></div><Badge tone="gold">{assetTypeLabel(asset.assetType, isZh)}</Badge></div><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '基准年化' : 'Base annualized'}</p><p className="mt-2 text-text-primary">{pct(asset.expectedReturnBase * 100, locale)}%</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '综合风险' : 'Overall risk'}</p><p className="mt-2 text-text-primary">{asset.riskVector.overall.toFixed(1)} / 100</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '最早退出' : 'Earliest exit'}</p><p className="mt-2 text-text-primary">{asset.exitDays === 0 ? 'T+0' : `T+${asset.exitDays}`}</p></div><div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><p className="text-xs text-text-muted">{isZh ? '数据质量' : 'Data quality'}</p><p className="mt-2 text-text-primary">{asset.riskDataQuality.toFixed(2)}</p></div></div>{topRisk ? <div className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary"><div className="flex items-center justify-between gap-3 text-text-primary"><span>{topRisk.dimension}</span><span>{topRisk.normalizedScore.toFixed(1)} / 100</span></div><p className="mt-2 text-xs text-text-muted">{isZh ? '权重' : 'Weight'} {(topRisk.weight * 100).toFixed(1)}%{topRisk.note ? ` · ${topRisk.note}` : ''}</p></div> : null}</Card> })}</div></div> : null}

      {report.tables?.map((table) => <ReportTableCard key={table.id} table={table} />)}
      {report.charts.map((chart) => <ChartCard key={chart.id} chart={chart} />)}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card className="space-y-4 p-6"><div className="flex items-center gap-3"><ScrollText className="size-5 text-gold-primary" /><h2 className="text-xl font-semibold text-text-primary">{isZh ? '完整分析' : 'Full Analysis'}</h2></div><ReportMarkdown markdown={report.markdown} /></Card>
          <Card className="space-y-3 p-6"><h2 className="text-lg font-semibold text-text-primary">{isZh ? '假设与限制' : 'Assumptions and Constraints'}</h2>{report.assumptions.concat(report.disclaimers).map((item) => <div key={item} className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">{item}</div>)}</Card>
          {(report.methodologyReferences ?? []).length ? <Card className="space-y-4 p-6"><h2 className="text-lg font-semibold text-text-primary">{isZh ? '风险方法学' : 'Risk Methodology'}</h2>{(report.methodologyReferences ?? []).map((item) => <div key={item.key} className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-text-primary">{item.title}</p><p className="mt-2 text-sm leading-7 text-text-secondary">{item.summary}</p></div><a href={item.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-gold-ink underline-offset-4 hover:underline"><ExternalLink className="size-3.5" />{isZh ? '文献' : 'Source'}</a></div></div>)}</Card> : null}
        </div>

        <div className="space-y-4">
          {report.recommendedAllocations.length ? <Card className="space-y-4 p-6"><div className="flex items-center gap-3"><WalletCards className="size-5 text-gold-primary" /><h2 className="text-lg font-semibold text-text-primary">{isZh ? '建议权重' : 'Suggested Weights'}</h2></div>{report.recommendedAllocations.map((allocation) => <div key={allocation.assetId} className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-text-primary">{allocation.assetName}</p><Badge tone={allocation.blockedReason ? 'warning' : 'gold'}>{allocation.targetWeightPct.toFixed(1)}%</Badge></div><p className="mt-2 text-sm leading-7 text-text-secondary">{allocation.rationale}</p><p className="mt-2 text-xs text-text-muted">{isZh ? '建议金额' : 'Suggested amount'}: {money(allocation.suggestedAmount, session.intakeContext.baseCurrency, locale)}</p>{allocation.blockedReason ? <p className="mt-2 text-xs text-[#f3ddbb]">{allocation.blockedReason}</p> : null}</div>)}</Card> : null}
          <Card className="space-y-4 p-6"><h2 className="text-lg font-semibold text-text-primary">{isZh ? '证据面板' : 'Evidence Panel'}</h2><EvidencePanelEnhanced evidence={report.evidence} locale={locale} /></Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-4 p-6"><h2 className="text-lg font-semibold text-text-primary">{isZh ? '有效计算' : 'Validated Calculations'}</h2>{report.calculations.length ? report.calculations.map((calculation) => <div key={calculation.id} className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-text-primary">{calculation.taskType}</p><Badge tone="neutral">{calculation.validationState || 'validated'}</Badge></div><p className="mt-2 text-sm text-gold-ink">{calculation.result} {calculation.units}</p><p className="mt-2 break-all text-sm leading-7 text-text-secondary">{calculation.formulaExpression}</p></div>) : <p className="text-sm text-text-secondary">{isZh ? '当前报告没有可展示的有效计算。' : 'No validated calculations are visible for this report.'}</p>}</Card>
            <Card className="space-y-4 p-6"><h2 className="text-lg font-semibold text-text-primary">{isZh ? '失败 / 拒绝计算' : 'Failed / Rejected Calculations'}</h2>{hiddenCalculations.length ? <details className="rounded-xl border border-border-subtle bg-app-bg-elevated p-4"><summary className="cursor-pointer text-sm text-text-primary">{isZh ? `展开查看 ${hiddenCalculations.length} 条被隔离的旧任务` : `Show ${hiddenCalculations.length} isolated legacy tasks`}</summary><div className="mt-4 space-y-3">{hiddenCalculations.map((calculation) => <div key={calculation.id} className="rounded-xl border border-border-subtle bg-app-bg p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium text-text-primary">{calculation.taskType}</p><Badge tone="warning">{calculation.status || calculation.validationState || 'failed'}</Badge></div><p className="mt-2 break-all text-sm text-text-secondary">{calculation.formulaExpression}</p><p className="mt-2 text-xs leading-6 text-[#f3ddbb]">{calculation.failureReason || calculation.notes || (isZh ? '该任务未通过校验。' : 'This task did not pass validation.')}</p></div>)}</div></details> : <p className="text-sm text-text-secondary">{isZh ? '当前没有需要隔离展示的失败计算。' : 'There are no isolated failed calculations in this session.'}</p>}</Card>
          </div>
        </div>
      </div>
    </div>
  )
}
