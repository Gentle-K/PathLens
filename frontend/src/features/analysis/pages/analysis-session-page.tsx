import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, LoaderCircle, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import {
  ClarificationQuestionCard,
  type ClarificationDraftValue,
  ConclusionCard,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PreviewNote,
  SectionCard,
  SmallMetaList,
  StickyActionBar,
} from '@/components/product/decision-ui'
import { Button } from '@/components/ui/button'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from '@/lib/utils/safe-storage'
import { currentUnderstanding, formatRelativeTime, modeLabel } from '@/features/analysis/lib/view-models'
import type { UserAnswer } from '@/types'

function buildInitialDrafts(
  sessionId: string,
  questions: Array<{ id: string }>,
): Record<string, ClarificationDraftValue> {
  const raw = getLocalStorageItem(`ga-clarify-${sessionId}`)
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, ClarificationDraftValue>
    } catch {
      removeLocalStorageItem(`ga-clarify-${sessionId}`)
    }
  }

  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      {
        selectedOptions: [],
        customInput: '',
        answerStatus: 'declined' as const,
      },
    ]),
  )
}

function toAnswers(
  sessionId: string,
  questions: Array<{ id: string }>,
  drafts: Record<string, ClarificationDraftValue>,
) {
  return questions.flatMap((question) => {
    const draft = drafts[question.id]
    if (!draft) {
      return []
    }

    const hasContent =
      draft.selectedOptions.length > 0 || draft.customInput.trim().length > 0

    if (draft.answerStatus === 'declined') {
      return []
    }

    if (draft.answerStatus === 'answered' && !hasContent) {
      return []
    }

    return [
      {
        id: `${sessionId}-${question.id}-answer`,
        questionId: question.id,
        answerStatus: draft.answerStatus,
        selectedOptions: draft.selectedOptions.length ? draft.selectedOptions : undefined,
        customInput: draft.customInput.trim() || undefined,
      } satisfies UserAnswer,
    ]
  })
}

export function AnalysisSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const adapter = useApiAdapter()
  const [drafts, setDrafts] = useState<Record<string, ClarificationDraftValue>>({})
  const [lastSavedAt, setLastSavedAt] = useState<string>('')

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId, 'clarify'],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const submitMutation = useMutation({
    mutationFn: (answers: UserAnswer[]) =>
      adapter.analysis.submitAnswers(sessionId, { answers }),
    onSuccess: async () => {
      removeLocalStorageItem(`ga-clarify-${sessionId}`)
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
      await navigate(`/sessions/${sessionId}/analyzing`)
    },
  })

  useEffect(() => {
    if (!sessionQuery.data) return
    setDrafts(buildInitialDrafts(sessionId, sessionQuery.data.questions))
  }, [sessionId, sessionQuery.data])

  useEffect(() => {
    if (
      sessionQuery.data?.status === 'READY_FOR_EXECUTION' ||
      sessionQuery.data?.status === 'EXECUTING' ||
      sessionQuery.data?.status === 'MONITORING' ||
      sessionQuery.data?.status === 'COMPLETED'
    ) {
      void navigate(`/reports/${sessionId}`, { replace: true })
    }
  }, [navigate, sessionId, sessionQuery.data?.status])

  if (sessionQuery.isError) {
    return (
      <ErrorState
        title="Could not load clarification round"
        description={(sessionQuery.error as Error).message}
        action={
          <Button variant="secondary" onClick={() => void sessionQuery.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  const session = sessionQuery.data

  if (sessionQuery.isLoading || !session) {
    return (
      <LoadingState
        title="Loading clarification round"
        description="Preparing the current understanding, follow-up questions, and saved draft answers."
      />
    )
  }

  const pendingQuestions = session.questions.filter((question) => !question.answered)
  const answers = toAnswers(sessionId, pendingQuestions, drafts)
  const understanding = currentUnderstanding(session)
  const unresolved = pendingQuestions.map((item) => item.question)

  const saveDraft = () => {
    setLocalStorageItem(`ga-clarify-${sessionId}`, JSON.stringify(drafts))
    setLastSavedAt(new Date().toISOString())
    toast.success('Draft answers saved')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clarification"
        title={session.problemStatement}
        description="Dynamic follow-up questions make the recommendation more specific. Every answer should either sharpen a constraint, close an unknown, or change the trade-off."
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/sessions/${session.id}`)}>
              Session detail
            </Button>
            <Button
              onClick={() => void submitMutation.mutateAsync(answers)}
              disabled={!answers.length || submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Continuing analysis...' : 'Continue analysis'}
              {submitMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
            </Button>
          </>
        }
      />

      <SmallMetaList
        items={[
          { label: 'Mode', value: modeLabel(session.mode) },
          { label: 'Status', value: session.status },
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
            description="This is the context the system already has before the next analysis round."
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
                title="No structured context captured yet"
                description="Use this round to make the decision constraints explicit."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Clarification questions"
            description="Each question explains why it matters, supports custom input, and can be skipped for now."
          >
            {pendingQuestions.length ? (
              <div className="space-y-4">
                {pendingQuestions.map((question) => (
                  <ClarificationQuestionCard
                    key={question.id}
                    question={question}
                    value={
                      drafts[question.id] ?? {
                        selectedOptions: [],
                        customInput: '',
                        answerStatus: 'declined',
                      }
                    }
                    onChange={(next) =>
                      setDrafts((current) => ({
                        ...current,
                        [question.id]: next,
                      }))
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No open clarification questions"
                description="This session has no pending follow-up questions right now. Continue into analysis to see the next stage."
                action={
                  <Button onClick={() => void navigate(`/sessions/${session.id}/analyzing`)}>
                    Go to analysis in progress
                  </Button>
                }
              />
            )}
          </SectionCard>

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-text-primary">Round progress</p>
              <p className="text-sm text-text-secondary">
                {answers.length
                  ? `${answers.length} answer${answers.length === 1 ? '' : 's'} ready. ${lastSavedAt ? `Autosaved at ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Save locally at any time.'}`
                  : 'Answer at least one high-value question before continuing.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveDraft}>
                <Save className="size-4" />
                Save answers
              </Button>
              <Button
                onClick={() => void submitMutation.mutateAsync(answers)}
                disabled={!answers.length || submitMutation.isPending}
              >
                Continue analysis
              </Button>
            </div>
          </StickyActionBar>
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <SectionCard title="Major conclusions so far" description="Only visible if the current session already has conclusion objects.">
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
                description="The first conclusions usually appear after evidence and calculation steps start."
              />
            )}
          </SectionCard>

          <SectionCard title="Unresolved uncertainties" description="These are the gaps the system still wants to close.">
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
                title="No unresolved uncertainties listed"
                description="This round does not show any open uncertainty list."
              />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard
              title="Evidence progress"
              value={`${session.evidence.length} sources`}
              detail="Evidence collection continues after you submit this round."
              tone="brand"
            />
            <MetricCard
              title="Calculation progress"
              value={`${session.calculations.length} tasks`}
              detail="Calculations will refresh once the system has enough structured input."
              tone="success"
            />
          </div>

          <PreviewNote>
            Answered cards collapse after they have enough signal. You can reopen them at any time if a later question changes the trade-off.
          </PreviewNote>
        </div>
      </div>
    </div>
  )
}
