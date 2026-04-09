import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Blocks,
  Cable,
  CheckCircle2,
  Coins,
  FileCode2,
  Link2,
  Radar,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { ChartCard } from '@/components/charts/chart-card'
import { PageHeader } from '@/components/layout/page-header'
import { ReportMarkdown } from '@/components/markdown/report-markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ReportTableCard } from '@/features/analysis/components/report-table-card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import {
  useAttestationWriter,
  useHashKeyWallet,
  useLiveMarketSnapshots,
} from '@/lib/web3/use-hashkey-wallet'

function formatMoney(
  value?: number,
  currency = 'USDT',
  locale: 'zh' | 'en' = 'zh',
) {
  if (typeof value !== 'number') {
    return '—'
  }

  return `${value.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', {
    maximumFractionDigits: 2,
  })} ${currency}`
}

function formatPercent(value?: number) {
  if (typeof value !== 'number') {
    return '—'
  }

  return `${value.toFixed(2)}%`
}

function assetTypeLabel(
  value: string,
  isZh: boolean,
) {
  const mapping: Record<string, string> = {
    stablecoin: isZh ? '稳定币' : 'Stablecoin',
    mmf: 'MMF',
    precious_metal: isZh ? '贵金属' : 'Precious metal',
    real_estate: isZh ? '房地产' : 'Real estate',
    stocks: isZh ? '股票' : 'Stocks',
    benchmark: isZh ? '基准' : 'Benchmark',
  }

  return mapping[value] ?? value
}

export function ReportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const { i18n } = useTranslation()
  const locale = useAppStore((state) => state.locale)
  const isZh = i18n.language.startsWith('zh')

  const text = useMemo(
    () => ({
      loading: isZh ? '正在准备结果页...' : 'Preparing the result page...',
      eyebrow: isZh ? '第 3 页 / RWA Report' : 'Page 3 / RWA Report',
      description: isZh
        ? '结果页会同时展示资产卡片、持有期模拟、RiskVector、证据面板、交易草案和链上存证草案。'
        : 'The result page brings together asset cards, holding simulations, RiskVector, the evidence panel, the tx draft, and the onchain attestation draft.',
      backToAnalysis: isZh ? '返回分析界面' : 'Back to Analysis',
      failed: isZh ? '分析失败' : 'Analysis Failed',
      failedFallback: isZh
        ? '后端在生成结果时失败，请返回分析界面查看状态或重新发起。'
        : 'The backend failed while producing the result. Go back to the analysis workspace to inspect the state or restart the run.',
      chainConfig: isZh ? 'HashKey Chain 配置' : 'HashKey Chain Configuration',
      notConfigured: isZh ? '未配置' : 'Not configured',
      mainnet: 'Mainnet',
      testnet: 'Testnet',
      explorer: 'Explorer',
      kycSbt: 'KYC SBT',
      planRegistry: 'Plan Registry',
      judgeNarrative: isZh
        ? '这不是泛 DeFi 收益聚合器，而是面向 HashKey Chain 合规 RWA 的决策与执行中间层。重点不在“多资产”，而在“证据、KYC、托管、赎回、链上存证”是否连成闭环。'
        : 'This is not a generic DeFi yield aggregator. It is a decision-and-execution layer for compliant RWA flows on HashKey Chain, where evidence, KYC, custody, redemption, and onchain attestation form one loop.',
      walletExecution: isZh ? '钱包与执行台' : 'Wallet and Execution Console',
      walletExecutionDescription: isZh
        ? '在结果页直接连接钱包、切换网络、查看链上 KYC，并把 attestation 写到 Plan Registry。'
        : 'Connect a wallet, switch networks, inspect onchain KYC, and write the attestation to Plan Registry directly from this report.',
      connectWallet: isZh ? '连接钱包' : 'Connect wallet',
      clearWallet: isZh ? '清除本地连接' : 'Clear local connection',
      switchTestnet: isZh ? '切到 Testnet' : 'Switch to Testnet',
      switchMainnet: isZh ? '切到 Mainnet' : 'Switch to Mainnet',
      connectedAddress: isZh ? '当前地址' : 'Connected address',
      connectedNetwork: isZh ? '当前网络' : 'Connected network',
      onchainKyc: isZh ? '链上 KYC' : 'Onchain KYC',
      liveOracle: isZh ? '实时 Oracle 快照' : 'Live Oracle Snapshots',
      liveOracleDescription: isZh
        ? '以下价格直接从 HashKey 支持的 APRO oracle feed 读取，附带来源地址、时间戳和 Explorer。'
        : 'These prices are read directly from configured HashKey-supported APRO oracle feeds, with source addresses, timestamps, and explorer links.',
      fetchedAt: isZh ? '抓取时间' : 'Fetched at',
      updatedAt: isZh ? '喂价更新时间' : 'Oracle updated at',
      executeAttestation: isZh ? '写入链上 attestation' : 'Write onchain attestation',
      executingAttestation: isZh ? '正在写链...' : 'Writing onchain...',
      attestationSubmitted: isZh ? '已写入链上' : 'Recorded onchain',
      requiresWallet: isZh ? '需要先连接钱包' : 'Connect a wallet first',
      sourceUrl: isZh ? '来源 URL' : 'Source URL',
      sourceProof: isZh ? '证明层' : 'Proof layer',
      issuerDisclosed: isZh ? '发行方披露' : 'Issuer disclosed',
      onchainVerified: isZh ? '链上可验证' : 'Onchain verified',
      percentileRange: 'P10 / P50 / P90',
      varCvar: 'VaR / CVaR',
      endingValueP50: 'Ending Value P50',
      assetCards: isZh ? '资产卡片' : 'Asset Cards',
      baseAnnualized: isZh ? '基准年化' : 'Base annualized',
      overallRisk: isZh ? '综合风险' : 'Overall risk',
      earliestExit: isZh ? '最短退出' : 'Earliest exit',
      totalCost: isZh ? '总成本' : 'Total cost',
      investmentThesis: isZh ? '投资逻辑' : 'Investment thesis',
      kycRequirement: isZh ? 'KYC 门槛' : 'KYC requirement',
      simulations: isZh ? '持有期模拟' : 'Holding Simulations',
      tables: isZh ? '结构化矩阵' : 'Structured Matrices',
      charts: isZh ? '图表结果' : 'Chart Results',
      fullAnalysis: isZh ? '完整分析' : 'Full Analysis',
      assumptions: isZh ? '假设与限制' : 'Assumptions and Constraints',
      recommendedAllocations: isZh ? '建议权重' : 'Suggested Weights',
      suggestedAmount: isZh ? '建议金额' : 'Suggested amount',
      blockedReason: isZh ? '受限原因' : 'Blocked because',
      evidencePanel: isZh ? '证据面板' : 'Evidence Panel',
      evidenceFallback: isZh
        ? '当前结果主要基于资产模板、规则引擎和结构化输入生成。'
        : 'The current result is driven primarily by asset templates, the rules engine, and structured user input.',
      txDraft: isZh ? '交易草案' : 'Transaction Draft',
      totalEstimatedFee: isZh ? '总预估手续费' : 'Total estimated fee',
      estimatedFee: isZh ? '预估手续费' : 'Estimated fee',
      caution: isZh ? '注意' : 'Caution',
      viewExplorer: isZh ? '查看地址或 Explorer' : 'View address or explorer',
      attestationDraft: isZh ? '链上存证草案' : 'Onchain Attestation Draft',
      readyOnchain: isZh ? '可直接上链' : 'Ready for onchain use',
      offlineDraft: isZh ? '仅离线草案' : 'Offline draft only',
      missingContract: isZh ? '当前未配置链上合约地址' : 'No onchain contract address is configured yet',
      viewExplorerShort: isZh ? '查看 Explorer' : 'View Explorer',
      stepLabel: isZh ? '步骤' : 'Step',
      reportHash: isZh ? '报告哈希' : 'Report Hash',
      portfolioHash: isZh ? '组合哈希' : 'Portfolio Hash',
      attestationHash: isZh ? '存证哈希' : 'Attestation Hash',
      network: isZh ? '网络' : 'Network',
      transactionHash: isZh ? '交易哈希' : 'Tx',
      riskWarnings: isZh ? '风险提醒' : 'Risk Warnings',
      extraRiskNote: isZh
        ? '稳定币、MMF 与各类 RWA 的风险结构不同，不应只按收益率排序。先看退出约束和权利边界，再看收益数字。'
        : 'Stablecoins, MMFs, and other RWAs have different risk structures. Start with exits and rights boundaries before ranking headline yield.',
      calculationSummary: isZh ? '计算摘要' : 'Calculation Summary',
      baseMdd: isZh ? 'MDD 基准' : 'Base MDD',
    }),
    [isZh],
  )

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', sessionId, 'report'],
    queryFn: () => adapter.analysis.getReport(sessionId),
  })

  const session = sessionQuery.data
  const report = reportQuery.data
  const wallet = useHashKeyWallet(report?.chainConfig)
  const marketQuery = useLiveMarketSnapshots(
    report?.chainConfig,
    wallet.walletNetwork ??
      (report?.attestationDraft?.network === 'mainnet' ? 'mainnet' : 'testnet'),
  )
  const attestationWriter = useAttestationWriter(report?.chainConfig)
  const recordAttestationMutation = useMutation({
    mutationFn: (payload: {
      network: 'testnet' | 'mainnet'
      transactionHash: string
      submittedBy?: string
      blockNumber?: number
    }) => adapter.analysis.recordAttestation(sessionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
      await queryClient.invalidateQueries({
        queryKey: ['analysis', sessionId, 'report'],
      })
    },
  })

  const handleWriteAttestation = async () => {
    if (!report?.attestationDraft) {
      return
    }

    const targetNetwork =
      report.attestationDraft.network === 'mainnet' ? 'mainnet' : 'testnet'

    if (!wallet.isConnected) {
      await wallet.connectWallet()
    }

    if (wallet.walletNetwork !== targetNetwork) {
      await wallet.switchNetwork(targetNetwork)
    }

    const receipt = await attestationWriter.mutateAsync({
      network: targetNetwork,
      reportHash: report.attestationDraft.reportHash,
      portfolioHash: report.attestationDraft.portfolioHash,
      attestationHash: report.attestationDraft.attestationHash,
      sessionId,
      summaryUri:
        typeof window !== 'undefined' ? window.location.href : `session:${sessionId}`,
    })

    await recordAttestationMutation.mutateAsync({
      network: targetNetwork,
      transactionHash: receipt.transactionHash,
      submittedBy: receipt.account,
      blockNumber: receipt.blockNumber,
    })
  }

  useEffect(() => {
    if (!session) {
      return
    }

    if (session.status !== 'COMPLETED' && session.status !== 'FAILED') {
      void navigate(`/analysis/session/${sessionId}`, { replace: true })
    }
  }, [navigate, session, sessionId])

  if (!report || !session) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        {text.loading}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={text.eyebrow}
        title={report.summaryTitle}
        description={text.description}
        actions={
          <Button variant="secondary" onClick={() => void navigate(`/analysis/session/${sessionId}`)}>
            {text.backToAnalysis}
          </Button>
        }
      />

      {session.status === 'FAILED' ? (
        <Card className="space-y-4 border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-6">
          <h2 className="text-lg font-semibold text-[#f7d4cf]">{text.failed}</h2>
          <p className="text-sm leading-7 text-[#f1cbc6]">
            {session.errorMessage ?? text.failedFallback}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.highlights.map((highlight) => (
          <Card key={highlight.id} className="p-5">
            <p className="text-sm text-text-secondary">{highlight.label}</p>
            <p className="mt-3 text-3xl font-semibold text-text-primary">{highlight.value}</p>
            <p className="mt-3 text-sm leading-7 text-text-secondary">{highlight.detail}</p>
          </Card>
        ))}
      </div>

      <Card className="border-[rgba(249,228,159,0.2)] bg-[linear-gradient(135deg,rgba(212,175,55,0.12),rgba(15,14,10,0.78))] p-5">
        <p className="text-sm leading-7 text-text-primary">{text.judgeNarrative}</p>
      </Card>

      {report.chainConfig ? (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <Blocks className="size-5 text-gold-primary" />
            <h2 className="text-lg font-semibold text-text-primary">{text.chainConfig}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-xs text-text-muted">{text.mainnet}</p>
              <p className="mt-2 font-medium text-text-primary">{report.chainConfig.mainnetChainId}</p>
              <a
                href={report.chainConfig.mainnetExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
              >
                {text.explorer}
              </a>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-xs text-text-muted">{text.testnet}</p>
              <p className="mt-2 font-medium text-text-primary">{report.chainConfig.testnetChainId}</p>
              <a
                href={report.chainConfig.testnetExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
              >
                {text.explorer}
              </a>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-xs text-text-muted">{text.kycSbt}</p>
              <p className="mt-2 break-all text-sm text-text-primary">
                {report.chainConfig.kycSbtAddress || text.notConfigured}
              </p>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-xs text-text-muted">{text.planRegistry}</p>
              <p className="mt-2 break-all text-sm text-text-primary">
                {report.chainConfig.planRegistryAddress || text.notConfigured}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {report.chainConfig ? (
        <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <WalletCards className="size-5 text-gold-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">
                    {text.walletExecution}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-7 text-text-secondary">
                  {text.walletExecutionDescription}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {wallet.isConnected ? (
                  <Button variant="secondary" onClick={() => wallet.disconnectWallet()}>
                    {text.clearWallet}
                  </Button>
                ) : (
                  <Button
                    onClick={() => void wallet.connectWallet()}
                    disabled={!wallet.hasProvider || wallet.isWalletBusy}
                  >
                    <Cable className="size-4" />
                    {text.connectWallet}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void wallet.switchNetwork('testnet')}
                  disabled={!wallet.hasProvider || wallet.isWalletBusy}
                >
                  {text.switchTestnet}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void wallet.switchNetwork('mainnet')}
                  disabled={!wallet.hasProvider || wallet.isWalletBusy}
                >
                  {text.switchMainnet}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs text-text-muted">{text.connectedAddress}</p>
                <p className="mt-2 break-all text-sm text-text-primary">
                  {wallet.walletAddress || text.requiresWallet}
                </p>
              </div>
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs text-text-muted">{text.connectedNetwork}</p>
                <p className="mt-2 font-medium text-text-primary">
                  {wallet.networkLabel}
                </p>
              </div>
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs text-text-muted">{text.onchainKyc}</p>
                <p className="mt-2 font-medium text-text-primary">
                  {wallet.kycLoading
                    ? '...'
                    : `L${wallet.kycSnapshot?.isHuman ? wallet.kycSnapshot.level : 0}`}
                </p>
                <p className="mt-2 text-xs leading-6 text-text-muted">
                  {wallet.kycSnapshot?.note || text.requiresWallet}
                </p>
              </div>
            </div>

            {report.attestationDraft ? (
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-primary">
                      {text.attestationDraft}
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {report.attestationDraft.contractAddress || text.missingContract}
                    </p>
                  </div>
                  <Badge tone={report.attestationDraft.ready ? 'success' : 'warning'}>
                    {report.attestationDraft.ready ? text.readyOnchain : text.offlineDraft}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleWriteAttestation()}
                    disabled={
                      !report.attestationDraft.ready ||
                      attestationWriter.isPending ||
                      recordAttestationMutation.isPending ||
                      !wallet.hasProvider
                    }
                  >
                    <FileCode2 className="size-4" />
                    {attestationWriter.isPending || recordAttestationMutation.isPending
                      ? text.executingAttestation
                      : text.executeAttestation}
                  </Button>
                  {report.attestationDraft.transactionUrl ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        window.open(report.attestationDraft?.transactionUrl, '_blank', 'noreferrer')
                      }
                    >
                      {text.viewExplorerShort}
                    </Button>
                  ) : null}
                </div>

                {report.attestationDraft.transactionHash ? (
                  <div className="mt-4 rounded-[18px] border border-[rgba(249,228,159,0.16)] bg-[rgba(212,175,55,0.08)] p-4 text-sm leading-7 text-text-secondary">
                    <p className="font-medium text-text-primary">{text.attestationSubmitted}</p>
                    <p className="mt-2 break-all">
                      {report.attestationDraft.transactionHash}
                    </p>
                    {report.attestationDraft.transactionUrl ? (
                      <a
                        href={report.attestationDraft.transactionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
                      >
                        {text.viewExplorerShort}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Radar className="size-5 text-gold-primary" />
              <h2 className="text-lg font-semibold text-text-primary">
                {text.liveOracle}
              </h2>
            </div>
            <p className="text-sm leading-7 text-text-secondary">
              {text.liveOracleDescription}
            </p>
            <div className="space-y-3">
              {(marketQuery.data ?? []).map((snapshot) => (
                <div
                  key={`${snapshot.feedId}-${snapshot.network}`}
                  className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-primary">{snapshot.pair}</p>
                    <Badge tone={snapshot.status === 'live' ? 'success' : 'warning'}>
                      {snapshot.network}
                    </Badge>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">
                    {typeof snapshot.price === 'number' ? snapshot.price.toFixed(6) : '—'}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">
                    {snapshot.note}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    {text.fetchedAt}: {snapshot.fetchedAt}
                  </p>
                  {snapshot.updatedAt ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {text.updatedAt}: {snapshot.updatedAt}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {snapshot.sourceUrl ? (
                      <a
                        href={snapshot.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-ink underline-offset-4 hover:underline"
                      >
                        {text.sourceUrl}
                      </a>
                    ) : null}
                    {snapshot.explorerUrl ? (
                      <a
                        href={snapshot.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-ink underline-offset-4 hover:underline"
                      >
                        {text.viewExplorerShort}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {report.assetCards.length ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-gold-primary" />
            <h2 className="text-xl font-semibold text-text-primary">{text.assetCards}</h2>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {report.assetCards.map((asset) => (
              <Card key={asset.assetId} className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-text-primary">{asset.name}</h3>
                      <Badge tone="neutral">{asset.symbol}</Badge>
                      {asset.onchainVerified ? (
                        <Badge tone="neutral">{text.onchainVerified}</Badge>
                      ) : null}
                      {asset.issuerDisclosed ? (
                        <Badge tone="neutral">{text.issuerDisclosed}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">{asset.fitSummary}</p>
                  </div>
                  <Badge tone="gold">{assetTypeLabel(asset.assetType, isZh)}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.baseAnnualized}</p>
                    <p className="mt-2 font-medium text-text-primary">
                      {formatPercent(asset.expectedReturnBase * 100)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.overallRisk}</p>
                    <p className="mt-2 font-medium text-text-primary">
                      {asset.riskVector.overall.toFixed(1)} / 100
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.earliestExit}</p>
                    <p className="mt-2 font-medium text-text-primary">
                      {asset.exitDays === 0 ? 'T+0' : `T+${asset.exitDays}`}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.totalCost}</p>
                    <p className="mt-2 font-medium text-text-primary">
                      {asset.totalCostBps} bps
                    </p>
                  </div>
                </div>

                <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
                  <p className="font-medium text-text-primary">{text.investmentThesis}</p>
                  <p className="mt-2">{asset.thesis}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {text.kycRequirement}: L{asset.kycRequiredLevel ?? 0}
                  </p>
                  {asset.primarySourceUrl ? (
                    <a
                      href={asset.primarySourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
                    >
                      {text.sourceUrl}
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {asset.tags.map((tag) => (
                    <span
                      key={`${asset.assetId}-${tag}`}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {report.simulations.length ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Radar className="size-5 text-gold-primary" />
            <h2 className="text-xl font-semibold text-text-primary">{text.simulations}</h2>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {report.simulations.map((simulation) => (
              <Card key={simulation.assetId} className="space-y-4 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{simulation.assetName}</h3>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">{simulation.scenarioNote}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.percentileRange}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {formatPercent(simulation.returnPctLow)} / {formatPercent(simulation.returnPctBase)} / {formatPercent(simulation.returnPctHigh)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.varCvar}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {formatPercent(simulation.var95Pct)} / {formatPercent(simulation.cvar95Pct)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.endingValueP50}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {formatMoney(
                        simulation.endingValueBase,
                        session.intakeContext.baseCurrency,
                        locale,
                      )}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-xs text-text-muted">{text.baseMdd}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {formatPercent(simulation.maxDrawdownBasePct)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {report.tables?.length ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">{text.tables}</h2>
          {report.tables.map((table) => (
            <ReportTableCard key={table.id} table={table} />
          ))}
        </div>
      ) : null}

      {report.charts.length ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">{text.charts}</h2>
          {report.charts.map((chart) => (
            <ChartCard key={chart.id} chart={chart} />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <ScrollText className="size-5 text-gold-primary" />
              <h2 className="text-xl font-semibold text-text-primary">{text.fullAnalysis}</h2>
            </div>
            <ReportMarkdown markdown={report.markdown} />
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-text-primary">{text.assumptions}</h2>
            <div className="space-y-3">
              {report.assumptions.map((assumption) => (
                <div
                  key={assumption}
                  className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary"
                >
                  {assumption}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {report.recommendedAllocations.length ? (
            <Card className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <Coins className="size-5 text-gold-primary" />
                <h2 className="text-lg font-semibold text-text-primary">
                  {text.recommendedAllocations}
                </h2>
              </div>
              <div className="space-y-3">
                {report.recommendedAllocations.map((allocation) => (
                  <div
                    key={allocation.assetId}
                    className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-text-primary">{allocation.assetName}</p>
                      <Badge tone={allocation.blockedReason ? 'warning' : 'gold'}>
                        {allocation.targetWeightPct.toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">{allocation.rationale}</p>
                    <p className="mt-2 text-xs text-text-muted">
                      {text.suggestedAmount}:{' '}
                      {formatMoney(
                        allocation.suggestedAmount,
                        session.intakeContext.baseCurrency,
                        locale,
                      )}
                    </p>
                    {allocation.blockedReason ? (
                      <p className="mt-2 text-xs text-[#f2cf9c]">
                        {text.blockedReason}: {allocation.blockedReason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Link2 className="size-5 text-gold-primary" />
              <h2 className="text-lg font-semibold text-text-primary">{text.evidencePanel}</h2>
            </div>
            <div className="space-y-3">
              {report.evidence.length ? (
                report.evidence.map((evidence) => (
                  <div
                    key={evidence.id}
                    className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-text-primary">{evidence.title}</p>
                      <Badge tone="gold">{Math.round(evidence.confidence * 100)}%</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">{evidence.summary}</p>
                    <p className="mt-2 text-xs text-text-muted">
                      {text.fetchedAt}: {evidence.fetchedAt}
                    </p>
                    <a
                      href={evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
                    >
                      {evidence.sourceName}
                    </a>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
                  {text.evidenceFallback}
                </div>
              )}
            </div>
          </Card>

          {report.txDraft ? (
            <Card className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <WalletCards className="size-5 text-gold-primary" />
                <h2 className="text-lg font-semibold text-text-primary">{text.txDraft}</h2>
              </div>
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4 text-sm text-text-secondary">
                {text.totalEstimatedFee}:{' '}
                {formatMoney(report.txDraft.totalEstimatedFeeUsd, 'USD', locale)}
              </div>
              <div className="space-y-3">
                {report.txDraft.steps.map((step) => (
                  <div
                    key={`${step.step}-${step.title}`}
                    className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-text-primary">
                        {text.stepLabel} {step.step}. {step.title}
                      </p>
                      <Badge tone="neutral">{step.actionType}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">{step.description}</p>
                    <p className="mt-2 text-xs text-text-muted">
                      {text.estimatedFee}: {formatMoney(step.estimatedFeeUsd, 'USD', locale)}
                    </p>
                    {step.caution ? (
                      <p className="mt-2 text-xs text-[#f2cf9c]">
                        {text.caution}: {step.caution}
                      </p>
                    ) : null}
                    {step.explorerUrl ? (
                      <a
                        href={step.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
                      >
                        {text.viewExplorer}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {report.txDraft.riskWarnings.map((warning) => (
                  <div
                    key={warning}
                    className="rounded-[18px] border border-[rgba(249,228,159,0.16)] bg-[rgba(212,175,55,0.08)] p-4 text-sm leading-7 text-text-secondary"
                  >
                    {warning}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {report.attestationDraft ? (
            <Card className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <FileCode2 className="size-5 text-gold-primary" />
                <h2 className="text-lg font-semibold text-text-primary">
                  {text.attestationDraft}
                </h2>
              </div>
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
                <p>{text.reportHash}: {report.attestationDraft.reportHash.slice(0, 16)}...</p>
                <p className="mt-2">{text.portfolioHash}: {report.attestationDraft.portfolioHash.slice(0, 16)}...</p>
                <p className="mt-2">{text.attestationHash}: {report.attestationDraft.attestationHash.slice(0, 16)}...</p>
                <p className="mt-2">{text.network}: {report.attestationDraft.network}</p>
              </div>

              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{text.planRegistry}</p>
                  <Badge tone={report.attestationDraft.ready ? 'success' : 'warning'}>
                    {report.attestationDraft.ready ? text.readyOnchain : text.offlineDraft}
                  </Badge>
                </div>
                <p className="mt-2 break-all text-sm text-text-secondary">
                  {report.attestationDraft.contractAddress || text.missingContract}
                </p>
                {report.attestationDraft.explorerUrl ? (
                  <a
                    href={report.attestationDraft.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-xs text-gold-ink underline-offset-4 hover:underline"
                  >
                    {text.viewExplorerShort}
                  </a>
                ) : null}
                {report.attestationDraft.transactionHash ? (
                  <p className="mt-3 break-all text-xs text-text-muted">
                    {text.transactionHash}: {report.attestationDraft.transactionHash}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <TriangleAlert className="size-5 text-gold-primary" />
              <h2 className="text-lg font-semibold text-text-primary">{text.riskWarnings}</h2>
            </div>
            <div className="space-y-3">
              {report.disclaimers.map((disclaimer) => (
                <div
                  key={disclaimer}
                  className="rounded-[18px] border border-[rgba(249,228,159,0.16)] bg-[rgba(212,175,55,0.08)] p-4 text-sm leading-7 text-text-secondary"
                >
                  {disclaimer}
                </div>
              ))}
              <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
                {text.extraRiskNote}
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-gold-primary" />
              <h2 className="text-lg font-semibold text-text-primary">
                {text.calculationSummary}
              </h2>
            </div>
            <div className="space-y-3">
              {report.calculations.map((calculation) => (
                <div
                  key={calculation.id}
                  className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                >
                  <p className="font-medium text-text-primary">{calculation.taskType}</p>
                  <p className="mt-2 text-sm text-gold-ink">
                    {calculation.result} {calculation.units}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">
                    {calculation.formulaExpression}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
