import { useDeferredValue, useMemo, useState, useTransition } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, ArrowRight, FileText, MoreHorizontal, Sigma, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  SearchInput,
  SessionCard,
  SessionRow,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { fetchAnalysisCatalog, uniqueEvidenceCount } from '@/features/analysis/lib/catalog'
import {
  continuePath,
  sessionConfidence,
  sessionPath,
} from '@/features/analysis/lib/view-models'
import type { AnalysisMode } from '@/types'

function SessionOverflow({
  onDelete,
}: {
  onDelete: () => void
}) {
  return (
    <details className="relative">
      <summary className="interactive-lift flex size-9 cursor-pointer list-none items-center justify-center rounded-[14px] border border-border-subtle bg-app-bg-elevated text-text-secondary">
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 top-11 z-20 min-w-[168px] rounded-[18px] border border-border-subtle bg-panel p-2 shadow-[0_18px_40px_rgba(2,10,24,0.4)]">
        <button
          type="button"
          className="interactive-lift flex w-full items-center rounded-[14px] px-3 py-2 text-left text-sm text-danger hover:bg-[rgba(244,63,94,0.12)]"
          onClick={onDelete}
        >
          Delete session
        </button>
      </div>
    </details>
  )
}

export function SessionsPage() {
  const adapter = useApiAdapter()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [confidence, setConfidence] = useState('all')
  const [sort, setSort] = useState('updated')
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [, startTransition] = useTransition()
  const deferredSearch = useDeferredValue(search)

  const catalogQuery = useQuery({
    queryKey: ['analysis', 'catalog', 'sessions'],
    queryFn: () => fetchAnalysisCatalog(adapter),
  })

  const duplicateMutation = useMutation({
    mutationFn: (payload: { mode: AnalysisMode; problemStatement: string }) =>
      adapter.analysis.create({
        mode: payload.mode,
        locale: 'en',
        problemStatement: `${payload.problemStatement} (copy)`,
        intakeContext: {
          budgetRange: '$8k - $15k',
          timeHorizonLabel: '6-12 months',
          riskPreferenceLabel: 'Balanced',
          mustHaveGoals: ['Keep downside visible'],
          mustAvoidOutcomes: ['False certainty'],
          draftPrompt: payload.problemStatement,
          investmentAmount: 10000,
          baseCurrency: 'USD',
          preferredAssetIds: [],
          holdingPeriodDays: 180,
          riskTolerance: 'balanced',
          liquidityNeed: 't_plus_3',
          minimumKycLevel: 0,
          walletAddress: '',
          wantsOnchainAttestation: false,
          additionalConstraints: '',
        },
      }),
    onSuccess: async (session) => {
      toast.success('Session duplicated')
      await navigate(`/sessions/${session.id}/clarify`)
    },
  })

  const visibleSessions = useMemo(() => {
    const sessions = (catalogQuery.data?.sessions ?? []).filter(
      (session) => !deletedIds.includes(session.id),
    )

    return sessions
      .filter((session) => {
        const matchesSearch =
          !deferredSearch ||
          `${session.problemStatement} ${session.lastInsight}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase())

        const matchesMode = mode === 'all' || session.mode === mode
        const matchesStatus = status === 'all' || session.status === status
        const sessionScore = sessionConfidence(
          session,
          catalogQuery.data?.reportsBySession[session.id],
        )
        const matchesConfidence =
          confidence === 'all' ||
          (confidence === 'high' && (sessionScore ?? 0) >= 0.82) ||
          (confidence === 'medium' &&
            (sessionScore ?? 0) >= 0.66 &&
            (sessionScore ?? 0) < 0.82) ||
          (confidence === 'low' && (sessionScore ?? 0) < 0.66)

        return matchesSearch && matchesMode && matchesStatus && matchesConfidence
      })
      .sort((left, right) => {
        if (sort === 'updated') {
          return right.updatedAt.localeCompare(left.updatedAt)
        }
        if (sort === 'created') {
          return right.createdAt.localeCompare(left.createdAt)
        }
        return left.problemStatement.localeCompare(right.problemStatement)
      })
  }, [catalogQuery.data, confidence, deferredSearch, deletedIds, mode, sort, status])

  const handleDelete = (sessionId: string) => {
    startTransition(() => {
      setDeletedIds((current) => [...current, sessionId])
    })
    toast.success('Session removed from this demo view')
  }

  const calculationCount = (sessionId: string) =>
    catalogQuery.data?.reportsBySession[sessionId]?.calculations.length ??
    catalogQuery.data?.sessions.find((item) => item.id === sessionId)?.calculations.length ??
    0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sessions"
        title="Analysis sessions"
        description="Review every active or completed decision analysis in one place, continue unfinished work, and scan confidence, evidence, and calculation coverage quickly."
        actions={
          <Button onClick={() => void navigate('/new-analysis')}>Start new analysis</Button>
        }
      />

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sessions"
        />
        <Select value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="all">All modes</option>
          <option value="single-asset-allocation">Single-asset allocation</option>
          <option value="strategy-compare">Strategy compare</option>
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="CLARIFYING">Clarifying</option>
          <option value="ANALYZING">Analyzing</option>
          <option value="READY_FOR_EXECUTION">Ready for execution</option>
          <option value="EXECUTING">Executing</option>
          <option value="MONITORING">Monitoring</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </Select>
        <Select
          value={confidence}
          onChange={(event) => setConfidence(event.target.value)}
        >
          <option value="all">All confidence</option>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
        </Select>
        <Select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="updated">Sort by last updated</option>
          <option value="created">Sort by created</option>
          <option value="title">Sort by title</option>
        </Select>
      </FilterBar>

      {catalogQuery.isLoading ? (
        <LoadingState
          title="Loading sessions"
          description="Preparing session summaries, confidence signals, and report links."
        />
      ) : catalogQuery.isError ? (
        <ErrorState
          title="Could not load analysis sessions"
          description={(catalogQuery.error as Error).message}
          action={
            <Button variant="secondary" onClick={() => void catalogQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : visibleSessions.length === 0 ? (
        <EmptyState
          title={search ? 'No matching sessions' : 'No analysis sessions yet'}
          description={
            search
              ? 'Try a different search or relax one of the filters.'
              : 'Start your first analysis to compare options, surface risks, and generate a structured report.'
          }
          action={
            !search ? (
              <Button onClick={() => void navigate('/new-analysis')}>Start new analysis</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden xl:block">
            <div className="mb-3 grid gap-4 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted xl:grid-cols-[2.4fr_1fr_1fr_1fr_1.8fr_1.3fr_0.8fr_0.8fr_auto]">
              <span>Session</span>
              <span>Mode</span>
              <span>Status</span>
              <span>Last updated</span>
              <span>Key conclusion</span>
              <span>Confidence</span>
              <span>Evidence</span>
              <span>Calcs</span>
              <span>Actions</span>
            </div>
            <div className="space-y-3">
              {visibleSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  confidence={sessionConfidence(
                    session,
                    catalogQuery.data?.reportsBySession[session.id],
                  )}
                  evidenceCount={uniqueEvidenceCount(
                    session,
                    catalogQuery.data?.reportsBySession[session.id],
                  )}
                  calculationCount={calculationCount(session.id)}
                  onOpen={() => void navigate(sessionPath(session.id))}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void navigate(
                            catalogQuery.data?.reportsBySession[session.id]
                              ? `/reports/${session.id}`
                              : continuePath(session),
                          )
                        }
                      >
                        {catalogQuery.data?.reportsBySession[session.id] ? (
                          <>
                            <FileText className="size-4" />
                            View report
                          </>
                        ) : (
                          <>
                            <ArrowRight className="size-4" />
                            Continue
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void duplicateMutation.mutateAsync({
                            mode: session.mode,
                            problemStatement: session.problemStatement,
                          })
                        }
                      >
                        <Copy className="size-4" />
                        Duplicate
                      </Button>
                      <SessionOverflow onDelete={() => handleDelete(session.id)} />
                    </>
                  }
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:hidden">
            {visibleSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                confidence={sessionConfidence(
                  session,
                  catalogQuery.data?.reportsBySession[session.id],
                )}
                evidenceCount={uniqueEvidenceCount(
                  session,
                  catalogQuery.data?.reportsBySession[session.id],
                )}
                calculationCount={calculationCount(session.id)}
                onOpen={() => void navigate(sessionPath(session.id))}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void navigate(
                          catalogQuery.data?.reportsBySession[session.id]
                            ? `/reports/${session.id}`
                            : continuePath(session),
                        )
                      }
                    >
                      {catalogQuery.data?.reportsBySession[session.id] ? 'View report' : 'Continue'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void duplicateMutation.mutateAsync({
                          mode: session.mode,
                          problemStatement: session.problemStatement,
                        })
                      }
                    >
                      Duplicate
                    </Button>
                    <SessionOverflow onDelete={() => handleDelete(session.id)} />
                  </>
                }
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel-card rounded-[24px] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary-soft p-3 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Decision signal density</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    Each session keeps conclusion preview, evidence count, confidence, and calculation coverage in the same scan line.
                  </p>
                </div>
              </div>
            </div>
            <div className="panel-card rounded-[24px] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-[rgba(139,92,246,0.14)] p-3 text-accent-violet">
                  <Sigma className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Dense catalog, not stacked cards</p>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    The table hybrid is tuned for ongoing session management rather than decorative dashboard blocks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
