import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, LoaderCircle, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useAppStore } from '@/lib/store/app-store'
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from '@/lib/utils/safe-storage'
import { currentUnderstanding, formatRelativeTime, modeLabel } from '@/features/analysis/lib/view-models'
import type { UserAnswer } from '@/types'

function createEmptyDraft(): ClarificationDraftValue {
  return {
    selectedOptions: [],
    customInput: '',
    answerStatus: 'declined',
  }
}

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
  const { t } = useTranslation()
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const adapter = useApiAdapter()
  const locale = useAppStore((state) => state.locale)
  const [drafts, setDrafts] = useState<Record<string, ClarificationDraftValue>>(() =>
    buildInitialDrafts(sessionId, []),
  )
  const [lastSavedAt, setLastSavedAt] = useState<string>('')

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId, 'clarify', locale],
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
        title={t('analysis.analysisSessionPage.errorTitle')}
        description={(sessionQuery.error as Error).message}
        action={
          <Button variant="secondary" onClick={() => void sessionQuery.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  }

  const session = sessionQuery.data

  if (sessionQuery.isLoading || !session) {
    return (
      <LoadingState
        title={t('analysis.analysisSessionPage.loadingTitle')}
        description={t('analysis.analysisSessionPage.loadingDescription')}
      />
    )
  }

  const pendingQuestions = session.questions.filter((question) => !question.answered)
  const questionDrafts = Object.fromEntries(
    session.questions.map((question) => [
      question.id,
      drafts[question.id] ?? createEmptyDraft(),
    ]),
  )
  const answers = toAnswers(sessionId, pendingQuestions, questionDrafts)
  const understanding = currentUnderstanding(session)
  const unresolved = pendingQuestions.map((item) => item.question)

  const saveDraft = () => {
    setLocalStorageItem(`ga-clarify-${sessionId}`, JSON.stringify(questionDrafts))
    setLastSavedAt(new Date().toISOString())
    toast.success(t('analysis.analysisSessionPage.draftSaved'))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('analysis.analysisSessionPage.eyebrow')}
        title={session.problemStatement}
        description={t('analysis.analysisSessionPage.description')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void navigate(`/sessions/${session.id}`)}>
              {t('analysis.analysisSessionPage.sessionDetail')}
            </Button>
            <Button
              onClick={() => void submitMutation.mutateAsync(answers)}
              disabled={!answers.length || submitMutation.isPending}
            >
              {submitMutation.isPending
                ? t('analysis.analysisSessionPage.continuingAnalysis')
                : t('analysis.analysisSessionPage.continueAnalysis')}
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
          { label: t('analysis.analysisSessionPage.meta.mode'), value: modeLabel(session.mode) },
          { label: t('analysis.analysisSessionPage.meta.status'), value: session.status },
          { label: t('analysis.analysisSessionPage.meta.updated'), value: formatRelativeTime(session.updatedAt) },
          {
            label: t('analysis.analysisSessionPage.meta.currentRound'),
            value: `${session.followUpRoundsUsed ?? 0} / ${session.followUpRoundLimit ?? 0}`,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard
            title={t('analysis.analysisSessionPage.understandingTitle')}
            description={t('analysis.analysisSessionPage.understandingDescription')}
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
                title={t('analysis.analysisSessionPage.understandingEmptyTitle')}
                description={t('analysis.analysisSessionPage.understandingEmptyDescription')}
              />
            )}
          </SectionCard>

          <SectionCard
            title={t('analysis.analysisSessionPage.questionsTitle')}
            description={t('analysis.analysisSessionPage.questionsDescription')}
          >
            {pendingQuestions.length ? (
              <div className="space-y-4">
                {pendingQuestions.map((question) => (
                  <ClarificationQuestionCard
                    key={question.id}
                    question={question}
                    value={questionDrafts[question.id] ?? createEmptyDraft()}
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
                title={t('analysis.analysisSessionPage.questionsEmptyTitle')}
                description={t('analysis.analysisSessionPage.questionsEmptyDescription')}
                action={
                  <Button onClick={() => void navigate(`/sessions/${session.id}/analyzing`)}>
                    {t('analysis.analysisSessionPage.goToAnalysis')}
                  </Button>
                }
              />
            )}
          </SectionCard>

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('analysis.analysisSessionPage.roundProgressTitle')}</p>
              <p className="text-sm text-text-secondary">
                {answers.length
                  ? t(
                      answers.length === 1
                        ? 'analysis.analysisSessionPage.answersReadyOne'
                        : 'analysis.analysisSessionPage.answersReadyMany',
                      {
                        count: answers.length,
                        autosave: lastSavedAt
                          ? t('analysis.analysisSessionPage.autosavedAt', {
                              value: new Date(lastSavedAt).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              }),
                            })
                          : t('analysis.analysisSessionPage.saveLocally'),
                      },
                    )
                  : t('analysis.analysisSessionPage.answerAtLeastOne')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveDraft}>
                <Save className="size-4" />
                {t('analysis.analysisSessionPage.saveAnswers')}
              </Button>
              <Button
                onClick={() => void submitMutation.mutateAsync(answers)}
                disabled={!answers.length || submitMutation.isPending}
              >
                {t('analysis.analysisSessionPage.continueAnalysis')}
              </Button>
            </div>
          </StickyActionBar>
        </div>

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <SectionCard title={t('analysis.analysisSessionPage.conclusionsTitle')} description={t('analysis.analysisSessionPage.conclusionsDescription')}>
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
                title={t('analysis.analysisSessionPage.conclusionsEmptyTitle')}
                description={t('analysis.analysisSessionPage.conclusionsEmptyDescription')}
              />
            )}
          </SectionCard>

          <SectionCard title={t('analysis.analysisSessionPage.unresolvedTitle')} description={t('analysis.analysisSessionPage.unresolvedDescription')}>
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
                title={t('analysis.analysisSessionPage.unresolvedEmptyTitle')}
                description={t('analysis.analysisSessionPage.unresolvedEmptyDescription')}
              />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard
              title={t('analysis.analysisSessionPage.evidenceProgressTitle')}
              value={t('analysis.analysisSessionPage.evidenceProgressValue', { count: session.evidence.length })}
              detail={t('analysis.analysisSessionPage.evidenceProgressDetail')}
              tone="brand"
            />
            <MetricCard
              title={t('analysis.analysisSessionPage.calculationProgressTitle')}
              value={t('analysis.analysisSessionPage.calculationProgressValue', {
                count: session.calculations.length,
              })}
              detail={t('analysis.analysisSessionPage.calculationProgressDetail')}
              tone="success"
            />
          </div>

          <PreviewNote>
            {t('analysis.analysisSessionPage.previewNote')}
          </PreviewNote>
        </div>
      </div>
    </div>
  )
}
