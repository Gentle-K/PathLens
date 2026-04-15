import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Building2,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
  PageContainer,
  PageHeader,
  PageSection,
} from '@/components/layout/page-header'
import {
  MetricCard,
  SectionCard,
  SessionCard,
} from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { toIntlLocale } from '@/lib/i18n/locale'
import { useAppStore } from '@/lib/store/app-store'
import { shortAddress } from '@/lib/web3/hashkey'
import { useHashKeyWallet } from '@/lib/web3/use-hashkey-wallet'
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from '@/lib/utils/safe-storage'
import { cn } from '@/lib/utils/cn'
import { fetchAnalysisCatalog } from '@/features/analysis/lib/catalog'
import {
  continuePath,
  extractExecutiveSummary,
  sessionConfidence,
} from '@/features/analysis/lib/view-models'
import type { AnalysisMode, CreateSessionPayload, RwaIntakeContext } from '@/types'

const DRAFT_KEY = 'ga-new-analysis-draft'

type ModeSelectionDraft = {
  mode: AnalysisMode
  problem: string
  safeAddress: string
  budgetRange: string
  timeHorizon: string
  riskPreference: 'conservative' | 'balanced' | 'aggressive'
  settlementCurrency: string
  targetChain: 'hashkey' | 'evm' | 'general'
  accessConstraints: string
  mustHaveGoals: string
  mustAvoidOutcomes: string
}

const DEFAULT_DRAFT: ModeSelectionDraft = {
  mode: 'single-asset-allocation',
  problem: '',
  safeAddress: '',
  budgetRange: '',
  timeHorizon: '',
  riskPreference: 'balanced',
  settlementCurrency: 'USD',
  targetChain: 'hashkey',
  accessConstraints: '',
  mustHaveGoals: '',
  mustAvoidOutcomes: '',
}

function parseBudgetToAmount(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)/)
  if (!match) {
    return 10000
  }
  const base = Number(match[1])
  return value.toLowerCase().includes('k') ? base * 1000 : base
}

function modeCardClass(active: boolean) {
  return cn(
    'interactive-lift rounded-[24px] border p-5 text-left',
    active
      ? 'border-primary bg-primary-soft shadow-[0_12px_32px_rgba(49,95,221,0.18)]'
      : 'border-border-subtle bg-panel hover:border-border-strong hover:bg-panel-strong',
  )
}

function loadStoredDraft(): ModeSelectionDraft {
  const raw = getLocalStorageItem(DRAFT_KEY)
  if (!raw) {
    return { ...DEFAULT_DRAFT }
  }

  try {
    return {
      ...DEFAULT_DRAFT,
      ...(JSON.parse(raw) as Partial<ModeSelectionDraft>),
    }
  } catch {
    removeLocalStorageItem(DRAFT_KEY)
    return { ...DEFAULT_DRAFT }
  }
}

export function ModeSelectionPage() {
  const { t } = useTranslation()
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const locale = useAppStore((state) => state.locale)
  const bootstrapQuery = useQuery({
    queryKey: ['analysis', 'bootstrap', 'wallet-first', locale],
    queryFn: () => adapter.rwa.getBootstrap(),
  })
  const wallet = useHashKeyWallet(bootstrapQuery.data?.chainConfig)

  const [draft, setDraft] = useState<ModeSelectionDraft>(() => loadStoredDraft())
  const [lastSavedAt, setLastSavedAt] = useState('')
  const {
    mode,
    problem,
    safeAddress,
    budgetRange,
    timeHorizon,
    riskPreference,
    settlementCurrency,
    targetChain,
    accessConstraints,
    mustHaveGoals,
    mustAvoidOutcomes,
  } = draft

  const updateDraft = (patch: Partial<ModeSelectionDraft>) => {
    const savedAt = new Date().toISOString()
    setDraft((current) => {
      const next = { ...current, ...patch }
      setLocalStorageItem(DRAFT_KEY, JSON.stringify(next))
      return next
    })
    setLastSavedAt(savedAt)
  }

  const effectiveAddress = wallet.walletAddress || safeAddress.trim()
  const catalogQuery = useQuery({
    queryKey: ['analysis', 'catalog', 'new-analysis', locale],
    queryFn: () => fetchAnalysisCatalog(adapter),
  })
  const walletSummaryQuery = useQuery({
    queryKey: ['analysis', 'wallet-summary', effectiveAddress, locale],
    queryFn: () => adapter.rwa.getWalletSummary(effectiveAddress),
    enabled: Boolean(effectiveAddress),
  })
  const walletPositionsQuery = useQuery({
    queryKey: ['analysis', 'wallet-positions', effectiveAddress, locale],
    queryFn: () => adapter.rwa.getWalletPositions(effectiveAddress),
    enabled: Boolean(effectiveAddress),
  })
  const eligibleCatalogQuery = useQuery({
    queryKey: ['analysis', 'eligible-catalog', effectiveAddress, locale],
    queryFn: () =>
      adapter.rwa.getEligibleCatalog({
        address: effectiveAddress,
        network:
          walletSummaryQuery.data?.network === 'mainnet' ? 'mainnet' : 'testnet',
      }),
    enabled: Boolean(effectiveAddress),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateSessionPayload) => adapter.analysis.create(payload),
    onSuccess: async (session) => {
      removeLocalStorageItem(DRAFT_KEY)
      await navigate(`/sessions/${session.id}/clarify`)
    },
  })

  const draftContext = useMemo<RwaIntakeContext>(
    () => ({
      budgetRange,
      timeHorizonLabel: timeHorizon,
      riskPreferenceLabel: riskPreference,
      mustHaveGoals: mustHaveGoals
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean),
      mustAvoidOutcomes: mustAvoidOutcomes
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean),
      draftPrompt: problem,
      investmentAmount: parseBudgetToAmount(budgetRange || '$10k'),
      baseCurrency: settlementCurrency,
      preferredAssetIds: [],
      holdingPeriodDays:
        timeHorizon.includes('1-3')
          ? 90
          : timeHorizon.includes('3-6')
            ? 180
            : timeHorizon.includes('12')
              ? 365
              : 270,
      riskTolerance: riskPreference,
      liquidityNeed: 't_plus_3',
      minimumKycLevel: accessConstraints.toLowerCase().includes('kyc') ? 1 : 0,
      walletAddress: wallet.walletAddress || '',
      safeAddress: safeAddress.trim(),
      walletNetwork:
        walletSummaryQuery.data?.network === 'mainnet' ? 'mainnet' : 'testnet',
      kycLevel: walletSummaryQuery.data?.kyc.level,
      kycStatus: walletSummaryQuery.data?.kyc.status,
      sourceChain: walletSummaryQuery.data?.network ?? 'hashkey',
      sourceAsset: walletSummaryQuery.data?.balances[0]?.symbol ?? settlementCurrency,
      ticketSize: parseBudgetToAmount(budgetRange || '$10k'),
      wantsOnchainAttestation: false,
      additionalConstraints: `${mustHaveGoals}\n${mustAvoidOutcomes}\nTarget chain / asset universe: ${targetChain}\nAccess constraints: ${accessConstraints}`,
    }),
    [
      accessConstraints,
      budgetRange,
      mustAvoidOutcomes,
      mustHaveGoals,
      problem,
      riskPreference,
      safeAddress,
      settlementCurrency,
      targetChain,
      timeHorizon,
      wallet.walletAddress,
      walletSummaryQuery.data?.balances,
      walletSummaryQuery.data?.kyc.level,
      walletSummaryQuery.data?.kyc.status,
      walletSummaryQuery.data?.network,
    ],
  )

  const autosaveLabel = lastSavedAt
    ? t('analysis.newAnalysis.autosaved', {
        value: new Intl.DateTimeFormat(toIntlLocale(locale), {
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(lastSavedAt)),
      })
    : t('analysis.newAnalysis.draftSaved')

  const examplePrompts = t(
    mode === 'single-asset-allocation'
      ? 'analysis.newAnalysis.examples.single'
      : 'analysis.newAnalysis.examples.compare',
    { returnObjects: true },
  ) as string[]

  const recentSessions = catalogQuery.data?.sessions.slice(0, 3) ?? []
  const exampleReports = Object.values(catalogQuery.data?.reportsBySession ?? {}).slice(0, 2)

  const startAnalysis = () =>
    void createMutation.mutateAsync({
      mode,
      locale,
      problemStatement: problem.trim(),
      intakeContext: draftContext,
    })

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('analysis.newAnalysis.eyebrow')}
        title={t('analysis.newAnalysis.title')}
        description={t('analysis.newAnalysis.description')}
      />

      <PageSection className="space-y-6">
        <SectionCard
          title={t('analysis.newAnalysis.walletQuickStartTitle')}
          description={t('analysis.newAnalysis.walletQuickStartDescription')}
        >
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="space-y-4 rounded-[24px] border border-border-subtle bg-app-bg-elevated p-4">
              <div className="flex items-start gap-3">
                <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Wallet className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t('analysis.newAnalysis.walletCardTitle')}</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    {t('analysis.newAnalysis.walletCardDescription')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 max-sm:flex-col">
                <Button
                  className="max-sm:w-full"
                  onClick={() => void wallet.connectWallet()}
                  disabled={wallet.isWalletBusy || bootstrapQuery.isLoading}
                >
                  {wallet.isConnected ? shortAddress(wallet.walletAddress) : t('actions.connectWallet')}
                </Button>
                {wallet.walletAddress ? <Badge tone="success">{shortAddress(wallet.walletAddress)}</Badge> : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-text-primary">{t('analysis.newAnalysis.safeLabel')}</label>
                <div className="flex gap-3 max-sm:flex-col">
                  <Input
                    aria-label={t('analysis.newAnalysis.safeLabel')}
                    value={safeAddress}
                    placeholder={t('analysis.newAnalysis.safePlaceholder')}
                    onChange={(event) => updateDraft({ safeAddress: event.target.value })}
                  />
                  <Button className="max-sm:w-full" variant="secondary">
                    <Building2 className="size-4" />
                    {t('actions.useSafe')}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="space-y-4 rounded-[24px] border border-border-subtle bg-app-bg-elevated p-4">
              <p className="text-sm font-semibold text-text-primary">{t('analysis.newAnalysis.snapshotTitle')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  title={t('analysis.newAnalysis.kycSnapshot')}
                  value={
                    walletSummaryQuery.data
                      ? `L${walletSummaryQuery.data.kyc.level} / ${walletSummaryQuery.data.kyc.status}`
                      : t('analysis.newAnalysis.notLoaded')
                  }
                  detail={effectiveAddress ? shortAddress(effectiveAddress) : t('analysis.newAnalysis.notLoaded')}
                />
                <MetricCard
                  title={t('analysis.newAnalysis.detectedPositions')}
                  value={String(walletPositionsQuery.data?.length ?? 0)}
                  detail={t('analysis.newAnalysis.detectedPositionsDescription')}
                />
              </div>
              <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-3">
                <p className="text-sm font-semibold text-text-primary">{t('analysis.newAnalysis.eligibleCatalog')}</p>
                <p className="mt-2 text-sm text-text-secondary">
                  {t('analysis.newAnalysis.eligibleSummary', {
                    eligible: eligibleCatalogQuery.data?.eligible.length ?? 0,
                    conditional: eligibleCatalogQuery.data?.conditional.length ?? 0,
                    blocked: eligibleCatalogQuery.data?.blocked.length ?? 0,
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(eligibleCatalogQuery.data?.eligible ?? []).slice(0, 4).map(({ asset }) => (
                    <Badge key={asset.id} tone="success">
                      {asset.symbol}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </SectionCard>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="space-y-6">
            <SectionCard
              title={t('analysis.newAnalysis.chooseModeTitle')}
              description={t('analysis.newAnalysis.chooseModeDescription')}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <button
                  type="button"
                  className={modeCardClass(mode === 'single-asset-allocation')}
                  onClick={() => updateDraft({ mode: 'single-asset-allocation' })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-text-primary">
                        {t('analysis.newAnalysis.singleTitle')}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {t('analysis.newAnalysis.singleDescription')}
                      </p>
                    </div>
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Sparkles className="size-4" />
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className={modeCardClass(mode === 'strategy-compare')}
                  onClick={() => updateDraft({ mode: 'strategy-compare' })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-text-primary">
                        {t('analysis.newAnalysis.compareTitle')}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {t('analysis.newAnalysis.compareDescription')}
                      </p>
                    </div>
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title={t('analysis.newAnalysis.briefTitle')}
              description={t('analysis.newAnalysis.briefDescription')}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    {t('analysis.newAnalysis.briefLabel')}
                  </label>
                  <Textarea
                    aria-label={t('analysis.newAnalysis.briefLabel')}
                    value={problem}
                    placeholder={t('analysis.newAnalysis.briefPlaceholder')}
                    onChange={(event) => updateDraft({ problem: event.target.value })}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.budget')}
                    </label>
                    <Input
                      aria-label={t('analysis.newAnalysis.fields.budget')}
                      value={budgetRange}
                      onChange={(event) => updateDraft({ budgetRange: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.horizon')}
                    </label>
                    <Input
                      aria-label={t('analysis.newAnalysis.fields.horizon')}
                      value={timeHorizon}
                      onChange={(event) => updateDraft({ timeHorizon: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.risk')}
                    </label>
                    <Select
                      aria-label={t('analysis.newAnalysis.fields.risk')}
                      value={riskPreference}
                      onChange={(event) =>
                        updateDraft({
                          riskPreference: event.target.value as ModeSelectionDraft['riskPreference'],
                        })
                      }
                    >
                      <option value="conservative">{t('analysis.newAnalysis.options.risk.conservative')}</option>
                      <option value="balanced">{t('analysis.newAnalysis.options.risk.balanced')}</option>
                      <option value="aggressive">{t('analysis.newAnalysis.options.risk.aggressive')}</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.settlement')}
                    </label>
                    <Select
                      aria-label={t('analysis.newAnalysis.fields.settlement')}
                      value={settlementCurrency}
                      onChange={(event) => updateDraft({ settlementCurrency: event.target.value })}
                    >
                      <option value="USD">USD</option>
                      <option value="USDC">USDC</option>
                      <option value="USDT">USDT</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.targetChain')}
                    </label>
                    <Select
                      aria-label={t('analysis.newAnalysis.fields.targetChain')}
                      value={targetChain}
                      onChange={(event) =>
                        updateDraft({
                          targetChain: event.target.value as ModeSelectionDraft['targetChain'],
                        })
                      }
                    >
                      <option value="hashkey">{t('analysis.newAnalysis.options.network.hashkey')}</option>
                      <option value="evm">{t('analysis.newAnalysis.options.network.evm')}</option>
                      <option value="general">{t('analysis.newAnalysis.options.network.general')}</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.access')}
                    </label>
                    <Input
                      aria-label={t('analysis.newAnalysis.fields.access')}
                      value={accessConstraints}
                      onChange={(event) => updateDraft({ accessConstraints: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.mustHave')}
                    </label>
                    <Textarea
                      aria-label={t('analysis.newAnalysis.fields.mustHave')}
                      value={mustHaveGoals}
                      onChange={(event) => updateDraft({ mustHaveGoals: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 xl:col-span-2">
                    <label className="text-sm font-semibold text-text-primary">
                      {t('analysis.newAnalysis.fields.mustAvoid')}
                    </label>
                    <Textarea
                      aria-label={t('analysis.newAnalysis.fields.mustAvoid')}
                      value={mustAvoidOutcomes}
                      onChange={(event) => updateDraft({ mustAvoidOutcomes: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-3 max-md:flex-col max-md:items-stretch">
                  <p className="text-sm text-text-secondary">{autosaveLabel}</p>
                  <div className="flex flex-wrap gap-2 max-md:flex-col">
                    <Button className="max-md:w-full" variant="secondary" onClick={() => void navigate('/assets')}>
                      {t('actions.openAssetHub')}
                    </Button>
                    <Button
                      className="max-md:w-full"
                      onClick={startAnalysis}
                      disabled={createMutation.isPending || problem.trim().length < 12}
                    >
                      {createMutation.isPending
                        ? t('analysis.newAnalysis.creatingSession')
                        : t('analysis.newAnalysis.createSession')}
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              title={t('analysis.newAnalysis.examplesTitle')}
              description={t('analysis.newAnalysis.supportDescription')}
            >
              <div className="space-y-3">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="w-full rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-4 text-left text-sm leading-6 text-text-secondary hover:border-border-strong hover:text-text-primary"
                    onClick={() => updateDraft({ problem: prompt })}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </SectionCard>

            {recentSessions.length ? (
              <SectionCard title={t('nav.sessions')} description={t('analysis.newAnalysis.supportDescription')}>
                <div className="space-y-3">
                  {recentSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      confidence={sessionConfidence(session)}
                      onOpen={() => void navigate(continuePath(session))}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {exampleReports.length ? (
              <SectionCard title={t('nav.reports')} description={t('analysis.newAnalysis.supportDescription')}>
                <div className="space-y-3">
                  {exampleReports.map((report) => (
                    <Card key={report.id} className="space-y-3 p-4">
                      <p className="text-sm font-semibold text-text-primary">{report.summaryTitle}</p>
                      <p className="text-sm leading-6 text-text-secondary">
                        {extractExecutiveSummary(report.markdown)}
                      </p>
                    </Card>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        </div>
      </PageSection>
    </PageContainer>
  )
}
