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
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { TFunction } from 'i18next'

import { PageHeader } from '@/components/layout/page-header'
import { DetailDrawer } from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { formatDateTime as formatDateTimeValue, formatMoney } from '@/lib/utils/format'
import { shortAddress } from '@/lib/web3/hashkey'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import type { ExecutionAdapterKind, ExecutionPlan, ExecutionReceipt, LanguageCode } from '@/types'

function formatUsd(value: number | undefined, locale: LanguageCode) {
  return formatMoney(value, 'USD', locale, {
    maximumFractionDigits: typeof value === 'number' && value >= 1000 ? 0 : 2,
  })
}

function formatDateTime(value: string | undefined, locale: LanguageCode) {
  if (!value) return '--'
  return formatDateTimeValue(value, locale)
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

function labelForExecutionValue(t: TFunction, value?: string) {
  if (!value) return t('common.notAvailable')
  return t(`analysis.executionPage.labels.${value}`, value)
}

function adapterCopy(t: TFunction, adapter?: ExecutionAdapterKind) {
  if (adapter === 'direct_contract') {
    return {
      title: t('analysis.executionPage.adapterKinds.direct_contract.title'),
      detail: t('analysis.executionPage.adapterKinds.direct_contract.detail'),
    }
  }
  if (adapter === 'issuer_portal') {
    return {
      title: t('analysis.executionPage.adapterKinds.issuer_portal.title'),
      detail: t('analysis.executionPage.adapterKinds.issuer_portal.detail'),
    }
  }
  return {
    title: t('analysis.executionPage.adapterKinds.view_only.title'),
    detail: t('analysis.executionPage.adapterKinds.view_only.detail'),
  }
}

export function ExecutionPage() {
  const { t } = useTranslation()
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const queryClient = useQueryClient()
  const locale = useAppStore((state) => state.locale)

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-session', locale],
    queryFn: () => adapter.analysis.getById(sessionId),
    enabled: Boolean(sessionId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-report', locale],
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
    queryKey: ['analysis', sessionId, 'execution-readiness', targetAsset, trackedWalletAddress, targetNetwork, ticketSize, locale],
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
    queryKey: ['analysis', sessionId, 'wallet-summary', trackedWalletAddress, targetNetwork, locale],
    queryFn: () => adapter.rwa.getWalletSummary(trackedWalletAddress, targetNetwork),
    enabled: Boolean(trackedWalletAddress),
  })

  const prepareQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-prepare', targetAsset, sourceAsset, ticketSize, trackedWalletAddress, targetNetwork, locale],
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
    queryKey: ['analysis', sessionId, 'execution-receipts', locale],
    queryFn: () => adapter.rwa.listExecutionReceipts({ sessionId }),
    enabled: Boolean(sessionId),
    refetchInterval: 30_000,
  })

  const monitorQuery = useQuery({
    queryKey: ['analysis', sessionId, 'execution-monitor', locale],
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

  const readiness = readinessQuery.data
  const fallbackPlan: ExecutionPlan | undefined =
    !storedPlan &&
    !prepareQuery.data?.executionPlan &&
    readiness &&
    targetAsset &&
    ticketSize > 0
      ? {
          id: `${sessionId}-derived-plan`,
          sessionId,
          generatedAt: session?.updatedAt ?? new Date().toISOString(),
          walletAddress: trackedWalletAddress,
          safeAddress: session?.safeAddress || session?.intakeContext.safeAddress || '',
          sourceChain,
          sourceAsset,
          targetAsset,
          executionAdapterKind: readiness.executionAdapterKind,
          executionReadiness: readiness.executionReadiness,
          readinessReason: readiness.routeSummary,
          externalActionUrl:
            readiness.asset.actionLinks?.[0]?.url ?? readiness.asset.primarySourceUrl ?? '',
          externalActionLabel: readiness.asset.actionLinks?.[0]?.label ?? '',
          ticketSize,
          status: 'prepared',
          quote: readiness.quote,
          warnings: readiness.warnings,
          simulationWarnings: readiness.warnings,
          possibleFailureReasons: readiness.possibleFailureReasons,
          complianceBlockers: readiness.complianceBlockers,
          requiredApprovals: readiness.requiredApprovals,
          checklist: readiness.asset.executionNotes?.length
            ? readiness.asset.executionNotes
            : [readiness.routeSummary],
          externalSteps: [],
          steps: [],
          txBundle: [],
          eligibility: [readiness.decision],
          canExecuteOnchain: readiness.executionAdapterKind !== 'view_only',
        }
      : undefined
  const currentPlan = prepareQuery.data?.executionPlan ?? storedPlan ?? fallbackPlan
  const currentReceipt =
    submitMutation.data?.receipt ??
    prepareQuery.data?.executionReceipt ??
    receiptsQuery.data?.[0]
  const receiptList = receiptsQuery.data ?? []
  const adapterDescriptor = adapterCopy(t, currentPlan?.executionAdapterKind)

  if (sessionQuery.isLoading || reportQuery.isLoading || (prepareQuery.isLoading && !currentPlan)) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {t('analysis.executionPage.loading')}
        </div>
      </Card>
    )
  }

  if (!session || !report || !currentPlan || !readiness) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          {t('analysis.executionPage.unavailable')}
        </p>
        <Button variant="secondary" onClick={() => void navigate(`/reports/${sessionId}`)}>
          <ArrowLeft className="size-4" />
          {t('analysis.executionPage.backToReport')}
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
        eyebrow={t('analysis.executionPage.eyebrow')}
        title={targetAssetCard?.name || currentPlan.targetAsset || report.summaryTitle}
        description={t('analysis.executionPage.description')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/reports/${sessionId}`)}>
              <ArrowLeft className="size-4" />
              {t('analysis.executionPage.backToReport')}
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
              {t('analysis.executionPage.monitoring')}
            </Button>
          </>
        }
      />

      <section className="hero-surface overflow-hidden rounded-[32px] border border-border-subtle">
        <div className="grid gap-7 px-6 py-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] lg:px-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={toneFor(currentPlan.executionAdapterKind)}>
                {labelForExecutionValue(t, currentPlan.executionAdapterKind)}
              </Badge>
              <Badge tone={toneFor(currentPlan.executionReadiness)}>
                {labelForExecutionValue(t, currentPlan.executionReadiness)}
              </Badge>
              <Badge tone={toneFor(readiness.decision.status)}>
                {labelForExecutionValue(t, readiness.decision.status)}
              </Badge>
              {currentReceipt ? (
                <Badge tone={toneFor(currentReceipt.status)}>
                  {labelForExecutionValue(t, currentReceipt.status)}
                </Badge>
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
              <div className="hero-stat-surface rounded-[22px] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.investorType')}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {session.investorType || session.intakeContext.investorType || 'Institutional'}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {session.jurisdiction || session.intakeContext.jurisdiction || 'Global / unspecified'}
                </p>
              </div>
              <div className="hero-stat-surface rounded-[22px] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.kycLevel')}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {walletSummaryQuery.data?.kyc.level ?? session.kycLevel ?? session.intakeContext.kycLevel ?? 0}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {walletSummaryQuery.data?.kyc.status || session.kycStatus || 'unknown'}
                </p>
              </div>
              <div className="hero-stat-surface rounded-[22px] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.minTicketSize')}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {formatUsd(targetAssetCard?.minSubscriptionAmount || targetAssetCard?.minSubscriptionAmount === 0
                    ? targetAssetCard.minSubscriptionAmount
                    : readiness.asset.minimumTicketUsd, locale)}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {formatUsd(ticketSize, locale)} {t('analysis.executionPage.fields.requested')}
                </p>
              </div>
              <div className="hero-stat-surface rounded-[22px] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.settlementRoute')}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{sourceAsset} on {targetNetwork}</p>
                <p className="mt-2 text-sm text-text-secondary">{readiness.routeSummary}</p>
              </div>
            </div>
          </div>

          <div className="hero-aside-surface rounded-[28px] border border-border-subtle p-5">
            <div className="flex items-center gap-2">
              <Wallet className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {t('analysis.executionPage.fields.operatorContext')}
              </p>
            </div>
            <div className="mt-4 space-y-4 text-sm text-text-secondary">
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.trackedWallet')}
                </p>
                <p className="mt-2 text-text-primary">
                  {trackedWalletAddress
                    ? shortAddress(trackedWalletAddress)
                    : t('analysis.executionPage.fields.notConnected')}
                </p>
                <p className="mt-2 break-all text-xs text-text-muted">
                  {trackedWalletAddress || t('analysis.executionPage.fields.trackedWalletHint')}
                </p>
              </div>
              <div className="rounded-[18px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.fields.prepareSummary')}
                </p>
                <p className="mt-2 leading-6 text-text-primary">{prepareQuery.data?.prepareSummary || currentPlan.readinessReason}</p>
              </div>
              {!wallet.isConnected ? (
                <Button onClick={() => void wallet.connectWallet()} disabled={!wallet.hasProvider || wallet.isWalletBusy}>
                  <Wallet className="size-4" />
                  {t('analysis.executionPage.fields.connectWallet')}
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
                {t('analysis.executionPage.fields.refreshPackage')}
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
                {t('analysis.executionPage.adapterSplit')}
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
                    <p className="font-semibold text-text-primary">{adapterCopy(t, kind).title}</p>
                    {currentPlan.executionAdapterKind === kind ? (
                      <Badge tone="info">{t('analysis.executionPage.labels.active')}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-secondary">{adapterCopy(t, kind).detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {t('analysis.executionPage.requiredDocs')}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.checklist')}
                </p>
                {(currentPlan.checklist.length ? currentPlan.checklist : prepareQuery.data?.checklist ?? []).map((item) => (
                  <div key={item} className="rounded-[18px] bg-app-bg-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.approvalsBlockers')}
                </p>
                {currentPlan.requiredApprovals.length ? (
                  currentPlan.requiredApprovals.map((approval) => (
                    <div key={`${approval.approvalType}-${approval.spender}`} className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">{approval.approvalType}</Badge>
                        {approval.allowanceRequired ? (
                          <Badge tone="gold">{t('analysis.executionPage.allowance')}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-text-primary">
                        {approval.tokenSymbol || t('analysis.executionPage.settlementAsset')} {approval.amount ? formatUsd(approval.amount, locale) : ''}
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
                {t('analysis.executionPage.externalStepTracker')}
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
                      {currentPlan.steps[index]?.description ||
                        currentPlan.steps[index]?.title ||
                        t('analysis.executionPage.workflowStepFallback')}
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
                  {t('analysis.executionPage.submitTitle')}
                </p>
                <p className="text-sm text-text-secondary">
                  {t('analysis.executionPage.submitDescription')}
                </p>
              </div>
              {currentReceipt ? (
                <Badge tone={toneFor(currentReceipt.status)}>
                  {labelForExecutionValue(t, currentReceipt.status)}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.receiptId')}
                </p>
                <p className="mt-2 break-all text-sm text-text-primary">
                  {currentReceipt?.id || currentPlan.receiptId || t('analysis.executionPage.receiptPending')}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {t('analysis.executionPage.settlement')}
                </p>
                <p className="mt-2 text-sm text-text-primary">
                  {labelForExecutionValue(t, currentReceipt?.settlementStatus || 'not_started')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void submitMutation.mutateAsync({})} disabled={submitDisabled}>
                <ArrowRight className="size-4" />
                {currentPlan.executionAdapterKind === 'issuer_portal'
                  ? t('analysis.executionPage.createIssuerRequest')
                  : t('analysis.executionPage.generateSubmitReceipt')}
              </Button>
              <Button
                variant="secondary"
                disabled={!currentReceipt}
                onClick={() => currentReceipt && setSelectedReceipt(currentReceipt)}
              >
                {t('analysis.executionPage.openReceipt')}
              </Button>
              {submitMutation.data?.redirectUrl ? (
                <Button
                  variant="secondary"
                  onClick={() => window.open(submitMutation.data?.redirectUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="size-4" />
                  {t('analysis.executionPage.openIssuerFlow')}
                </Button>
              ) : null}
            </div>

            {currentPlan.executionAdapterKind === 'direct_contract' ? (
              <div className="space-y-3 rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="font-semibold text-text-primary">
                  {t('analysis.executionPage.recordChainTx')}
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
                    placeholder={t('analysis.executionPage.optionalBlockNumber')}
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
                  {t('analysis.executionPage.recordTxHashBlock')}
                </Button>
              </div>
            ) : null}

            {currentPlan.executionReadiness === 'blocked' || currentPlan.executionAdapterKind === 'view_only' ? (
              <div className="rounded-[20px] border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] p-4 text-sm leading-6 text-text-secondary">
                {currentPlan.executionReadiness === 'blocked'
                  ? currentPlan.complianceBlockers.join(' ') || t('analysis.executionPage.blockedFallback')
                  : t('analysis.executionPage.proofOnlyFallback')}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {t('analysis.executionPage.receiptTimeline')}
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
                        <p className="text-sm text-text-secondary">{formatDateTime(receipt.updatedAt, locale)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={toneFor(receipt.adapterKind)}>{labelForExecutionValue(t, receipt.adapterKind)}</Badge>
                        <Badge tone={toneFor(receipt.status)}>{labelForExecutionValue(t, receipt.status)}</Badge>
                        <Badge tone={toneFor(receipt.settlementStatus)}>{labelForExecutionValue(t, receipt.settlementStatus)}</Badge>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm leading-6 text-text-secondary">
                  {t('analysis.executionPage.noReceiptYet')}
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {t('analysis.executionPage.postSubmitMonitoring')}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">{t('analysis.executionPage.allocationMix')}</p>
                <p className="mt-2 text-sm text-text-primary">
                  {Object.keys(monitorQuery.data?.allocationMix ?? {}).length
                    ? Object.entries(monitorQuery.data?.allocationMix ?? {})
                        .map(([assetId, weight]) => `${assetId}: ${Math.round(weight * 100)}%`)
                        .join(' · ')
                    : t('common.notAvailable')}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">{t('analysis.executionPage.yieldRedemption')}</p>
                <p className="mt-2 text-sm text-text-primary">
                  {formatUsd(monitorQuery.data?.accruedYield, locale)} {t('analysis.executionPage.accrued')} · {formatUsd(monitorQuery.data?.redemptionForecast, locale)} {t('analysis.executionPage.forecast')}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {(monitorQuery.data?.portfolioAlerts ?? []).slice(0, 4).map((alert) => (
                <div key={alert.id} className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={toneFor(alert.severity)}>{labelForExecutionValue(t, alert.severity)}</Badge>
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
        title={
          selectedReceipt
            ? t('analysis.executionPage.drawerTitleAsset', { asset: selectedReceipt.assetId })
            : t('analysis.executionPage.drawerTitle')
        }
        description={
          selectedReceipt
            ? t('analysis.executionPage.drawerDescription', {
                status: labelForExecutionValue(t, selectedReceipt.status),
                settlement: labelForExecutionValue(t, selectedReceipt.settlementStatus),
              })
            : ''
        }
        actions={
          selectedReceipt?.redirectUrl ? (
            <Button
              variant="secondary"
              onClick={() => window.open(selectedReceipt.redirectUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="size-4" />
              {t('analysis.executionPage.openRedirect')}
            </Button>
          ) : undefined
        }
      >
        {selectedReceipt ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">{t('analysis.executionPage.receipt')}</p>
                <p className="mt-2 break-all text-sm text-text-primary">{selectedReceipt.id}</p>
                <p className="mt-2 text-sm text-text-secondary">
                  {labelForExecutionValue(t, selectedReceipt.adapterKind)}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">{t('analysis.executionPage.txOrRequest')}</p>
                <p className="mt-2 break-all text-sm text-text-primary">
                  {selectedReceipt.txHash || selectedReceipt.externalRequestId || t('analysis.executionPage.awaitingSubmission')}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {t('analysis.executionPage.updatedAt', {
                    value: formatDateTime(selectedReceipt.updatedAt, locale),
                  })}
                </p>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">{t('analysis.executionPage.preparedPayload')}</p>
                <pre className="overflow-x-auto rounded-[20px] bg-app-bg-elevated p-4 text-xs leading-6 text-text-secondary">
                  {JSON.stringify(selectedReceipt.preparedPayload, null, 2)}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-text-primary">{t('analysis.executionPage.submitPayload')}</p>
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
