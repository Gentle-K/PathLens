import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  Loader2,
  Network,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'

function formatDateTime(value?: string) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPercent(value?: number) {
  if (value == null || Number.isNaN(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

function proofTone(value?: string) {
  if (
    value === 'ready' ||
    value === 'fresh' ||
    value === 'verified' ||
    value === 'published' ||
    value === 'completed' ||
    value === 'open'
  ) {
    return 'success' as const
  }
  if (
    value === 'requires_issuer' ||
    value === 'partial' ||
    value === 'pending' ||
    value === 'redirect_required' ||
    value === 'awaiting_publish' ||
    value === 'scheduled'
  ) {
    return 'gold' as const
  }
  if (
    value === 'demo_only' ||
    value === 'benchmark_only' ||
    value === 'view_only' ||
    value === 'unavailable' ||
    value === 'failed'
  ) {
    return 'warning' as const
  }
  return 'info' as const
}

function visibilityLabel(value?: string) {
  switch (value) {
    case 'demo_only':
      return 'Demo only'
    case 'benchmark_only':
      return 'Benchmark only'
    default:
      return 'Live'
  }
}

export function AssetProofPage() {
  const { assetId = '' } = useParams()
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const locale = useAppStore((state) => state.locale)
  const isZh = locale === 'zh'

  const bootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap', 'asset-proof', assetId],
    queryFn: () => adapter.rwa.getBootstrap(),
  })

  const chainConfig = bootstrapQuery.data?.chainConfig
  const wallet = useHashKeyWallet(chainConfig)
  const network =
    wallet.walletNetwork ??
    (chainConfig?.defaultExecutionNetwork === 'mainnet' ? 'mainnet' : 'testnet')

  const proofQuery = useQuery({
    queryKey: ['rwa', 'asset-proof', assetId, network],
    queryFn: () => adapter.rwa.getAssetProof(assetId, network),
    enabled: Boolean(assetId),
  })

  const historyQuery = useQuery({
    queryKey: ['rwa', 'asset-proof-history', assetId, network],
    queryFn: () => adapter.rwa.getAssetProofHistory(assetId, network),
    enabled: Boolean(assetId),
  })

  const readinessQuery = useQuery({
    queryKey: ['rwa', 'asset-readiness', assetId, wallet.walletAddress, network],
    queryFn: () =>
      adapter.rwa.getAssetReadiness({
        assetId,
        address: wallet.walletAddress || '',
        network,
      }),
    enabled: Boolean(assetId),
  })

  const asset =
    readinessQuery.data?.asset ??
    bootstrapQuery.data?.assetLibrary.find((item) => item.id === assetId)
  const proof = proofQuery.data
  const readiness = readinessQuery.data
  const timeline = historyQuery.data ?? []
  const previousProof = timeline[1]

  if (bootstrapQuery.isLoading || proofQuery.isLoading || readinessQuery.isLoading || historyQuery.isLoading) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {isZh ? '正在构建 proof timeline...' : 'Building proof timeline...'}
        </div>
      </Card>
    )
  }

  if (!asset || !proof || !readiness) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          {isZh ? '找不到该资产的 proof 信息。' : 'This asset proof is unavailable.'}
        </p>
        <Button variant="secondary" onClick={() => void navigate('/assets')}>
          <ArrowLeft className="size-4" />
          {isZh ? '返回资产中心' : 'Back to assets'}
        </Button>
      </Card>
    )
  }

  const isProofOnly =
    proof.visibilityRole === 'demo_only' ||
    proof.visibilityRole === 'benchmark_only' ||
    !proof.isExecutable ||
    readiness.executionReadiness === 'view_only'

  const buyBlockers = [
    ...readiness.complianceBlockers,
    ...proof.unavailableReasons,
    ...(isProofOnly ? ['This asset is isolated from the live submit path.'] : []),
  ].filter(Boolean)

  const nextSteps = readiness.decision.nextActions.length
    ? readiness.decision.nextActions
    : proof.isExecutable
      ? proof.executionReadiness === 'ready'
        ? ['Review checklist, inspect calldata, then submit the direct contract route.']
        : ['Open the issuer route and complete compliance / docs before settlement.']
      : ['Use the proof timeline and anchor view for verification, not purchase.']

  const disclosureDiffs = previousProof
    ? [
        proof.snapshotHash !== previousProof.snapshotHash
          ? `Snapshot hash changed from ${previousProof.snapshotHash.slice(0, 14)}... to ${proof.snapshotHash.slice(0, 14)}...`
          : '',
        proof.oracleFreshness !== previousProof.oracleFreshness
          ? `Oracle freshness moved from "${previousProof.oracleFreshness || 'n/a'}" to "${proof.oracleFreshness || 'n/a'}".`
          : '',
        proof.kycPolicySummary !== previousProof.kycPolicySummary
          ? `KYC policy summary changed from "${previousProof.kycPolicySummary || 'n/a'}" to "${proof.kycPolicySummary || 'n/a'}".`
          : '',
      ].filter(Boolean)
    : ['This is the first proof snapshot in the local timeline.']

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isZh ? '真实性中心' : 'Authenticity center'}
        title={asset.name}
        description={
          isZh
            ? '最新 proof、历史版本、链上锚点、可买性和下一步动作都在这一个页面。'
            : 'Latest proof, history, onchain anchor, executability, and the next step stay in one place.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate('/assets')}>
              <ArrowLeft className="size-4" />
              {isZh ? '返回资产中心' : 'Back to assets'}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void navigate(wallet.walletAddress ? `/portfolio/${wallet.walletAddress}` : '/portfolio')
              }
            >
              <Wallet className="size-4" />
              {isZh ? '组合监控' : 'Portfolio'}
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[32px] border border-border-subtle bg-[linear-gradient(135deg,rgba(12,23,44,0.96),rgba(18,39,70,0.92)_48%,rgba(8,23,39,0.96))]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:px-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{asset.symbol}</Badge>
              <Badge tone={proofTone(proof.truthLevel)}>{proof.truthLevel}</Badge>
              <Badge tone={proofTone(proof.liveReadiness)}>{proof.liveReadiness}</Badge>
              <Badge tone={proofTone(proof.executionReadiness)}>
                {proof.executionAdapterKind}
              </Badge>
              <Badge tone={proofTone(proof.visibilityRole)}>{visibilityLabel(proof.visibilityRole)}</Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-text-primary md:text-4xl">
                {proof.isExecutable
                  ? isZh
                    ? '最新 proof 已经把真实性与执行路径钉在一起。'
                    : 'The latest proof now ties authenticity to an executable route.'
                  : isZh
                    ? '这个资产可验证，但当前被强制隔离在 live submit 之外。'
                    : 'This asset is verifiable, but it is intentionally isolated from live submission.'}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-text-secondary md:text-[15px]">
                {asset.description}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Proof freshness' : 'Proof freshness'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{proof.proofFreshness.label}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{proof.proofFreshness.reason}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Anchor status' : 'Anchor status'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{proof.anchorStatus.status}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {proof.anchorStatus.proofKey ? proof.anchorStatus.proofKey.slice(0, 18) : 'Awaiting onchain anchor'}
                </p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Oracle freshness' : 'Oracle freshness'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{proof.oracleFreshness || 'N/A'}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{proof.kycPolicySummary || 'No KYC summary'}</p>
              </div>
              <div className="rounded-[22px] bg-[rgba(9,18,34,0.44)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Source confidence' : 'Source confidence'}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">{formatPercent(proof.sourceConfidence)}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {timeline.length} {isZh ? '个历史版本可追溯' : 'historical snapshots tracked'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border-subtle bg-[rgba(9,18,34,0.72)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? '为什么现在能买 / 不能买' : 'Why it is buyable or blocked now'}
              </p>
            </div>
            <p className="mt-3 text-sm leading-6 text-text-secondary">{readiness.routeSummary}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={proofTone(readiness.decision.status)}>{readiness.decision.status}</Badge>
              <Badge tone={proofTone(proof.executionReadiness)}>{proof.executionReadiness}</Badge>
              <Badge tone={proofTone(proof.anchorStatus.status)}>{proof.anchorStatus.status}</Badge>
            </div>
            <div className="mt-5 space-y-4 text-sm text-text-secondary">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Current blockers' : 'Current blockers'}
                </p>
                <div className="mt-3 space-y-2">
                  {buyBlockers.length ? (
                    buyBlockers.map((item) => (
                      <div key={item} className="rounded-[18px] border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-3 py-2.5">
                        {item}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-[rgba(34,197,94,0.18)] bg-[rgba(34,197,94,0.08)] px-3 py-2.5">
                      {isZh
                        ? '没有额外 blocker。可以进入执行准备。'
                        : 'No additional blocker is active. The asset can move into execution preparation.'}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Next steps' : 'Next steps'}
                </p>
                <div className="mt-3 space-y-2">
                  {nextSteps.map((item) => (
                    <div key={item} className="rounded-[18px] bg-app-bg-elevated px-3 py-2.5">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  onClick={() =>
                    void navigate(`/new-analysis?asset=${asset.id}`)
                  }
                  disabled={isProofOnly}
                >
                  <ArrowRight className="size-4" />
                  {isZh ? '去执行' : 'Go to execution'}
                </Button>
                {proof.primaryActionUrl ? (
                  <Button
                    variant="secondary"
                    onClick={() => window.open(proof.primaryActionUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="size-4" />
                    {isZh ? '打开来源' : 'Open source'}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="space-y-5">
          <Card className="space-y-5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-text-primary">
                  {isZh ? 'Proof timeline' : 'Proof timeline'}
                </p>
                <p className="text-sm text-text-secondary">
                  {isZh ? '持续生成、可追溯、可对照链上锚点。' : 'Continuously generated, traceable, and cross-checkable with the chain anchor.'}
                </p>
              </div>
              <Badge tone="info">{timeline.length || 1} versions</Badge>
            </div>
            <div className="space-y-3">
              {(timeline.length ? timeline : [
                {
                  snapshotId: proof.snapshotId ?? `${proof.assetId}-latest`,
                  assetId: proof.assetId,
                  network: proof.network,
                  snapshotHash: proof.snapshotHash,
                  snapshotUri: proof.snapshotUri,
                  proofType: proof.proofType,
                  effectiveAt: proof.effectiveAt,
                  publishedAt: proof.publishedAt,
                  timelineVersion: proof.timelineVersion,
                  attester: proof.attester,
                  publishStatus: proof.publishStatus,
                  onchainAnchorStatus: proof.anchorStatus,
                  oracleFreshness: proof.oracleFreshness,
                  kycPolicySummary: proof.kycPolicySummary,
                  sourceConfidence: proof.sourceConfidence,
                  unavailableReasons: proof.unavailableReasons,
                },
              ]).map((item, index) => (
                <div key={item.snapshotId} className="grid gap-3 rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[rgba(34,211,238,0.12)] text-info">
                    <Clock3 className="size-4" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-text-primary">
                        v{item.timelineVersion} {index === 0 ? (isZh ? '当前版本' : 'Current') : ''}
                      </p>
                      <Badge tone={proofTone(item.publishStatus)}>{item.publishStatus}</Badge>
                      <Badge tone={proofTone(item.onchainAnchorStatus.status)}>{item.onchainAnchorStatus.status}</Badge>
                    </div>
                    <p className="break-all text-sm text-text-secondary">{item.snapshotHash}</p>
                    <div className="grid gap-2 text-sm text-text-secondary md:grid-cols-2">
                      <p>{isZh ? '生效时间' : 'Effective at'}: {formatDateTime(item.effectiveAt)}</p>
                      <p>{isZh ? '链上记录' : 'Recorded'}: {formatDateTime(item.publishedAt)}</p>
                      <p>{isZh ? 'Oracle freshness' : 'Oracle freshness'}: {item.oracleFreshness || 'N/A'}</p>
                      <p>{isZh ? 'KYC policy' : 'KYC policy'}: {item.kycPolicySummary || 'N/A'}</p>
                    </div>
                    {item.unavailableReasons.length ? (
                      <div className="space-y-2 pt-1">
                        {item.unavailableReasons.map((reason) => (
                          <div key={reason} className="rounded-[16px] bg-[rgba(244,63,94,0.08)] px-3 py-2 text-sm text-text-secondary">
                            {reason}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {item.onchainAnchorStatus.explorerUrl ? (
                    <a
                      href={item.onchainAnchorStatus.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-accent-cyan"
                    >
                      <ExternalLink className="size-4" />
                      {isZh ? '链上锚点' : 'Onchain anchor'}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Disclosure diffs' : 'Disclosure diffs'}
              </p>
              <p className="text-sm text-text-secondary">
                {isZh ? '最新 snapshot 和上一版的可解释变化。' : 'The explainable delta between the latest snapshot and the previous version.'}
              </p>
            </div>
            <div className="space-y-2">
              {disclosureDiffs.map((item) => (
                <div key={item} className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Network className="size-5 text-accent-cyan" />
              <p className="text-lg font-semibold text-text-primary">
                {isZh ? 'Latest anchor' : 'Latest anchor'}
              </p>
            </div>
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Registry / status' : 'Registry / status'}
                </p>
                <p className="mt-2 break-all text-text-primary">
                  {proof.anchorStatus.registryAddress || proof.registryAddress || 'N/A'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={proofTone(proof.anchorStatus.status)}>{proof.anchorStatus.status}</Badge>
                  <Badge tone={proofTone(proof.publishStatus)}>{proof.publishStatus}</Badge>
                </div>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Proof key' : 'Proof key'}
                </p>
                <p className="mt-2 break-all text-text-primary">
                  {proof.anchorStatus.proofKey || proof.onchainProofKey || 'Awaiting publish'}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
                  {isZh ? 'Attester' : 'Attester'}
                </p>
                <p className="mt-2 break-all text-text-primary">
                  {proof.anchorStatus.attester || proof.attester}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{proof.anchorStatus.note || 'No extra note.'}</p>
              </div>
              {proof.anchorStatus.explorerUrl ? (
                <a
                  href={proof.anchorStatus.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-accent-cyan"
                >
                  <ExternalLink className="size-4" />
                  {isZh ? '打开链上记录' : 'Open chain record'}
                </a>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <p className="text-lg font-semibold text-text-primary">
              {isZh ? 'Source refs' : 'Source refs'}
            </p>
            <div className="space-y-3">
              {proof.proofSourceRefs.map((item) => (
                <div key={item.refId} className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.isPrimary ? 'primary' : 'neutral'}>
                      {item.isPrimary ? 'Primary' : item.sourceKind || 'source'}
                    </Badge>
                    {item.sourceTier ? <Badge tone="info">{item.sourceTier}</Badge> : null}
                    {item.confidence != null ? (
                      <Badge tone="neutral">{formatPercent(item.confidence)}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{item.summary || 'No summary.'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                    <span>{item.sourceName}</span>
                    <span>{item.status || 'available'}</span>
                    <span>{item.freshnessDate || 'undated'}</span>
                  </div>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm text-accent-cyan"
                  >
                    <ExternalLink className="size-4" />
                    {isZh ? '打开来源' : 'Open source'}
                  </a>
                </div>
              ))}
            </div>
          </Card>

          {buyBlockers.length ? (
            <Card className="space-y-4 border-[rgba(245,158,11,0.18)] p-5">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="size-5" />
                <p className="text-lg font-semibold text-text-primary">
                  {isZh ? '为什么当前不可买' : 'Why it is currently not buyable'}
                </p>
              </div>
              <div className="space-y-2">
                {buyBlockers.map((item) => (
                  <div key={item} className="rounded-[18px] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  )
}
