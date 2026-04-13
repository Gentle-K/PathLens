import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Copy,
  ExternalLink,
  FileDown,
  RefreshCw,
  Share2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ChartCard } from '@/components/charts/chart-card'
import { PageHeader } from '@/components/layout/page-header'
import {
  CalculationCard,
  ConfidenceBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  PreviewNote,
  ReportSection,
  SourceCard,
  StatusBadge,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { exportToPdf } from '@/lib/export/pdf'
import {
  extractExecutiveSummary,
  modeLabel,
  reportState,
  sessionConfidence,
} from '@/features/analysis/lib/view-models'

const reportSections = [
  { id: 'summary', label: 'Executive summary' },
  { id: 'eligibility', label: 'Eligibility summary' },
  { id: 'asset-facts', label: 'Asset facts' },
  { id: 'goal', label: 'Decision goal' },
  { id: 'assumptions', label: 'Key assumptions' },
  { id: 'facts', label: 'Confirmed facts' },
  { id: 'costs', label: 'Cost breakdown' },
  { id: 'risks', label: 'Risk breakdown' },
  { id: 'options', label: 'Option comparison' },
  { id: 'scenarios', label: 'Best / likely / worst case' },
  { id: 'calculations', label: 'Key calculations' },
  { id: 'charts', label: 'Charts' },
  { id: 'evidence', label: 'Evidence references' },
  { id: 'execution', label: 'Execution plan' },
  { id: 'monitoring', label: 'Monitoring checklist' },
  { id: 'receipts', label: 'Onchain receipts' },
  { id: 'unknowns', label: 'Unknowns' },
  { id: 'recommendation', label: 'Recommendation' },
  { id: 'boundary', label: 'Boundary note' },
] as const

export function ReportPage() {
  const { reportId = '', sessionId = '' } = useParams()
  const resolvedId = reportId || sessionId
  const adapter = useApiAdapter()
  const navigate = useNavigate()

  const sessionQuery = useQuery({
    queryKey: ['analysis', resolvedId, 'report-session'],
    queryFn: () => adapter.analysis.getById(resolvedId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', resolvedId, 'report'],
    queryFn: () => adapter.analysis.getReport(resolvedId),
  })

  const reanalyzeMutation = useMutation({
    mutationFn: () => adapter.analysis.requestMoreFollowUp(resolvedId),
    onSuccess: async () => {
      toast.success('Clarification window reopened')
      await navigate(`/sessions/${resolvedId}/clarify`)
    },
  })

  useEffect(() => {
    if (!sessionQuery.data) return
    if (sessionQuery.data.status === 'CLARIFYING') {
      void navigate(`/sessions/${resolvedId}/clarify`, { replace: true })
    }
    if (sessionQuery.data.status === 'ANALYZING') {
      void navigate(`/sessions/${resolvedId}/analyzing`, { replace: true })
    }
  }, [navigate, resolvedId, sessionQuery.data])

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/reports/${resolvedId}`
    await navigator.clipboard.writeText(url)
    toast.success('Report link copied')
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/reports/${resolvedId}`
    if (navigator.share) {
      await navigator.share({ title: 'Genius Actuary report', url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast.success('Share is unavailable here, so the link was copied instead')
  }

  const handleExport = async () => {
    if (!sessionQuery.data || !reportQuery.data) return
    await exportToPdf({
      title: `genius-actuary-report-${resolvedId}`,
      headers: ['Section', 'Item', 'Value', 'Detail'],
      rows: [
        ['overview', 'problem', reportQuery.data.summaryTitle, modeLabel(reportQuery.data.mode)],
        ['overview', 'status', sessionQuery.data.status, reportState(sessionQuery.data, reportQuery.data).label],
        ...reportQuery.data.highlights.map((item) => [
          'highlight',
          item.label,
          item.value,
          item.detail,
        ]),
        ...reportQuery.data.calculations.map((item) => [
          'calculation',
          item.taskType,
          item.result,
          item.formulaExpression,
        ]),
      ],
    })
  }

  if (sessionQuery.isError || reportQuery.isError) {
    return (
      <ErrorState
        title="Could not load the report"
        description={
          (sessionQuery.error as Error | undefined)?.message ??
          (reportQuery.error as Error | undefined)?.message ??
          'The report view is unavailable.'
        }
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void sessionQuery.refetch()
              void reportQuery.refetch()
            }}
          >
            Retry
          </Button>
        }
      />
    )
  }

  if (sessionQuery.isLoading || reportQuery.isLoading || !sessionQuery.data || !reportQuery.data) {
    return (
      <LoadingState
        title="Loading report"
        description="Preparing the structured recommendation, calculations, charts, and evidence references."
      />
    )
  }

  const session = sessionQuery.data
  const report = reportQuery.data
  const confidence = sessionConfidence(session, report)
  const state = reportState(session, report)
  const evidenceStale = report.evidence.some(
    (item) => item.freshness?.bucket === 'stale',
  )
  const executiveSummary = extractExecutiveSummary(report.markdown)
  const primaryAssetId =
    report.executionPlan?.targetAsset ||
    report.recommendedAllocations[0]?.assetId ||
    report.assetCards[0]?.assetId ||
    ''
  const recommendationLine =
    report.highlights[0]?.detail ?? session.lastInsight ?? executiveSummary

  const costRows =
    report.budgetItems?.map((item) => ({
      label: item.name,
      range: `${item.low} - ${item.high} ${item.currency}`,
      base: `${item.base} ${item.currency}`,
      note: item.rationale ?? 'No note provided.',
      confidence: item.confidence,
      type: item.itemType,
    })) ?? []

  const scenarioRows =
    report.budgetSummary != null
      ? [
          {
            label: 'Best case',
            value: `${report.budgetSummary.netLow} ${report.budgetSummary.currency}`,
            detail: 'Lower end of the estimated range if key assumptions land favorably.',
          },
          {
            label: 'Likely case',
            value: `${report.budgetSummary.netBase} ${report.budgetSummary.currency}`,
            detail: 'Base-case range used for the default recommendation.',
          },
          {
            label: 'Worst case',
            value: `${report.budgetSummary.netHigh} ${report.budgetSummary.currency}`,
            detail: 'Upper-cost range when adverse assumptions show up together.',
          },
        ]
      : report.optionProfiles?.slice(0, 3).map((option) => ({
          label: option.name,
          value: option.estimatedCostBase
            ? `${option.estimatedCostBase} ${option.currency}`
            : 'Range unavailable',
          detail: option.summary,
        })) ?? []

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Report detail"
          title={report.summaryTitle}
          description="This report now sits behind the product loop: verify proof first, then move into execution readiness and monitoring."
          actions={
            <>
              {primaryAssetId ? (
                <Button onClick={() => void navigate(`/assets/${primaryAssetId}/proof`)}>
                  <ExternalLink className="size-4" />
                  Open proof center
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void navigate(`/sessions/${resolvedId}/execute`)}>
                Review execution plan
              </Button>
              <Button variant="secondary" onClick={() => void navigate(`/sessions/${resolvedId}/execute`)}>
                Execute on HashKey Chain
              </Button>
              <Button variant="secondary" onClick={() => void navigate(`/sessions/${resolvedId}`)}>
                Open session
              </Button>
              <Button variant="secondary" onClick={() => void reanalyzeMutation.mutateAsync()}>
                <RefreshCw className="size-4" />
                Re-open clarification
              </Button>
              <Button variant="secondary" onClick={() => void handleExport()}>
                <FileDown className="size-4" />
                Export
              </Button>
              <Button variant="secondary" onClick={() => void handleCopyLink()}>
                <Copy className="size-4" />
                Copy link
              </Button>
              <Button variant="secondary" onClick={() => void handleShare()}>
                <Share2 className="size-4" />
                Share report
              </Button>
            </>
          }
        />

        <div className="xl:hidden">
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Jump to section</p>
            <Select
              value=""
              onChange={(event) => {
                if (event.target.value) {
                  window.location.hash = event.target.value
                }
              }}
            >
              <option value="">Select a section</option>
              {reportSections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Card>
        </div>

        <Card className="space-y-5 overflow-hidden p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={state.tone}>{state.label}</Badge>
                <Badge tone="neutral">{modeLabel(report.mode)}</Badge>
                <StatusBadge status={session.status} />
                <ConfidenceBadge confidence={confidence} />
              </div>
              <h2 className="max-w-4xl text-[2rem] font-semibold leading-[0.96] tracking-[-0.05em] text-text-primary">
                {executiveSummary}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-text-secondary">
                {recommendationLine}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {report.highlights.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-[20px] bg-app-bg-elevated p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                    {item.label}
                  </p>
                  <p className="mt-2 text-base font-semibold text-text-primary">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {evidenceStale ? (
            <div className="flex items-start gap-2 rounded-[20px] border border-[rgba(185,115,44,0.2)] bg-[rgba(185,115,44,0.08)] px-4 py-3 text-sm leading-6 text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Some evidence may be out of date. Review freshness before treating the recommendation as current.
              </span>
            </div>
          ) : null}
        </Card>

        <ReportSection
          id="summary"
          title="Executive summary"
          description="A concise view of what the system currently recommends and why."
        >
          <p className="text-sm leading-7 text-text-secondary">{executiveSummary}</p>
          <PreviewNote>
            This report supports a decision. It does not claim certainty, and it does not replace professional advice.
          </PreviewNote>
        </ReportSection>

        <ReportSection
          id="eligibility"
          title="Eligibility summary"
          description="Wallet KYC, investor type, jurisdiction, and ticket constraints are summarized before execution."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {(report.eligibilitySummary ?? []).map((item) => (
              <Card key={item.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{item.assetName}</p>
                  <Badge tone={item.status === 'eligible' ? 'success' : item.status === 'conditional' ? 'gold' : 'warning'}>
                    {item.status}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">{item.reasons[0] ?? 'No blocker detected.'}</p>
                {(item.missingRequirements ?? []).length ? (
                  <p className="text-sm text-warning">Missing: {item.missingRequirements.join(' · ')}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="asset-facts"
          title="Asset facts"
          description="Execution-critical facts stay visible next to the recommendation instead of being buried in prose."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {report.assetCards.slice(0, 4).map((asset) => (
              <Card key={asset.assetId} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{asset.name}</p>
                  <Badge tone="neutral">{asset.symbol}</Badge>
                </div>
                <div className="grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
                  <div>Settlement: {asset.settlementAsset || 'N/A'}</div>
                  <div>KYC: L{asset.requiredKycLevel ?? asset.kycRequiredLevel ?? 0}</div>
                  <div>Indicative yield: {asset.indicativeYield != null ? `${(asset.indicativeYield * 100).toFixed(2)}%` : 'N/A'}</div>
                  <div>Oracle: {asset.oracleProvider || 'N/A'}</div>
                </div>
                <p className="text-sm leading-6 text-text-secondary">{asset.fitSummary}</p>
                <Button variant="secondary" onClick={() => void navigate(`/assets/${asset.assetId}/proof`)}>
                  <ExternalLink className="size-4" />
                  View proof
                </Button>
              </Card>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="goal"
          title="Decision goal"
          description="The problem definition remains explicit so the recommendation can be audited against the original question."
        >
          <div className="space-y-3">
            <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm leading-7 text-text-primary">
              {session.problemStatement}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{modeLabel(report.mode)}</Badge>
              <Badge tone="info">Last updated {new Date(session.updatedAt).toLocaleDateString()}</Badge>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          id="execution"
          title="Execution plan"
          description="Quote, simulation warnings, and execution steps are wired to the execute page and writeback flow."
        >
          {report.executionPlan ? (
            <div className="space-y-4">
              <Card className="grid gap-3 p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Target asset</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{report.executionPlan.targetAsset || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Ticket size</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{report.executionPlan.ticketSize}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Route</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{report.executionPlan.quote?.routeType ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Expected amount</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{report.executionPlan.quote?.expectedAmountOut ?? 'N/A'}</p>
                </div>
              </Card>
              <div className="space-y-3">
                {report.executionPlan.steps.map((step) => (
                  <Card key={step.id} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-text-primary">{step.stepIndex}. {step.title}</p>
                      <Badge tone="neutral">{step.stepType}</Badge>
                    </div>
                    <p className="text-sm text-text-secondary">{step.description}</p>
                    {(step.warnings ?? []).length ? (
                      <p className="text-sm text-warning">{step.warnings.join(' · ')}</p>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Execution plan will populate after the backend execute call"
              description="Open the execution page to fetch the latest quote, simulation, bundle, and writeback state."
            />
          )}
        </ReportSection>

        <ReportSection
          id="monitoring"
          title="Monitoring checklist"
          description="P0 monitoring is baseline and derived from wallet positions, oracle freshness, and execution records."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {(report.positionSnapshots ?? []).map((item) => (
              <Card key={item.id} className="space-y-2 p-4">
                <p className="font-semibold text-text-primary">{item.assetName}</p>
                <p className="text-sm text-text-secondary">Balance {item.currentBalance} · NAV/price {item.latestNavOrPrice}</p>
                <p className="text-sm text-text-secondary">PnL {item.unrealizedPnl} · Yield {item.accruedYield}</p>
                <p className="text-sm text-text-secondary">Next redemption {item.nextRedemptionWindow || 'N/A'}</p>
              </Card>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="receipts"
          title="Onchain receipts and anchor records"
          description="Every attestation and related receipt should remain visible on the report and session detail pages."
        >
          <div className="space-y-3">
            {(report.transactionReceipts ?? []).map((receipt) => (
              <Card key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-text-primary">{receipt.txHash}</p>
                  <p className="text-sm text-text-secondary">{receipt.txStatus} · block {receipt.blockNumber ?? 'pending'}</p>
                </div>
                {receipt.explorerUrl ? (
                  <a href={receipt.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">
                    Explorer <ExternalLink className="size-4" />
                  </a>
                ) : null}
              </Card>
            ))}
            {(report.reportAnchorRecords ?? []).map((record) => (
              <Card key={record.id} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{record.status}</p>
                  <Badge tone="info">{record.chainId ?? 'N/A'}</Badge>
                </div>
                <p className="text-sm text-text-secondary">{record.note || record.attestationHash}</p>
              </Card>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="assumptions"
          title="Key assumptions"
          description="Assumptions remain visible because they are not confirmed facts."
        >
          <div className="space-y-3">
            {report.assumptions.map((item) => (
              <div key={item} className="rounded-[20px] border border-[rgba(139,92,246,0.22)] bg-[rgba(139,92,246,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
                <div className="mb-2"><Badge tone="gold">Estimate</Badge></div>
                {item}
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="facts"
          title="Confirmed facts"
          description="These facts come from source summaries and stay separate from estimates or inferences."
        >
          <div className="space-y-3">
            {report.evidence.flatMap((item) =>
              item.extractedFacts.slice(0, 2).map((fact) => (
                <div key={`${item.id}-${fact}`} className="rounded-[20px] border border-[rgba(34,211,238,0.22)] bg-[rgba(34,211,238,0.08)] px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">Fact</Badge>
                    <Badge tone="neutral">{item.sourceName}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-primary">{fact}</p>
                </div>
              )),
            )}
          </div>
        </ReportSection>

        <ReportSection
          id="costs"
          title="Cost breakdown"
          description="Direct costs, hidden costs, and buffers should be readable without digging through prose."
        >
          {costRows.length ? (
            <div className="space-y-3">
              {costRows.map((row) => (
                <div key={row.label} className="rounded-[20px] bg-app-bg-elevated p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{row.type.replace(/_/g, ' ')}</Badge>
                        <ConfidenceBadge confidence={row.confidence} />
                      </div>
                      <p className="mt-2 font-semibold text-text-primary">{row.label}</p>
                    </div>
                    <div className="text-right">
                      <p className="mono text-base font-semibold text-text-primary">{row.base}</p>
                      <p className="text-sm text-text-secondary">{row.range}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-text-secondary">{row.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No explicit cost breakdown"
              description="This report does not currently expose structured cost items."
            />
          )}
        </ReportSection>

        <ReportSection
          id="risks"
          title="Risk breakdown"
          description="Warnings and conclusion-level inferences remain visible instead of being hidden inside summary text."
        >
          <div className="space-y-3">
            {(report.warnings ?? []).map((warning) => (
              <div key={warning} className="rounded-[20px] border border-[rgba(185,115,44,0.2)] bg-[rgba(185,115,44,0.08)] px-4 py-3 text-sm leading-6 text-warning">
                {warning}
              </div>
            ))}
            {session.conclusions.map((item) => (
              <div key={item.id} className="rounded-[20px] bg-app-bg-elevated p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.conclusionType === 'fact' ? 'info' : item.conclusionType === 'estimate' ? 'gold' : 'warning'}>
                    {item.conclusionType}
                  </Badge>
                  <ConfidenceBadge confidence={item.confidence} />
                </div>
                <p className="mt-2 text-sm leading-6 text-text-primary">{item.conclusion}</p>
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="options"
          title="Option comparison"
          description="Only shown when the report includes more than one viable path."
        >
          {report.optionProfiles?.length ? (
            <div className="space-y-4">
              {report.optionProfiles.map((option) => (
                <div key={option.id} className="rounded-[22px] bg-app-bg-elevated p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-text-primary">{option.name}</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {option.summary}
                      </p>
                    </div>
                    <div className="text-right">
                      <ConfidenceBadge confidence={option.confidence} />
                      <p className="mono mt-2 text-sm text-text-secondary">
                        {option.estimatedCostBase} {option.currency}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                        Pros
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
                        {option.pros.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                        Cons
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
                        {option.cons.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                        Conditions
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
                        {option.conditions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                        Caution flags
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
                        {option.cautionFlags.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Single-path report"
              description="This report analyzes one main decision path rather than comparing several options."
            />
          )}
        </ReportSection>

        <ReportSection
          id="scenarios"
          title="Best / likely / worst case"
          description="Scenario framing prevents a single base-case number from looking more certain than it is."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {scenarioRows.map((item) => (
              <div key={item.label} className="rounded-[22px] bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {item.label}
                </p>
                <p className="mono mt-2 text-lg font-semibold text-text-primary">
                  {item.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{item.detail}</p>
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          id="calculations"
          title="Key calculations"
          description="Calculations stay separate from narrative so users can inspect formulas and parameters directly."
        >
          {report.calculations.length ? (
            <div className="space-y-4">
              {report.calculations.map((item) => (
                <CalculationCard
                  key={item.id}
                  task={item}
                  sessionTitle={report.summaryTitle}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No calculations available"
              description="This report does not currently expose deterministic calculations."
            />
          )}
        </ReportSection>

        <ReportSection
          id="charts"
          title="Charts"
          description="Charts require titles, units, and source or estimate context. If data is incomplete, the empty state stays visible."
        >
          {report.charts.length ? (
            <div className="space-y-4">
              {report.charts.map((chart) => (
                <ChartCard key={chart.id} chart={chart} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No charts available"
              description="There was not enough data to render a reliable chart for this report."
            />
          )}
        </ReportSection>

        <ReportSection
          id="evidence"
          title="Evidence references"
          description="Sources and freshness stay visible near the final recommendation."
        >
          {report.evidence.length ? (
            <div className="space-y-4">
              {report.evidence.map((item) => (
                <SourceCard
                  key={item.id}
                  item={item}
                  linkedConclusionCount={session.conclusions.filter((conclusion) =>
                    conclusion.basisRefs.includes(item.id),
                  ).length}
                  sessionTitle={session.problemStatement}
                  onOpen={() => window.open(item.sourceUrl, '_blank', 'noopener,noreferrer')}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No evidence references"
              description="This report does not currently expose source references."
            />
          )}
        </ReportSection>

        <ReportSection
          id="unknowns"
          title="Unknowns and unresolved uncertainties"
          description="Unknowns should be readable before the user acts on the recommendation."
        >
          {(report.unknowns ?? []).length ? (
            <div className="space-y-3">
              {(report.unknowns ?? []).map((item) => (
                <div key={item} className="rounded-[20px] border border-[rgba(244,63,94,0.24)] bg-[rgba(244,63,94,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
                  <div className="mb-2"><Badge tone="danger">Unknown</Badge></div>
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No unknowns listed"
              description="This report does not currently expose an explicit unknowns section."
            />
          )}
        </ReportSection>

        <ReportSection
          id="recommendation"
          title="Recommendation"
          description="Recommendation direction is structured, bounded, and tied back to visible assumptions and uncertainty."
        >
          <div className="space-y-4">
            <div className="rounded-[22px] border border-[rgba(79,124,255,0.22)] bg-primary-soft p-5">
              <p className="text-base font-semibold text-text-primary">{recommendationLine}</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Recommendation confidence: {typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'not available yet'}
              </p>
            </div>
            <div className="rounded-[20px] bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {report.markdown.replace(/^#.*$/gm, '').trim()}
            </div>
          </div>
        </ReportSection>

        <ReportSection
          id="boundary"
          title="Boundary note"
          description="This section makes the product boundary explicit."
        >
          <div className="space-y-3">
            {report.disclaimers.map((item) => (
              <div key={item} className="rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                {item}
              </div>
            ))}
            <PreviewNote>
              Use the report to structure the decision, not to outsource accountability for it.
            </PreviewNote>
          </div>
        </ReportSection>
      </div>

      <aside className="hidden xl:block">
        <div className="panel-card sticky top-6 space-y-4 p-4">
          <p className="text-sm font-semibold text-text-primary">Report outline</p>
          <nav className="space-y-1">
            {reportSections.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="interactive-lift block rounded-2xl px-3 py-2 text-sm text-text-secondary hover:bg-app-bg-elevated hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href={report.evidence[0]?.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gold-primary"
          >
            Open first source
            <ExternalLink className="size-4" />
          </a>
        </div>
      </aside>
    </div>
  )
}
