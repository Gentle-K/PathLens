import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  CircleAlert,
  FileSearch,
  LoaderCircle,
  Sigma,
  Sparkles,
} from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import {
  ConclusionCard,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PreviewNote,
  SectionCard,
  WorklogCard,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { formatRelativeTime } from '@/features/analysis/lib/view-models'

const stepLabels = ['Clarifying', 'Searching evidence', 'Running calculations', 'Drafting report']

export function ProgressPage() {
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const navigate = useNavigate()

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId, 'progress-session'],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const progressQuery = useQuery({
    queryKey: ['analysis', sessionId, 'progress'],
    queryFn: () => adapter.analysis.getProgress(sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === 'READY_FOR_EXECUTION' ||
      query.state.data?.status === 'EXECUTING' ||
      query.state.data?.status === 'MONITORING' ||
      query.state.data?.status === 'COMPLETED' ||
      query.state.data?.status === 'FAILED'
        ? false
        : 1400,
  })

  useEffect(() => {
    if (
      progressQuery.data?.status === 'READY_FOR_EXECUTION' ||
      progressQuery.data?.status === 'EXECUTING' ||
      progressQuery.data?.status === 'MONITORING' ||
      progressQuery.data?.status === 'COMPLETED'
    ) {
      void navigate(`/reports/${sessionId}`, { replace: true })
    }
  }, [navigate, progressQuery.data?.status, sessionId])

  if (sessionQuery.isLoading || progressQuery.isLoading) {
    return (
      <LoadingState
        title="Loading analysis progress"
        description="Preparing stage status, activity feed, and conclusion preview."
      />
    )
  }

  if (sessionQuery.isError || progressQuery.isError || !sessionQuery.data || !progressQuery.data) {
    return (
      <ErrorState
        title="Could not load analysis progress"
        description={
          (sessionQuery.error as Error | undefined)?.message ??
          (progressQuery.error as Error | undefined)?.message ??
          'The session progress snapshot is unavailable.'
        }
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void sessionQuery.refetch()
              void progressQuery.refetch()
            }}
          >
            Retry
          </Button>
        }
      />
    )
  }

  const session = sessionQuery.data
  const progress = progressQuery.data
  const stepIndex =
    progress.status === 'CLARIFYING'
      ? 0
      : progress.activityStatus?.includes('search')
        ? 1
        : progress.activityStatus?.includes('calculation')
          ? 2
          : 3

  const activityItems = [
    progress.currentFocus ? { title: 'Current focus', detail: progress.currentFocus } : null,
    ...(progress.pendingSearchTasks ?? []).map((item) => ({
      title: 'Search task generated',
      detail: item.topic,
    })),
    ...(progress.pendingCalculationTasks ?? []).map((item) => ({
      title: 'Calculation queued',
      detail: item.taskType,
    })),
    ...(progress.pendingChartTasks ?? []).map((item) => ({
      title: 'Chart in progress',
      detail: item.title,
    })),
  ].filter(Boolean) as Array<{ detail: string; title: string }>

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analyzing"
        title="Analysis in progress"
        description="The system shows what it is doing, which stage is active, and what remains before the final report is ready."
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/sessions/${session.id}`)}>
              Session detail
            </Button>
            {session.status === 'FAILED' ? (
              <Button variant="secondary" onClick={() => void navigate(`/sessions/${session.id}/clarify`)}>
                Re-open clarifications
              </Button>
            ) : null}
          </>
        }
      />

      <SectionCard
        title="Progress stepper"
        description="Clarification, search, calculation, and report drafting remain separate product states."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stepLabels.map((label, index) => {
            const completed =
              index < stepIndex ||
              progress.status === 'READY_FOR_EXECUTION' ||
              progress.status === 'EXECUTING' ||
              progress.status === 'MONITORING' ||
              progress.status === 'COMPLETED'
            const active =
              index === stepIndex &&
              progress.status !== 'READY_FOR_EXECUTION' &&
              progress.status !== 'EXECUTING' &&
              progress.status !== 'MONITORING' &&
              progress.status !== 'COMPLETED'

            return (
              <div
                key={label}
                className={`rounded-[22px] border px-4 py-4 ${
                  completed
                    ? 'border-[rgba(34,197,94,0.18)] bg-[rgba(20,184,122,0.08)]'
                    : active
                      ? 'border-[rgba(79,124,255,0.28)] bg-primary-soft'
                      : 'border-border-subtle bg-app-bg-elevated'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">{label}</p>
                  {completed ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : active ? (
                    <LoaderCircle className="size-4 animate-spin text-primary" />
                  ) : (
                    <Badge tone="neutral">Pending</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Questions answered"
              value={String(session.questions.filter((item) => item.answered).length)}
              detail="More answers usually mean fewer hidden assumptions."
              tone="brand"
            />
            <MetricCard
              title="Evidence collected"
              value={String(session.evidence.length)}
              detail="Source summaries already attached to this session."
              tone="success"
            />
            <MetricCard
              title="Calculations completed"
              value={String(session.calculations.length)}
              detail="Deterministic outputs supporting the recommendation."
              tone="brand"
            />
            <MetricCard
              title="Conclusions extracted"
              value={String(session.conclusions.length)}
              detail="Only surfaced conclusions are shown here."
              tone="success"
            />
          </div>

          <SectionCard
            title="Worklog"
            description="A transparent timeline of what the system is doing right now."
          >
            {activityItems.length ? (
              <div className="space-y-3">
                {activityItems.map((item, index) => (
                  <WorklogCard
                    key={`${item.title}-${index}`}
                    title={item.title}
                    detail={item.detail}
                    icon={
                      item.title.includes('Search') ? (
                        <FileSearch className="size-4" />
                      ) : item.title.includes('Calculation') ? (
                        <Sigma className="size-4" />
                      ) : item.title.includes('Chart') ? (
                        <Sparkles className="size-4" />
                      ) : (
                        <CircleAlert className="size-4" />
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No worklog entries yet"
                description="The worklog will fill in as search, calculation, and chart tasks start running."
              />
            )}
          </SectionCard>

          {progress.status === 'FAILED' ? (
            <ErrorState
              title="Part of the analysis failed"
              description={
                progress.errorMessage ??
                'The workflow did not complete. The UI keeps the failure visible instead of leaving an empty state.'
              }
              action={
                <Button variant="secondary" onClick={() => void navigate(`/sessions/${session.id}/clarify`)}>
                  Return to clarifications
                </Button>
              }
            />
          ) : (
            <PreviewNote>
              Progress surfaces keep active work, blockers, and remaining steps visible so the user can tell whether the report is converging or still waiting on signal.
            </PreviewNote>
          )}
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <SectionCard title="Current conclusions preview" description="Only high-value conclusions already extracted are shown here.">
            {session.conclusions.length ? (
              <div className="space-y-3">
                {session.conclusions.map((item) => (
                  <ConclusionCard
                    key={item.id}
                    title={item.conclusion}
                    type={item.conclusionType}
                    confidence={item.confidence}
                    basisCount={item.basisRefs.length}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No conclusions preview yet"
                description="Conclusions appear here as soon as the analysis pipeline extracts stable findings."
              />
            )}
          </SectionCard>

          <SectionCard title="Current status" description="The system keeps both the active focus and the fallback reason visible.">
            <div className="space-y-3">
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Active focus
                </p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {progress.currentFocus ?? 'Waiting for the next orchestrated step.'}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  What remains before report draft
                </p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {progress.nextAction === 'complete'
                    ? 'The report draft is ready.'
                    : progress.pendingSearchTasks?.length
                      ? `${progress.pendingSearchTasks.length} evidence task(s) still open.`
                      : progress.pendingCalculationTasks?.length
                        ? `${progress.pendingCalculationTasks.length} calculation task(s) still open.`
                        : 'The workflow is waiting for the next orchestrated step.'}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Last stop reason
                </p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {progress.lastStopReason ?? 'No fallback reason reported.'}
                </p>
              </div>
              <div className="rounded-[20px] bg-app-bg-elevated p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  Updated
                </p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {formatRelativeTime(session.updatedAt)}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
