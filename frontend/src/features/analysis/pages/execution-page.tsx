import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Network,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { DetailDrawer } from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { shortAddress } from '@/lib/web3/hashkey'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type { ExecutionAdapterKind, ExecutionReceipt } from '@/types'

function formatUsd(value?: number) {
  if (value == null || Number.isNaN(value)) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value)
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

function toneFor(value?: string) {
  if (
    value === 'ready' ||
    value === 'submitted' ||
    value === 'completed' ||
    value === 'eligible' ||
    value === 'fresh'
  ) {
    return 'success' as const
  }
  if (
    value === 'requires_issuer' ||
    value === 'conditional' ||
    value === 'redirect_required' ||
    value === 'pending_settlement' ||
    value === 'pending'
  ) {
    return 'gold' as const
  }
  if (
    value === 'view_only' ||
    value === 'blocked' ||
    value === 'failed'
  ) {
    return 'warning' as const
  }
  return 'info' as const
}

function adapterCopy(adapter?: ExecutionAdapterKind) {
  if (adapter === 'direct_contract') {
    return {
      title: 'Direct contract',
      detail: 'The execution package includes allowance scope, calldata, target contract, and settlement status tracking.',
    }
  }
  if (adapter === 'issuer_portal') {
    return {
      title: 'Issuer portal',
      detail: 'The desk must create an issuer-side case, follow the redirect flow, and then track settlement asynchronously.',
    }
  }
  return {
    title: 'View only',
    detail: 'This asset is visible for proof and readiness checks but cannot enter the live submit path from this console.',
  }
}

export function ExecutionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const queryClient = useQueryClient()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId],
    queryFn: () => adapter.analysis.getById(sessionId),
    enabled: Boolean(sessionId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', sessionId, 'report'],
    queryFn: () => adapter.analysis.getReport(sessionId),
    enabled: Boolean(sessionId),
  })

  const report = reportQuery.data
  const session = sessionQuery.data
  const chainConfig = report?.chainConfig
  const wallet = useHashKeyWallet(chainConfig)

  useEffect(() => {
    if (!session) return
    if (session.status === 'CLARIFYING') {
      void navigate(`/sessions/${sessionId}/clarify`, { replace: true })
    }
    if (session.status === 'ANALYZING') {
      void navigate(`/sessions/${sessionId}/analyzing`, { replace: true })
    }
  }, [navigate, session, sessionId])

  const storedPlan = report?.executionPlan ?? session?.executionPlan
  const targetAsset =
    storedPlan?.targetAsset ||
    report?.recommendedAllocations[0]?.assetId ||
    report?.assetCards[0]?.assetId ||
    ''
  const targetAssetCard = report?.assetCards.find((item) => item.assetId === targetAsset)
  const sourceAsset =
    storedPlan?.sourceAsset ||
    session?.sourceAsset ||
    session?.intakeContext.sourceAsset ||
    targetAssetCard?.settlementAsset ||
    'USDT'
  const ticketSize =
    storedPlan?.ticketSize ||
    session?.ticketSize ||
    session?.intakeContext.ticketSize ||
    report?.recommendedAllocations[0]?.suggestedAmount ||
    session?.intakeContext.investmentAmount ||
    0
  const sourceChain =
    storedPlan?.sourceChain ||
    session?.sourceChain ||
    session?.intakeContext.sourceChain ||
    'hashkey'
  const targetNetwork =
    wallet.walletNetwork ||
    (report?.chainConfig?.defaultExecutionNetwork === 'mainnet' ? 'mainnet' : 'testnet')
  const trackedWalletAddress =
    wallet.walletAddress ||
    session?.walletAddress ||
    session?.intakeContext.walletAddress ||
    session?.safeAddress ||
    session?.intakeContext.safeAddress ||
    ''

  const readinessQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-readiness', targetAsset, trackedWalletAddress, targetNetwork, ticketSize],
    queryFn: () =>
      adapter.rwa.getAssetReadiness({
        assetId: targetAsset,
        address: trackedWalletAddress,
        sessionId,
        network: targetNetwork,
        amount: ticketSize,
        sourceAsset,
        sourceChain,
      }),
    enabled: Boolean(sessionId && targetAsset),
  })

  const walletSummaryQuery = useQuery({
    queryKey: ['analysis', sessionId, 'wallet-summary', trackedWalletAddress, targetNetwork],
    queryFn: () => adapter.rwa.getWalletSummary(trackedWalletAddress, targetNetwork),
    enabled: Boolean(trackedWalletAddress),
  })

  const prepareQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-prepare', targetAsset, sourceAsset, ticketSize, trackedWalletAddress, targetNetwork],
    queryFn: () =>
      adapter.rwa.execute({
        sessionId,
        sourceAsset,
        targetAsset,
        amount: ticketSize,
        walletAddress: trackedWalletAddress,
        safeAddress: session?.safeAddress || session?.intakeContext.safeAddress || '',
        sourceChain,
        includeAttestation: true,
        generateOnly: true,
      }),
    enabled: Boolean(sessionId && targetAsset && ticketSize > 0 && session && report),
    staleTime: 30_000,
  })

  const receiptsQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-receipts'],
    queryFn: () => adapter.rwa.listExecutionReceipts({ sessionId }),
    enabled: Boolean(sessionId),
    refetchInterval: 30_000,
  })

  const monitorQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-monitor'],
    queryFn: () => adapter.rwa.monitor(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 30_000,
  })

  const [txHashInput, setTxHashInput] = useState('')
  const [blockNumberInput, setBlockNumberInput] = useState('')
  const [selectedReceipt, setSelectedReceipt] = useState<ExecutionReceipt | null>(null)

  const submitMutation = useMutation({
    mutationFn: (payload: { transactionHash?: string; blockNumber?: number }) =>
      adapter.rwa.submitExecution({
        sessionId,
        sourceAsset,
        targetAsset,
        amount: ticketSize,
        walletAddress: trackedWalletAddress,
        safeAddress: session?.safeAddress || session?.intakeContext.safeAddress || '',
        sourceChain,
        includeAttestation: true,
        network: targetNetwork,
        transactionHash: payload.transactionHash,
        submittedBy: trackedWalletAddress || session?.walletAddress || '',
        blockNumber: payload.blockNumber,
      }),
    onSuccess: async (result) => {
      setSelectedReceipt(result.receipt)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'report'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'execution-prepare'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'execution-receipts'] }),
        queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'execution-monitor'] }),
      ])
    },
  })

  const currentPlan = prepareQuery.data?.executionPlan ?? storedPlan
  const currentReceipt =
    submitMutation.data?.receipt ??
    prepareQuery.data?.executionReceipt ??
    receiptsQuery.data?.[0]
  const receiptList = receiptsQuery.data ?? []
  const readiness = readinessQuery.data
  const adapterDescriptor = adapterCopy(currentPlan?.executionAdapterKind)

  if (sessionQuery.isLoading || reportQuery.isLoading || (prepareQuery.isLoading && !currentPlan)) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {isZh ? '正在生成 execution package...' : 'Generating execution package...'}
        </div>
      </Card>
    )
  }

  if (!session || !report || !currentPlan || !readiness) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          {isZh ? '执行信息暂时不可用。' : 'Execution context is unavailable.'}
        </p>
        <Button variant="secondary" onClick={() => void navigate(`/reports/${sessionId}`)}>
          <ArrowLeft className="size-4" />
          {isZh ? '返回报告' : 'Back to report'}
        </Button>
      </Card>
    )
  }

  const submitDisabled =
    submitMutation.isPending ||
    currentPlan.executionAdapterKind === 'view_only' ||
    currentPlan.executionReadiness === 'blocked'

  const recordTxDisabled =
    submitMutation.isPending ||
    currentPlan.executionAdapterKind !== 'direct_contract' ||
    !txHashInput.trim()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? '机构执行入口' : 'Institutional execution desk'}
        title={targetAssetCard?.name || currentPlan.targetAsset || report.summaryTitle}
        description={
          isZh
            ? '先确认 investor / jurisdiction / KYC 和 settlement route，再决定是链上直达、发行方后处理，还是仅做 proof 验证。'
            : 'Confirm investor, jurisdiction, KYC, and settlement route first, then separate direct contract execution from issuer handling and proof-only verification.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/reports/${sessionId}`)}>
              <ArrowLeft className="size-4" />
              {isZh ? '返回报告' : 'Back to report'}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void navigate(
                  trackedWalletAddress ? `/portfolio/${trackedWalletAddress}` : '/portfolio',
                )
              }
            >
              <Radio className="size-4" />
              {isZh ? '投后监控' : 'Monitoring'}
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[32px] border border-border-subtle bg-[linear-gradient(135deg,rgba(14,25,47,0.97),rgba(20,41,75,0.93)_52%,rgba(10,21,38,0.98))]">
        <div className="grid gap-7 px-6 py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] lg:px-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneFor(currentPlan.executionAdapterKind)}>{currentPlan.executionAdapterKind}</Badge>
              <Badge tone={toneFor(currentPlan.executionReadiness)}>{currentPlan.executionReadiness}</Badge>
              <Badge tone={toneFor(readiness.decision.status)}>{readiness.decision.status}</Badge>
              {currentReceipt ? (
                <Badge tone={toneFor(currentReceipt.status)}>{currentReceipt.status}</Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-text-primary md:text-4xl">
                {adapterDescriptor.title}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-text-secondary md:text-[15px]">
                {adapterDescriptor.detail}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Investor type' : 'Investor type'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {session.investorType || session.intakeContext.investorType || 'Institutional'}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {session.jurisdiction || session.intakeContext.jurisdiction || 'Global / unspecified'}
                </p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'KYC level' : 'KYC level'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {walletSummaryQuery.data?.kyc.level ?? session.kycLevel ?? session.intakeContext.kycLevel ?? 0}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {walletSummaryQuery.data?.kyc.status || session.kycStatus || 'unknown'}
                </p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Min ticket / size' : 'Min ticket / size'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {formatUsd(targetAssetCard?.minSubscriptionAmount || targetAssetCard?.minSubscriptionAmount === 0
                    ? targetAssetCard.minSubscriptionAmount
                    : readiness.asset.minimumTicketUsd)}
                </p>
                <p className="mt-2 text-sm text-text-secondary">{formatUsd(ticketSize)} requested</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Settlement route' : 'Settlement route'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{sourceAsset} on {targetNetwork}</p>
                <p className="mt-2 text-sm text-text-secondary">{readiness.routeSummary}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border-subtle bg-[rgba(9,18,34,0.72)] p-5">
            <div className="flex items-center gap-2">
              <Wallet className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? '操作主体' : 'Operator context'}
              </p>
            </div>
            <div className="mt-4 space-y-4 text-sm text-text-secondary">
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Tracked wallet' : 'Tracked wallet'}
                </p>
                <p className="mt-2 text-text-primary">
                  {trackedWalletAddress ? shortAddress(trackedWalletAddress) : 'Not connected'}
                </p>
                <p className="mt-2 break-all text-xs text-text-muted">{trackedWalletAddress || 'Connect a wallet to bind KYC and receipt tracking.'}</p>
              </div>
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Prepare summary' : 'Prepare summary'}
                </p>
                <p className="mt-2 leading-6 text-text-primary">{prepareQuery.data?.prepareSummary || currentPlan.readinessReason}</p>
              </div>
              {!wallet.isConnected ? (
                <Button onClick={() => void wallet.connectWallet()} disabled={!wallet.hasProvider || wallet.isWalletBusy}>
                  <Wallet className="size-4" />
                  {isZh ? '连接钱包' : 'Connect wallet'}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() =>
                  void Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'execution-prepare'] }),
                    queryClient.invalidateQueries({ queryKey: ['analysis', sessionId, 'execution-receipts'] }),
                  ])
                }
              >
                <RefreshCw className="size-4" />
                {isZh ? '刷新执行包' : 'Refresh package'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Adapter 分流' : 'Adapter split'}
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {(['direct_contract', 'issuer_portal', 'view_only'] as ExecutionAdapterKind[]).map((kind) => (
                <div
                  key={kind}
                  className={`rounded-[22px] border p-4 ${
                    currentPlan.executionAdapterKind === kind
                      ? 'border-[rgba(34,211,238,0.28)] bg-[rgba(34,211,238,0.08)]'
                      : 'border-border-subtle bg-app-bg-elevated'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-text-primary">{adapterCopy(kind).title}</p>
                    {currentPlan.executionAdapterKind === kind ? <Badge tone="info">Active</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-secondary">{adapterCopy(kind).detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Required docs / approvals / checklist' : 'Required docs / approvals / checklist'}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Checklist' : 'Checklist'}
                </p>
                {(currentPlan.checklist.length ? currentPlan.checklist : prepareQuery.data?.checklist ?? []).map((item) => (
                  <div key={item} className="rounded-[18px] bg-app-bg-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Approvals / blockers' : 'Approvals / blockers'}
                </p>
                {currentPlan.requiredApprovals.length ? (
                  currentPlan.requiredApprovals.map((approval) => (
                    <div key={`${approval.approvalType}-${approval.spender}`} className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">{approval.approvalType}</Badge>
                        {approval.allowanceRequired ? <Badge tone="gold">allowance</Badge> : null}
                      </div>
                      <p className="mt-3 text-sm text-text-primary">
                        {approval.tokenSymbol || 'Settlement asset'} {approval.amount ? formatUsd(approval.amount) : ''}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{approval.note || approval.approvalTarget || approval.spender}</p>
                    </div>
                  ))
                ) : (
                  (prepareQuery.data?.blockers.length ? prepareQuery.data.blockers : currentPlan.complianceBlockers).map((item) => (
                    <div key={item} className="rounded-[18px] border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
                      {item}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Network className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'External step tracker' : 'External step tracker'}
              </p>
            </div>
            <div className="space-y-3">
              {currentPlan.externalSteps.map((step, index) => (
                <div key={step} className="grid gap-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 md:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex size-8 items-center justify-center rounded-full bg-[rgba(79,124,255,0.14)] text-primary-hover">
                    {index + 1}
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-text-primary">{step}</p>
                    <p className="text-sm leading-6 text-text-secondary">
                      {currentPlan.steps[index]?.description || currentPlan.steps[index]?.title || 'Execution workflow step.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-text-primary">
                  {isZh ? 'Submit / receipt / status' : 'Submit / receipt / status'}
                </p>
                <p className="text-sm text-text-secondary">
                  {isZh ? 'prepare -> submit -> receipt -> settlement 的状态全部在这里回执。' : 'Prepare, submit, receipt, and settlement are all tracked here.'}
                </p>
              </div>
              {currentReceipt ? (
                <Badge tone={toneFor(currentReceipt.status)}>{currentReceipt.status}</Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Receipt ID' : 'Receipt ID'}
                </p>
                <p className="mt-2 break-all text-sm text-text-primary">{currentReceipt?.id || currentPlan.receiptId || 'Will be created on submit'}</p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Settlement' : 'Settlement'}
                </p>
                <p className="mt-2 text-sm text-text-primary">{currentReceipt?.settlementStatus || 'not_started'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submitMutation.mutateAsync({})} disabled={submitDisabled}>
                <ArrowRight className="size-4" />
                {currentPlan.executionAdapterKind === 'issuer_portal'
                  ? isZh ? '创建 issuer request' : 'Create issuer request'
                  : isZh ? '生成 submit 回执' : 'Generate submit receipt'}
              </Button>
              <Button
                variant="secondary"
                disabled={!currentReceipt}
                onClick={() => currentReceipt && setSelectedReceipt(currentReceipt)}
              >
                {isZh ? '打开 receipt' : 'Open receipt'}
              </Button>
              {submitMutation.data?.redirectUrl ? (
                <Button
                  variant="secondary"
                  onClick={() => window.open(submitMutation.data?.redirectUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="size-4" />
                  {isZh ? '打开 issuer flow' : 'Open issuer flow'}
                </Button>
              ) : null}
            </div>

            {currentPlan.executionAdapterKind === 'direct_contract' ? (
              <div className="space-y-3 rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="font-semibold text-text-primary">
                  {isZh ? '记录链上 tx / 回执推进状态' : 'Record chain tx to advance the receipt state'}
                </p>
                <div className="grid gap-3">
                  <Input
                    value={txHashInput}
                    onChange={(event) => setTxHashInput(event.target.value)}
                    placeholder="0x..."
                  />
                  <Input
                    value={blockNumberInput}
                    onChange={(event) => setBlockNumberInput(event.target.value)}
                    placeholder={isZh ? '可选 block number' : 'Optional block number'}
                    inputMode="numeric"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={recordTxDisabled}
                  onClick={() =>
                    void submitMutation.mutateAsync({
                      transactionHash: txHashInput.trim(),
                      blockNumber: blockNumberInput ? Number(blockNumberInput) : undefined,
                    })
                  }
                >
                  <CheckCircle2 className="size-4" />
                  {isZh ? '记录 tx hash / block' : 'Record tx hash / block'}
                </Button>
              </div>
            ) : null}

            {currentPlan.executionReadiness === 'blocked' || currentPlan.executionAdapterKind === 'view_only' ? (
              <div className="rounded-[20px] border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] p-4 text-sm leading-6 text-text-secondary">
                {currentPlan.executionReadiness === 'blocked'
                  ? currentPlan.complianceBlockers.join(' ') || 'Current eligibility prevents submission.'
                  : 'This asset is intentionally proof-only and any submit request must remain blocked.'}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Receipt timeline' : 'Receipt timeline'}
              </p>
            </div>
            <div className="space-y-3">
              {receiptList.length ? (
                receiptList.map((receipt) => (
                  <button
                    key={receipt.id}
                    type="button"
                    className="w-full rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-left transition hover:border-border-strong"
                    onClick={() => setSelectedReceipt(receipt)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-text-primary">{receipt.assetId}</p>
                        <p className="text-sm text-text-secondary">{formatDateTime(receipt.updatedAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={toneFor(receipt.adapterKind)}>{receipt.adapterKind}</Badge>
                        <Badge tone={toneFor(receipt.status)}>{receipt.status}</Badge>
                        <Badge tone={toneFor(receipt.settlementStatus)}>{receipt.settlementStatus}</Badge>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm leading-6 text-text-secondary">
                  {isZh ? '还没有 receipt。先生成 submit payload。' : 'No receipt yet. Generate the submit payload first.'}
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Post-submit monitoring' : 'Post-submit monitoring'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Allocation mix</p>
                <p className="mt-2 text-sm text-text-primary">
                  {Object.keys(monitorQuery.data?.allocationMix ?? {}).length
                    ? Object.entries(monitorQuery.data?.allocationMix ?? {})
                        .map(([assetId, weight]) => `${assetId}: ${Math.round(weight * 100)}%`)
                        .join(' · ')
                    : 'N/A'}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Yield / redemption</p>
                <p className="mt-2 text-sm text-text-primary">
                  {formatUsd(monitorQuery.data?.accruedYield)} accrued · {formatUsd(monitorQuery.data?.redemptionForecast)} forecast
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(monitorQuery.data?.portfolioAlerts ?? []).slice(0, 4).map((alert) => (
                <div key={alert.id} className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={toneFor(alert.severity)}>{alert.severity}</Badge>
                    <span className="text-sm font-semibold text-text-primary">{alert.title}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{alert.detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>

      <DetailDrawer
        open={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        title={selectedReceipt ? `${selectedReceipt.assetId} receipt` : 'Receipt'}
        description={selectedReceipt ? `Status ${selectedReceipt.status} · settlement ${selectedReceipt.settlementStatus}` : ''}
        actions={
          selectedReceipt?.redirectUrl ? (
            <Button
              variant="secondary"
              onClick={() => window.open(selectedReceipt.redirectUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="size-4" />
              {isZh ? '打开 redirect' : 'Open redirect'}
            </Button>
          ) : undefined
        }
      >
        {selectedReceipt ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Receipt</p>
                <p className="mt-2 break-all text-sm text-text-primary">{selectedReceipt.id}</p>
                <p className="mt-2 text-sm text-text-secondary">{selectedReceipt.adapterKind}</p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Tx / request</p>
                <p className="mt-2 break-all text-sm text-text-primary">
                  {selectedReceipt.txHash || selectedReceipt.externalRequestId || 'Awaiting submission'}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  Updated {formatDateTime(selectedReceipt.updatedAt)}
                </p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Prepared payload</p>
                <pre className="overflow-x-auto rounded-[20px] bg-app-bg-elevated p-4 text-xs leading-6 text-text-secondary">
                  {JSON.stringify(selectedReceipt.preparedPayload, null, 2)}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">Submit payload</p>
                <pre className="overflow-x-auto rounded-[20px] bg-app-bg-elevated p-4 text-xs leading-6 text-text-secondary">
                  {JSON.stringify(selectedReceipt.submitPayload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  )
}
