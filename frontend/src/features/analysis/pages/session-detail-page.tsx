import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleHelp, FileSearch, Sigma } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/page-header'
import {
  CalculationCard,
  ConclusionCard,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PreviewNote,
  SectionCard,
  SmallMetaList,
  StatusBadge,
  ConfidenceBadge,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { mergeCalculations, mergeEvidence } from '@/features/analysis/lib/catalog'
import {
  continuePath,
  currentUnderstanding,
  formatRelativeTime,
  modeLabel,
  sessionConfidence,
  statusMeta,
} from '@/features/analysis/lib/view-models'

export function SessionDetailPage() {
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const navigate = useNavigate()

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId, 'detail'],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const reportQuery = useQuery({
    queryKey: ['analysis', sessionId, 'detail-report'],
    queryFn: () => adapter.analysis.getReport(sessionId),
    enabled:
      sessionQuery.data?.status === 'READY_FOR_EXECUTION' ||
      sessionQuery.data?.status === 'EXECUTING' ||
      sessionQuery.data?.status === 'MONITORING' ||
      sessionQuery.data?.status === 'COMPLETED',
  })

  if (sessionQuery.isLoading) {
    return (
      <LoadingState
        title="Loading session detail"
        description="Preparing the current understanding, evidence coverage, and pending uncertainties."
      />
    )
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <ErrorState
        title="Could not load this session"
        description={
          (sessionQuery.error as Error | undefined)?.message ??
          'The requested session is unavailable.'
        }
        action={
          <Button variant="secondary" onClick={() => void sessionQuery.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const session = sessionQuery.data
  const report = reportQuery.data
  const understanding = currentUnderstanding(session)
  const evidence = mergeEvidence(session, report)
  const calculations = mergeCalculations(session, report)
  const unresolved = [
    ...session.questions
      .filter((item) => !item.answered)
      .map((item) => item.question),
    ...(report?.unknowns ?? []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Session detail"
        title={session.problemStatement}
        description="This page captures the current state of the decision, including what the system already understands, what remains unresolved, and what the next action should be."
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate('/sessions')}>
              Back to sessions
            </Button>
            <Button onClick={() => void navigate(continuePath(session))}>
              {session.status === 'READY_FOR_EXECUTION' ||
              session.status === 'EXECUTING' ||
              session.status === 'MONITORING' ||
              session.status === 'COMPLETED'
                ? 'Open report'
                : 'Continue analysis'}
              <ArrowRight className="size-4" />
            </Button>
          </>
        }
      />

      <SmallMetaList
        items={[
          { label: 'Mode', value: modeLabel(session.mode) },
          { label: 'Status', value: statusMeta(session.status).label },
          { label: 'Updated', value: formatRelativeTime(session.updatedAt) },
          {
            label: 'Current round',
            value: `${session.followUpRoundsUsed ?? 0} / ${session.followUpRoundLimit ?? 0}`,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard
            title="Current understanding"
            description="These are the facts and constraints already visible before the next analysis step."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={session.status} />
                <ConfidenceBadge confidence={sessionConfidence(session, report)} />
              </div>
            }
          >
            {understanding.length ? (
              <div className="grid gap-3">
                {understanding.map((item) => (
                  <div key={item} className="rounded-[20px] bg-app-bg-elevated px-4 py-3 text-sm leading-6 text-text-secondary">
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Understanding not captured yet"
                description="Start with clarifications so the system can anchor the recommendation in concrete constraints."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Current status and next action"
            description="Dynamic follow-up questions and evidence synthesis are the main levers for improving recommendation quality."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                title="Questions answered"
                value={String(session.questions.filter((item) => item.answered).length)}
                detail="Answered questions sharpen assumptions and reduce unknowns."
                tone="brand"
              />
              <MetricCard
                title="Pending questions"
                value={String(session.questions.filter((item) => !item.answered).length)}
                detail="These are still blocking a higher-confidence recommendation."
                tone="warning"
              />
              <MetricCard
                title="Evidence collected"
                value={String(evidence.length)}
                detail="Sources already linked to this session."
                tone="success"
              />
            </div>
            <PreviewNote icon={<CircleHelp className="mt-0.5 size-4 shrink-0 text-info" />}>
              Next action:{' '}
              {session.status === 'READY_FOR_EXECUTION' ||
              session.status === 'EXECUTING' ||
              session.status === 'MONITORING' ||
              session.status === 'COMPLETED'
                ? 'Review the report, execution plan, and monitoring state.'
                : 'Continue the session to close blockers and raise confidence.'}
            </PreviewNote>
          </SectionCard>

          <SectionCard
            title="Evidence already linked"
            description="These sources are available even before the final report is assembled."
          >
            {evidence.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {evidence.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">{item.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{item.summary}</p>
                      </div>
                      <FileSearch className="size-4 shrink-0 text-info" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No evidence linked yet"
                description="Evidence cards will appear here after search tasks start returning source summaries."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Calculation snapshot"
            description="Visible calculations are deterministic outputs that support the recommendation."
          >
            {calculations.length ? (
              <div className="space-y-4">
                {calculations.slice(0, 2).map((task) => (
                  <CalculationCard key={task.id} task={task} sessionTitle={session.problemStatement} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No calculations yet"
                description="The analysis will start surfacing calculations once there is enough structured input."
              />
            )}
          </SectionCard>
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <SectionCard title="Major conclusions so far" description="Facts, estimates, and inferences remain visibly labeled.">
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
                title="No conclusions yet"
                description="The system will add conclusions after clarification or evidence synthesis starts."
              />
            )}
          </SectionCard>

          <SectionCard title="Unresolved uncertainties" description="Unknowns are explicit product output, not hidden footnotes.">
            {unresolved.length ? (
              <div className="space-y-3">
                {unresolved.map((item) => (
                  <div key={item} className="rounded-[20px] border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No unresolved uncertainties shown"
                description="This session currently has no open uncertainty list in the frontend view."
              />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard
              title="Evidence progress"
              value={`${evidence.length} sources`}
              detail="Source count is visible even before the report is finalized."
              tone="brand"
            />
            <MetricCard
              title="Calculation progress"
              value={`${calculations.length} results`}
              detail="Only deterministic outputs with display value are shown here."
              tone="success"
            />
          </div>

          <PreviewNote icon={<Sigma className="mt-0.5 size-4 shrink-0 text-info" />}>
            Confidence should rise only when assumptions, evidence, and calculations converge. The UI keeps those boundaries visible instead of flattening them into one summary score.
          </PreviewNote>
        </div>
      </div>
    </div>
  )
}
