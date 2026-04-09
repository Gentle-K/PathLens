import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Brain,
  CheckCircle2,
  CircleHelp,
  Clock3,
  LoaderCircle,
  Search,
  TableProperties,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { GoldenSandLoader } from '@/components/feedback/golden-sand-loader'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
import { useAppStore } from '@/lib/store/app-store'
import type { AnalysisProgress, AnalysisSession, UserAnswer } from '@/types'

type DraftAnswer = {
  selectedOptions: string[]
  customInput: string
  answerStatus: UserAnswer['answerStatus']
}

function buildDraftAnswers(session: AnalysisSession) {
  return Object.fromEntries(
    session.questions
      .filter((question) => !question.answered)
      .map((question) => [
        question.id,
        {
          selectedOptions: [],
          customInput: '',
          answerStatus: 'answered' as const,
        },
      ]),
  ) satisfies Record<string, DraftAnswer>
}

function toAnswers(
  session: AnalysisSession,
  drafts: Record<string, DraftAnswer>,
) {
  return session.questions
    .filter((question) => !question.answered)
    .flatMap((question) => {
      const draft = drafts[question.id]
      if (!draft) {
        return []
      }

      const hasAnswer =
        draft.selectedOptions.length > 0 || draft.customInput.trim().length > 0
      if (draft.answerStatus === 'answered' && !hasAnswer) {
        return []
      }

      return [
        {
          id: `${question.id}-answer`,
          questionId: question.id,
          answerStatus: draft.answerStatus,
          selectedOptions: draft.selectedOptions.length
            ? draft.selectedOptions
            : undefined,
          customInput: draft.customInput.trim() || undefined,
        } satisfies UserAnswer,
      ]
    })
}

function toneForStage(status: AnalysisProgress['stages'][number]['status']) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'active') {
    return 'gold'
  }

  return 'neutral'
}

export function AnalysisSessionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const { i18n } = useTranslation()
  const locale = useAppStore((state) => state.locale)
  const isZh = i18n.language.startsWith('zh')
  const [draftOverrides, setDraftOverrides] = useState<Record<string, DraftAnswer>>({})

  const text = useMemo(
    () => ({
      eyebrow: isZh ? '第 2 页 / 分析界面' : 'Page 2 / Analysis Workspace',
      description: isZh
        ? '在这里补充条款、流动性和 KYC 关键信息，并实时查看当前是在搜证据、算 RiskVector、跑持有期模拟，还是整理交易草案。'
        : 'Refine terms, liquidity, and KYC inputs here while tracking whether the system is gathering evidence, running RiskVector math, simulating holding outcomes, or drafting execution steps.',
      loadingSession: isZh ? '正在加载分析会话...' : 'Loading the analysis session...',
      principal: isZh ? '本金' : 'Principal',
      holdingPeriod: isZh ? '持有期' : 'Holding period',
      riskTolerance: isZh ? '风险偏好' : 'Risk tolerance',
      liquidity: isZh ? '流动性' : 'Liquidity',
      kyc: 'KYC',
      daySuffix: isZh ? '天' : 'd',
      aiQuestions: isZh ? 'AI 追问' : 'AI Clarifications',
      aiQuestionsDescription: isZh
        ? '回答越具体，后续的 RiskVector、持有期模拟和执行建议就越可靠。'
        : 'The more concrete your answers are, the more reliable the later RiskVector, simulation, and execution guidance becomes.',
      exampleAnswer: isZh ? '示例回答' : 'Example answer',
      detailInput: isZh ? '补充说明' : 'Additional detail',
      shortPlaceholder: isZh
        ? '补充关键事实、约束或你最担心的问题'
        : 'Add the key facts, constraints, or the risk you care about most',
      longPlaceholder: isZh
        ? '用自然语言补充背景、预算、约束或偏好'
        : 'Describe the context, budget, constraints, or preferences in natural language',
      answerNormally: isZh ? '正常回答' : 'Answer normally',
      uncertain: isZh ? '暂不确定' : 'Not sure yet',
      skip: isZh ? '跳过' : 'Skip',
      submitAnswers: isZh ? '提交本轮回答' : 'Submit this answer set',
      thinkingTitle: isZh
        ? '当前没有新的追问，AI 正在继续推进分析。'
        : 'There are no new follow-up questions right now. The system is still pushing the analysis forward.',
      thinkingFallback: isZh
        ? '系统正在搜索、计算或整理结果，请稍等片刻。'
        : 'The system is still searching, calculating, or assembling the result view.',
      noPendingQuestions: isZh
        ? '当前没有待回答问题，结果页面准备好后会自动可用。'
        : 'There are no pending questions. The result page will become available automatically when it is ready.',
      statusTitle: isZh ? 'AI 当前状态' : 'Current AI Status',
      statusDescription: isZh
        ? '这些状态直接来自后端当前会话，而不是前端本地猜测。'
        : 'These states come directly from the backend session rather than local frontend guesses.',
      currentFocus: isZh ? '当前焦点' : 'Current focus',
      currentFocusFallback: isZh ? '等待系统推进下一步。' : 'Waiting for the next orchestrated step.',
      lastStopReason: isZh ? '最近停顿原因' : 'Latest pause reason',
      lastStopReasonFallback: isZh
        ? '当前没有额外停顿原因。'
        : 'There is no additional pause reason at the moment.',
      failedFallback: isZh
        ? '分析失败，请检查后端日志或重新发起分析。'
        : 'The analysis failed. Check backend logs or start a fresh session.',
      artifactsTitle: isZh ? '任务与产物' : 'Tasks and Artifacts',
      searchTasks: isZh ? '搜索任务' : 'Search tasks',
      answeredQuestions: isZh ? '已回答问题' : 'Answered questions',
      chartPreview: isZh ? '图表预览' : 'Chart preview',
      itemSuffix: isZh ? '项' : 'items',
    }),
    [isZh],
  )

  const riskLabels = useMemo(
    () => ({
      conservative: isZh ? '保守' : 'Conservative',
      balanced: isZh ? '均衡' : 'Balanced',
      aggressive: isZh ? '进取' : 'Aggressive',
    }),
    [isZh],
  )

  const liquidityLabels = useMemo(
    () => ({
      instant: 'T+0',
      t_plus_3: 'T+3',
      locked: isZh ? '可锁定' : 'Lockup OK',
    }),
    [isZh],
  )

  const answerStatusLabels = useMemo(
    () => ({
      answered: text.answerNormally,
      uncertain: text.uncertain,
      skipped: text.skip,
    }),
    [text.answerNormally, text.skip, text.uncertain],
  )

  const stageStatusLabels = useMemo(
    () => ({
      pending: isZh ? '待处理' : 'Pending',
      active: isZh ? '进行中' : 'Active',
      completed: isZh ? '已完成' : 'Completed',
    }),
    [isZh],
  )

  const statusLabel = useMemo(() => {
    const mapping: Record<string, string> = {
      waiting_for_user_clarification_answers: isZh
        ? '等待用户回答问题'
        : 'Waiting for answers',
      waiting_for_llm_clarification_questions: isZh
        ? 'AI 正在生成追问'
        : 'Generating follow-up questions',
      waiting_for_llm_round_planning: isZh
        ? 'AI 正在规划下一轮分析'
        : 'Planning the next analysis round',
      llm_round_plan_ready: isZh ? 'AI 已完成本轮规划' : 'Round plan ready',
      waiting_for_mcp_execution: isZh
        ? 'AI 正在安排搜索、计算和图表任务'
        : 'Scheduling search, calculation, and chart tasks',
      searching_web_for_evidence: isZh ? '搜索网页中' : 'Searching the web',
      searching_and_synthesizing: isZh
        ? '搜索并综合证据中'
        : 'Searching and synthesizing evidence',
      running_deterministic_calculations: isZh
        ? '执行 RWA 风险与收益计算中'
        : 'Running deterministic RWA calculations',
      preparing_visualizations: isZh
        ? '生成分布图、雷达图和矩阵中'
        : 'Preparing distributions, radar charts, and matrices',
      waiting_for_llm_report_generation: isZh
        ? 'AI 正在整理 RWA 报告'
        : 'Preparing the RWA report',
      report_generated_waiting_for_delivery: isZh
        ? '结果已生成，正在整理展示'
        : 'Report generated and being prepared for display',
      running_analysis_pipeline: isZh ? '分析思考中' : 'Running analysis',
      analyzing: isZh ? '分析思考中' : 'Analyzing',
      completed: isZh ? '分析完成' : 'Completed',
      failed: isZh ? '分析失败' : 'Failed',
      llm_call_failed: isZh ? '模型调用失败' : 'Model call failed',
      unexpected_error: isZh ? '发生异常' : 'Unexpected error',
    }

    return (status?: string) =>
      mapping[status ?? ''] ?? (isZh ? '等待系统推进' : 'Waiting for orchestration')
  }, [isZh])

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const rwaBootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap', locale],
    queryFn: adapter.rwa.getBootstrap,
  })

  const progressQuery = useQuery({
    queryKey: ['analysis', sessionId, 'progress'],
    queryFn: () => adapter.analysis.getProgress(sessionId),
    enabled:
      !!sessionQuery.data &&
      sessionQuery.data.status !== 'COMPLETED' &&
      sessionQuery.data.status !== 'FAILED',
    refetchInterval:
      sessionQuery.data?.status === 'CLARIFYING' ? 3000 : 1400,
  })

  const submitMutation = useMutation({
    mutationFn: (answers: UserAnswer[]) =>
      adapter.analysis.submitAnswers(sessionId, { answers }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
      await queryClient.invalidateQueries({
        queryKey: ['analysis', sessionId, 'progress'],
      })
    },
  })

  const session = sessionQuery.data
  const progress = progressQuery.data
  const drafts = useMemo(
    () =>
      session
        ? {
            ...buildDraftAnswers(session),
            ...draftOverrides,
          }
        : draftOverrides,
    [draftOverrides, session],
  )
  const pendingQuestions = useMemo(
    () => session?.questions.filter((question) => !question.answered) ?? [],
    [session?.questions],
  )
  const selectedAssets = useMemo(() => {
    const assetLibrary = rwaBootstrapQuery.data?.assetLibrary ?? []
    const selectedIds = session?.intakeContext?.preferredAssetIds ?? []

    return assetLibrary.filter((asset) => selectedIds.includes(asset.id))
  }, [rwaBootstrapQuery.data?.assetLibrary, session?.intakeContext?.preferredAssetIds])

  useEffect(() => {
    if (progress?.status === 'COMPLETED' || session?.status === 'COMPLETED') {
      void navigate(`/analysis/session/${sessionId}/result`, {
        replace: true,
      })
    }
  }, [navigate, progress?.status, session?.status, sessionId])

  useEffect(() => {
    if (progressQuery.data) {
      void queryClient.invalidateQueries({ queryKey: ['analysis', sessionId] })
    }
  }, [progressQuery.data, queryClient, sessionId])

  if (!session) {
    return (
      <Card className="p-6 text-sm text-text-secondary">
        {text.loadingSession}
      </Card>
    )
  }

  const liveStatus = progress?.activityStatus ?? session.activityStatus
  const currentFocus = progress?.currentFocus ?? session.currentFocus
  const lastStopReason = progress?.lastStopReason ?? session.lastStopReason
  const liveStages = progress?.stages ?? []
  const showThinkingAnimation =
    pendingQuestions.length === 0 &&
    session.status !== 'FAILED' &&
    session.status !== 'COMPLETED'

  return (
    <div className="space-y-6 xl:flex xl:min-h-[calc(100vh-7rem)] xl:flex-col">
      <PageHeader
        eyebrow={text.eyebrow}
        title={session.problemStatement}
        description={text.description}
      />

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.principal}</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.investmentAmount.toLocaleString(
                locale === 'en' ? 'en-US' : 'zh-CN',
              )}{' '}
              {session.intakeContext.baseCurrency}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.holdingPeriod}</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.holdingPeriodDays} {text.daySuffix}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.riskTolerance}</p>
            <p className="mt-2 font-medium text-text-primary">
              {riskLabels[session.intakeContext.riskTolerance]}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.liquidity}</p>
            <p className="mt-2 font-medium text-text-primary">
              {liquidityLabels[session.intakeContext.liquidityNeed]}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">{text.kyc}</p>
            <p className="mt-2 font-medium text-text-primary">
              L{session.intakeContext.minimumKycLevel}
            </p>
          </div>
        </div>

        {selectedAssets.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedAssets.map((asset) => (
              <Badge key={asset.id} tone="gold">
                {asset.symbol}
              </Badge>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:min-h-[calc(100vh-18rem)] xl:flex-1 xl:grid-cols-[1.08fr_0.92fr] xl:overflow-hidden">
        <Card className="overflow-hidden p-0 xl:min-h-0 xl:flex xl:flex-col">
          <div className="border-b border-border-subtle p-6">
            <div className="flex items-center gap-3">
              <CircleHelp className="size-5 text-gold-primary" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {text.aiQuestions}
                </h2>
                <p className="text-sm leading-7 text-text-secondary">
                  {text.aiQuestionsDescription}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-4 scroll-shell">
            {pendingQuestions.length ? (
              <>
                {pendingQuestions.map((question, index) => {
                  const draft = drafts[question.id] ?? {
                    selectedOptions: [],
                    customInput: '',
                    answerStatus: 'answered' as const,
                  }

                  return (
                    <div
                      key={question.id}
                      className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">Q{index + 1}</Badge>
                        <Badge tone="gold">P{question.priority}</Badge>
                        {question.questionGroup ? (
                          <Badge tone="neutral">{question.questionGroup}</Badge>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-lg font-semibold text-text-primary">
                        {question.question}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-text-secondary">
                        {question.purpose}
                      </p>

                      {question.exampleAnswer ? (
                        <p className="mt-2 text-xs text-text-muted">
                          {text.exampleAnswer}: {question.exampleAnswer}
                        </p>
                      ) : null}

                      {question.options?.length ? (
                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {question.options.map((option) => {
                            const isActive = draft.selectedOptions.includes(
                              option.value,
                            )

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setDraftOverrides((current) => ({
                                    ...current,
                                    [question.id]: {
                                      ...draft,
                                      selectedOptions: isActive
                                        ? []
                                        : [option.value],
                                      answerStatus: 'answered',
                                    },
                                  }))
                                }
                                className={`rounded-[18px] border px-4 py-4 text-left text-sm ${
                                  isActive
                                    ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary'
                                    : 'border-border-subtle bg-app-bg text-text-secondary hover:border-border-strong'
                                }`}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-2">
                        <label className="text-sm text-text-secondary">
                          {question.inputHint || text.detailInput}
                        </label>
                        {question.fieldType === 'text' ? (
                          <Input
                            value={draft.customInput}
                            onChange={(event) =>
                              setDraftOverrides((current) => ({
                                ...current,
                                [question.id]: {
                                  ...draft,
                                  customInput: event.target.value,
                                  answerStatus: 'answered',
                                },
                              }))
                            }
                            placeholder={text.shortPlaceholder}
                          />
                        ) : (
                          <Textarea
                            value={draft.customInput}
                            onChange={(event) =>
                              setDraftOverrides((current) => ({
                                ...current,
                                [question.id]: {
                                  ...draft,
                                  customInput: event.target.value,
                                  answerStatus: 'answered',
                                },
                              }))
                            }
                            placeholder={text.longPlaceholder}
                          />
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(['answered', 'uncertain', 'skipped'] as const)
                          .filter((status) => status !== 'skipped' || question.allowSkip)
                          .map((status) => (
                            <Button
                              key={status}
                              variant={
                                draft.answerStatus === status ? 'secondary' : 'ghost'
                              }
                              size="sm"
                              onClick={() =>
                                setDraftOverrides((current) => ({
                                  ...current,
                                  [question.id]: {
                                    ...draft,
                                    answerStatus: status,
                                  },
                                }))
                              }
                            >
                              {answerStatusLabels[status]}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )
                })}

                <Button
                  onClick={() =>
                    void submitMutation.mutateAsync(toAnswers(session, drafts))
                  }
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {text.submitAnswers}
                </Button>
              </>
            ) : showThinkingAnimation ? (
              <div className="space-y-4">
                <GoldenSandLoader label={`${statusLabel(liveStatus)}...`} />
                <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-5">
                  <p className="text-sm font-medium text-text-primary">
                    {text.thinkingTitle}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-text-secondary">
                    {currentFocus || lastStopReason || text.thinkingFallback}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-5 text-sm leading-7 text-text-secondary">
                {text.noPendingQuestions}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4 xl:grid xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_auto] xl:space-y-0 xl:gap-4">
          <Card className="overflow-hidden p-0 xl:min-h-0 xl:flex xl:flex-col">
            <div className="border-b border-border-subtle p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Brain className="size-5 text-gold-primary" />
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {text.statusTitle}
                    </h2>
                    <p className="text-sm leading-7 text-text-secondary">
                      {text.statusDescription}
                    </p>
                  </div>
                </div>
                <Badge
                  tone={
                    session.status === 'FAILED'
                      ? 'warning'
                      : session.status === 'COMPLETED'
                        ? 'success'
                        : 'gold'
                  }
                >
                  {statusLabel(liveStatus)}
                </Badge>
              </div>
            </div>

            <div className="space-y-4 p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-4 scroll-shell">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                    {text.currentFocus}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-text-secondary">
                    {currentFocus || text.currentFocusFallback}
                  </p>
                </div>
                <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                    {text.lastStopReason}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-text-secondary">
                    {lastStopReason || text.lastStopReasonFallback}
                  </p>
                </div>
              </div>

              {session.status === 'FAILED' ? (
                <div className="rounded-[20px] border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-4 text-sm leading-7 text-[#f1cbc6]">
                  {session.errorMessage || text.failedFallback}
                </div>
              ) : null}

              <div className="space-y-3">
                {liveStages.map((stage) => (
                  <div
                    key={stage.id}
                    className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">
                          {stage.title}
                        </p>
                        <p className="mt-1 text-sm leading-7 text-text-secondary">
                          {stage.description}
                        </p>
                      </div>
                      <Badge tone={toneForStage(stage.status)}>
                        {stageStatusLabels[stage.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              {text.artifactsTitle}
            </h2>

            <div className="space-y-3">
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Search className="size-4 text-gold-primary" />
                  <span className="font-medium">{text.searchTasks}</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {(progress?.pendingSearchTasks?.length ??
                    session.searchTasks.length) || 0}{' '}
                  {text.itemSuffix}
                </p>
              </div>

              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Clock3 className="size-4 text-gold-primary" />
                  <span className="font-medium">{text.answeredQuestions}</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {session.answers.length} {text.itemSuffix}
                </p>
              </div>

              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <TableProperties className="size-4 text-gold-primary" />
                  <span className="font-medium">{text.chartPreview}</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {progress?.chartArtifacts?.length ??
                    session.chartArtifacts?.length ??
                    0}{' '}
                  {text.itemSuffix}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
