import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Building2,
  Clock3,
  FileText,
  LoaderCircle,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import {
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PreviewNote,
  SectionCard,
  SessionCard,
  StickyActionBar,
} from '@/components/product/decision-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
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
  modeLabel,
  modeSummary,
  sessionConfidence,
} from '@/features/analysis/lib/view-models'
import type { AnalysisMode, CreateSessionPayload, RwaIntakeContext } from '@/types'

const DRAFT_KEY = 'ga-new-analysis-draft'

const examplePrompts: Record<string, string[]> = {
  'single-asset-allocation': [
    'Allocate idle USDT from my wallet into one eligible HashKey Chain RWA sleeve.',
    'Should I move treasury cash from stablecoins into a tokenized MMF on HashKey Chain?',
    'Assess whether one silver RWA fits my current wallet and KYC profile.',
  ],
  'strategy-compare': [
    'Compare USDC, tokenized MMF, and silver RWA for a 30-day HashKey Chain allocation.',
    'Which eligible RWA route best fits my wallet, liquidity window, and target yield?',
    'Compare several HashKey Chain RWA sleeves for a balanced allocation and execution plan.',
  ],
}

function modeCardClass(active: boolean) {
  return cn(
    'interactive-lift rounded-[26px] border p-5 text-left',
    active
      ? 'border-[rgba(79,124,255,0.3)] bg-primary-soft shadow-[0_12px_30px_rgba(44,87,190,0.18)]'
      : 'border-border-subtle bg-panel hover:border-border-strong hover:bg-panel-strong',
  )
}

function parseBudgetToAmount(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)/)
  if (!match) {
    return 10000
  }
  const base = Number(match[1])
  return value.toLowerCase().includes('k') ? base * 1000 : base
}

export function ModeSelectionPage() {
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const locale = useAppStore((state) => state.locale)
  const bootstrapQuery = useQuery({
    queryKey: ['analysis', 'bootstrap', 'wallet-first'],
    queryFn: () => adapter.rwa.getBootstrap(),
  })
  const wallet = useHashKeyWallet(bootstrapQuery.data?.chainConfig)
  const [mode, setMode] = useState<AnalysisMode>('single-asset-allocation')
  const [problem, setProblem] = useState('')
  const [safeAddress, setSafeAddress] = useState('')
  const [showConstraints, setShowConstraints] = useState(true)
  const [budgetRange, setBudgetRange] = useState('$8k - $15k')
  const [timeHorizon, setTimeHorizon] = useState('6-12 months')
  const [riskPreference, setRiskPreference] = useState('Balanced')
  const [settlementCurrency, setSettlementCurrency] = useState('USD')
  const [targetChain, setTargetChain] = useState('Any supported network')
  const [accessConstraints, setAccessConstraints] = useState('No additional access constraints')
  const [mustHaveGoals, setMustHaveGoals] = useState(
    'Protect cash runway; keep optionality; make trade-offs explicit',
  )
  const [mustAvoidOutcomes, setMustAvoidOutcomes] = useState(
    'Irreversible commitment without evidence',
  )
  const [lastSavedAt, setLastSavedAt] = useState<string>('')

  useEffect(() => {
    const raw = getLocalStorageItem(DRAFT_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as {
        accessConstraints: string
        budgetRange: string
        mode: AnalysisMode
        mustAvoidOutcomes: string
        mustHaveGoals: string
        problem: string
        riskPreference: string
        settlementCurrency: string
        targetChain: string
        timeHorizon: string
      }
      setAccessConstraints(parsed.accessConstraints ?? 'No additional access constraints')
      setMode(parsed.mode)
      setProblem(parsed.problem)
      setBudgetRange(parsed.budgetRange)
      setTimeHorizon(parsed.timeHorizon)
      setRiskPreference(parsed.riskPreference)
      setSettlementCurrency(parsed.settlementCurrency ?? 'USD')
      setTargetChain(parsed.targetChain ?? 'Any supported network')
      setMustHaveGoals(parsed.mustHaveGoals)
      setMustAvoidOutcomes(parsed.mustAvoidOutcomes)
    } catch {
      removeLocalStorageItem(DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    setLocalStorageItem(
      DRAFT_KEY,
      JSON.stringify({
        accessConstraints,
        mode,
        problem,
        budgetRange,
        timeHorizon,
        riskPreference,
        settlementCurrency,
        targetChain,
        mustHaveGoals,
        mustAvoidOutcomes,
      }),
    )
    setLastSavedAt(new Date().toISOString())
  }, [
    accessConstraints,
    budgetRange,
    mode,
    mustAvoidOutcomes,
    mustHaveGoals,
    problem,
    riskPreference,
    settlementCurrency,
    targetChain,
    timeHorizon,
  ])

  const catalogQuery = useQuery({
    queryKey: ['analysis', 'catalog', 'new-analysis'],
    queryFn: () => fetchAnalysisCatalog(adapter),
  })
  const effectiveAddress = wallet.walletAddress || safeAddress.trim()
  const walletSummaryQuery = useQuery({
    queryKey: ['analysis', 'wallet-summary', effectiveAddress],
    queryFn: () => adapter.rwa.getWalletSummary(effectiveAddress),
    enabled: Boolean(effectiveAddress),
  })
  const walletPositionsQuery = useQuery({
    queryKey: ['analysis', 'wallet-positions', effectiveAddress],
    queryFn: () => adapter.rwa.getWalletPositions(effectiveAddress),
    enabled: Boolean(effectiveAddress),
  })
  const eligibleCatalogQuery = useQuery({
    queryKey: ['analysis', 'eligible-catalog', effectiveAddress],
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
      setLocalStorageItem(
        DRAFT_KEY,
        JSON.stringify({
          accessConstraints,
          mode,
          problem,
          budgetRange,
          timeHorizon,
          riskPreference,
          settlementCurrency,
          targetChain,
          mustHaveGoals,
          mustAvoidOutcomes,
        }),
      )
      await navigate(`/sessions/${session.id}/clarify`)
    },
  })

  const isValidProblem = problem.trim().length >= 12

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
      investmentAmount: parseBudgetToAmount(budgetRange),
      baseCurrency: settlementCurrency,
      preferredAssetIds: [],
      holdingPeriodDays:
        timeHorizon === '1-3 months'
          ? 90
          : timeHorizon === '3-6 months'
            ? 180
            : timeHorizon === '12+ months'
              ? 365
              : 270,
      riskTolerance:
        riskPreference === 'Conservative'
          ? 'conservative'
          : riskPreference === 'Aggressive'
            ? 'aggressive'
            : 'balanced',
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
      ticketSize: parseBudgetToAmount(budgetRange),
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

  const recentSessions = catalogQuery.data?.sessions.slice(0, 3) ?? []
  const exampleReports = Object.values(catalogQuery.data?.reportsBySession ?? {}).slice(0, 2)
  const autosaveLabel = lastSavedAt ? `Autosaved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Draft saved locally'

  const startAnalysis = () =>
    void createMutation.mutateAsync({
      mode,
      locale,
      problemStatement: problem.trim(),
      intakeContext: draftContext,
    })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New Analysis"
        title="Start a new analysis"
        description="Describe one important decision. The system will break it into costs, risks, assumptions, evidence, calculations, and recommendations."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <SectionCard
            title="Wallet quick-start"
            description="Use a connected wallet or pasted Safe address as the primary entry for KYC / SBT reads, positions, and eligible RWA discovery."
          >
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-[24px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-start gap-3">
                  <div className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Wallet className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Connect wallet</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      Read live wallet KYC, balances, and positions before creating the session.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => void wallet.connectWallet()}
                    disabled={wallet.isWalletBusy || bootstrapQuery.isLoading}
                  >
                    {wallet.isConnected ? `Connected ${wallet.walletLabel}` : 'Connect wallet'}
                  </Button>
                  {wallet.walletAddress ? (
                    <Badge tone="success">{shortAddress(wallet.walletAddress)}</Badge>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">Or paste Safe address</label>
                  <div className="flex gap-3">
                    <Input
                      value={safeAddress}
                      placeholder="0x..."
                      onChange={(event) => setSafeAddress(event.target.value)}
                    />
                    <Button variant="secondary">
                      <Building2 className="size-4" />
                      Use Safe
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-[24px] border border-border-subtle bg-panel p-4">
                <p className="text-sm font-semibold text-text-primary">Wallet and eligibility snapshot</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    title="KYC / SBT"
                    value={
                      walletSummaryQuery.data
                        ? `L${walletSummaryQuery.data.kyc.level} / ${walletSummaryQuery.data.kyc.status}`
                        : 'Not loaded'
                    }
                    detail="Read from the backend wallet summary endpoint."
                  />
                  <MetricCard
                    title="Detected positions"
                    value={String(walletPositionsQuery.data?.length ?? 0)}
                    detail="Current wallet + recognized RWA positions."
                  />
                </div>
                <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-3 text-sm text-text-secondary">
                  <p className="font-semibold text-text-primary">Eligible catalog</p>
                  <p className="mt-2">
                    Eligible {eligibleCatalogQuery.data?.eligible.length ?? 0} / Conditional {eligibleCatalogQuery.data?.conditional.length ?? 0} / Blocked {eligibleCatalogQuery.data?.blocked.length ?? 0}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(eligibleCatalogQuery.data?.eligible ?? []).slice(0, 4).map(({ asset }) => (
                      <Badge key={asset.id} tone="success">{asset.symbol}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Choose analysis mode"
            description="Pick the structure that best matches the decision you need to make."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {(['single-asset-allocation', 'strategy-compare'] as const).map((item) => {
                const active = item === mode
                return (
                  <button
                    key={item}
                    type="button"
                    className={modeCardClass(active)}
                    onClick={() => setMode(item)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-text-primary">
                          {modeLabel(item)}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">
                          {modeSummary(item)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex size-10 items-center justify-center rounded-full',
                          active ? 'bg-primary text-white' : 'bg-app-bg-elevated text-text-secondary',
                        )}
                      >
                        <Sparkles className="size-4" />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Describe the decision"
            description="Keep it concrete. The first question should be the actual decision, not background context."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="problem"
                  className="text-sm font-semibold text-text-primary"
                >
                  What decision are you trying to make?
                </label>
                <Textarea
                  id="problem"
                  value={problem}
                  placeholder="Example: Should I join a study abroad exchange in year 3?"
                  className="min-h-36"
                  onChange={(event) => setProblem(event.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                  <span>{isValidProblem ? 'Structured prompt looks valid.' : 'Add at least a concrete question or decision target.'}</span>
                  <span>{autosaveLabel}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(examplePrompts[mode] ?? examplePrompts['single-asset-allocation']).map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="interactive-lift rounded-full border border-border-subtle bg-app-bg-elevated px-3.5 py-2 text-sm text-text-secondary hover:border-border-strong hover:bg-bg-surface hover:text-text-primary"
                    onClick={() => setProblem(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Constraints and preferences"
            description="Optional. If you already know the hard edges of the decision, add them now."
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConstraints((current) => !current)}
              >
                {showConstraints ? 'Hide constraints' : 'Add constraints'}
              </Button>
            }
          >
            {showConstraints ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Budget range
                  </label>
                  <Input
                    value={budgetRange}
                    onChange={(event) => setBudgetRange(event.target.value)}
                    placeholder="$8k - $15k"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Time horizon
                  </label>
                  <Select
                    value={timeHorizon}
                    onChange={(event) => setTimeHorizon(event.target.value)}
                  >
                    <option value="1-3 months">1-3 months</option>
                    <option value="3-6 months">3-6 months</option>
                    <option value="6-12 months">6-12 months</option>
                    <option value="12+ months">12+ months</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Risk preference
                  </label>
                  <Select
                    value={riskPreference}
                    onChange={(event) => setRiskPreference(event.target.value)}
                  >
                    <option value="Conservative">Conservative</option>
                    <option value="Balanced">Balanced</option>
                    <option value="Aggressive">Aggressive</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Settlement currency
                  </label>
                  <Select
                    value={settlementCurrency}
                    onChange={(event) => setSettlementCurrency(event.target.value)}
                  >
                    <option value="USD">USD</option>
                    <option value="USDT">USDT</option>
                    <option value="HKD">HKD</option>
                    <option value="Custom">Custom</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Target chain / asset universe
                  </label>
                  <Select value={targetChain} onChange={(event) => setTargetChain(event.target.value)}>
                    <option value="Any supported network">Any supported network</option>
                    <option value="HashKey Chain / stable assets">HashKey Chain / stable assets</option>
                    <option value="RWA-compatible assets only">RWA-compatible assets only</option>
                    <option value="General decision analysis">General decision analysis</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Access constraints / KYC
                  </label>
                  <Select
                    value={accessConstraints}
                    onChange={(event) => setAccessConstraints(event.target.value)}
                  >
                    <option value="No additional access constraints">No additional access constraints</option>
                    <option value="KYC required">KYC required</option>
                    <option value="Jurisdiction restricted">Jurisdiction restricted</option>
                    <option value="Institutional-only access">Institutional-only access</option>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Must-have goals
                  </label>
                  <Input
                    value={mustHaveGoals}
                    onChange={(event) => setMustHaveGoals(event.target.value)}
                    placeholder="Protect cash runway; keep optionality"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-text-primary">
                    Must-avoid outcomes
                  </label>
                  <Input
                    value={mustAvoidOutcomes}
                    onChange={(event) => setMustAvoidOutcomes(event.target.value)}
                    placeholder="Irreversible commitment without evidence"
                  />
                </div>
              </div>
            ) : (
              <PreviewNote>
                You can skip constraints now. The system will still ask follow-up questions before it drafts a recommendation.
              </PreviewNote>
            )}
          </SectionCard>

          {createMutation.isError ? (
            <ErrorState
              title="Could not start the analysis"
              description={(createMutation.error as Error).message}
              action={
                <Button onClick={() => createMutation.reset()} variant="secondary">
                  Dismiss
                </Button>
              }
            />
          ) : null}

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-text-primary">Ready to start</p>
              <p className="text-sm text-text-secondary">
                {isValidProblem
                  ? `${autosaveLabel}. The first clarification round will open immediately after session creation.`
                  : 'Complete the decision prompt before starting analysis.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setProblem(examplePrompts[mode][0])}
              >
                Use example
              </Button>
              <Button
                disabled={!isValidProblem || createMutation.isPending}
                onClick={startAnalysis}
              >
                {createMutation.isPending ? 'Starting analysis...' : 'Start analysis'}
                {createMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
              </Button>
            </div>
          </StickyActionBar>
        </div>

        <div className="space-y-6">
          {catalogQuery.isLoading ? (
            <LoadingState
              title="Loading workspace context"
              description="Preparing recent sessions and example reports."
            />
          ) : catalogQuery.isError ? (
            <ErrorState
              title="Could not load workspace context"
              description={(catalogQuery.error as Error).message}
              action={
                <Button variant="secondary" onClick={() => void catalogQuery.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <>
              <SectionCard title="Recent sessions" description="Jump back into work already in progress.">
                {recentSessions.length ? (
                  <div className="space-y-4">
                    {recentSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        confidence={sessionConfidence(
                          session,
                          catalogQuery.data?.reportsBySession[session.id],
                        )}
                        evidenceCount={
                          catalogQuery.data?.reportsBySession[session.id]?.evidence.length ??
                          session.evidence.length
                        }
                        calculationCount={
                          catalogQuery.data?.reportsBySession[session.id]?.calculations.length ??
                          session.calculations.length
                        }
                        onOpen={() => void navigate(continuePath(session))}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No analysis sessions yet"
                    description="Start your first analysis to compare options, surface risks, and generate a structured report."
                  />
                )}
              </SectionCard>

              <SectionCard title="Example reports" description="See what the finished output looks like.">
                {exampleReports.length ? (
                  <div className="space-y-3">
                    {exampleReports.map((report) => (
                      <Card
                        key={report.id}
                        className="cursor-pointer space-y-3 p-5"
                        onClick={() => void navigate(`/reports/${report.sessionId}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-text-primary">
                              {report.summaryTitle}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-text-secondary">
                              {extractExecutiveSummary(report.markdown)}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <ConfidenceBadge
                              confidence={sessionConfidence(
                                catalogQuery.data?.sessions.find(
                                  (session) => session.id === report.sessionId,
                                )!,
                                report,
                              )}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3.5" />
                            {report.evidence.length} evidence items
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="size-3.5" />
                            {report.calculations.length} calculations
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No reports yet"
                    description="Completed analyses will appear here with summaries, charts, and evidence counts."
                  />
                )}
              </SectionCard>

              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard
                  title="How it works"
                  value="5 steps"
                  detail="Mode selection, decision intake, clarification, transparent analysis, and final report."
                  tone="brand"
                />
                <MetricCard
                  title="What you get"
                  value="Trust cues built in"
                  detail="Facts, freshness, calculations, assumptions, and unresolved unknowns stay visible throughout the flow."
                  tone="success"
                />
              </div>

              <SectionCard title="How it works" description="Support content stays visible while you prepare the intake.">
                <div className="space-y-3">
                  <PreviewNote>Start with the actual decision question, not the surrounding story.</PreviewNote>
                  <PreviewNote icon={<Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />}>
                    Optional crypto-aware fields sharpen chain, access, and settlement assumptions without making the product crypto-only.
                  </PreviewNote>
                  <PreviewNote icon={<Clock3 className="mt-0.5 size-4 shrink-0 text-info" />}>
                    The draft is stored locally so you can step away and resume the intake without losing context.
                  </PreviewNote>
                </div>
              </SectionCard>

              <SectionCard title="Last saved draft" description="Your in-progress intake is stored locally in this browser.">
                {problem.trim() ? (
                  <div className="space-y-3 rounded-[22px] border border-border-subtle bg-app-bg-elevated p-4">
                    <p className="text-sm font-semibold text-text-primary">{problem}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-text-primary">
                        {modeLabel(mode)}
                      </span>
                      <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-text-secondary">
                        {budgetRange}
                      </span>
                      <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-text-secondary">
                        {timeHorizon}
                      </span>
                      <span className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-text-secondary">
                        {settlementCurrency}
                      </span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No draft yet"
                    description="Once you start typing a new analysis, the current draft will appear here."
                  />
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
