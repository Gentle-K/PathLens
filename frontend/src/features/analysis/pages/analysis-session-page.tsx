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
import { useNavigate, useParams } from 'react-router-dom'

import { GoldenSandLoader } from '@/components/feedback/golden-sand-loader'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/field'
import { useApiAdapter } from '@/lib/api/use-api-adapter'
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

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    waiting_for_user_clarification_answers: '等待用户回答问题',
    waiting_for_llm_clarification_questions: 'AI 正在生成追问',
    waiting_for_llm_round_planning: 'AI 正在规划下一轮分析',
    llm_round_plan_ready: 'AI 已完成本轮规划',
    waiting_for_mcp_execution: 'AI 正在安排搜索、计算和图表任务',
    searching_web_for_evidence: '搜索网页中',
    searching_and_synthesizing: '搜索并综合证据中',
    running_deterministic_calculations: '执行 RWA 风险与收益计算中',
    preparing_visualizations: '生成分布图、雷达图和矩阵中',
    waiting_for_llm_report_generation: 'AI 正在整理 RWA 报告',
    report_generated_waiting_for_delivery: '结果已生成，正在整理展示',
    running_analysis_pipeline: '分析思考中',
    analyzing: '分析思考中',
    completed: '分析完成',
    failed: '分析失败',
    llm_call_failed: '模型调用失败',
    unexpected_error: '发生异常',
  }

  return labels[status ?? ''] ?? '等待系统推进'
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
  const [draftOverrides, setDraftOverrides] = useState<Record<string, DraftAnswer>>({})

  const sessionQuery = useQuery({
    queryKey: ['analysis', sessionId],
    queryFn: () => adapter.analysis.getById(sessionId),
  })

  const rwaBootstrapQuery = useQuery({
    queryKey: ['rwa', 'bootstrap'],
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
        正在加载分析会话...
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="第 2 页 / 分析界面"
        title={session.problemStatement}
        description="在这里补充条款、流动性和 KYC 关键信息，并实时查看当前是在搜证据、算 RiskVector、跑持有期模拟，还是整理交易草案。"
      />

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">本金</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.investmentAmount.toLocaleString('zh-CN')} {session.intakeContext.baseCurrency}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">持有期</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.holdingPeriodDays} 天
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">风险偏好</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.riskTolerance}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">流动性</p>
            <p className="mt-2 font-medium text-text-primary">
              {session.intakeContext.liquidityNeed}
            </p>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated px-4 py-3">
            <p className="text-xs text-text-muted">KYC</p>
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

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <CircleHelp className="size-5 text-gold-primary" />
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  AI 追问
                </h2>
                <p className="text-sm leading-7 text-text-secondary">
                  回答越具体，后续的 RiskVector、持有期模拟和执行建议就越可靠。
                </p>
              </div>
            </div>

            {pendingQuestions.length ? (
              <div className="space-y-4">
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
                          示例回答：{question.exampleAnswer}
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
                          {question.inputHint || '补充说明'}
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
                            placeholder="补充关键事实、约束或你最担心的问题"
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
                            placeholder="用自然语言补充背景、预算、约束或偏好"
                          />
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant={
                            draft.answerStatus === 'answered'
                              ? 'secondary'
                              : 'ghost'
                          }
                          size="sm"
                          onClick={() =>
                            setDraftOverrides((current) => ({
                              ...current,
                              [question.id]: {
                                ...draft,
                                answerStatus: 'answered',
                              },
                            }))
                          }
                        >
                          正常回答
                        </Button>
                        <Button
                          variant={
                            draft.answerStatus === 'uncertain'
                              ? 'secondary'
                              : 'ghost'
                          }
                          size="sm"
                          onClick={() =>
                            setDraftOverrides((current) => ({
                              ...current,
                              [question.id]: {
                                ...draft,
                                answerStatus: 'uncertain',
                              },
                            }))
                          }
                        >
                          暂不确定
                        </Button>
                        {question.allowSkip ? (
                          <Button
                            variant={
                              draft.answerStatus === 'skipped'
                                ? 'secondary'
                                : 'ghost'
                            }
                            size="sm"
                            onClick={() =>
                              setDraftOverrides((current) => ({
                                ...current,
                                [question.id]: {
                                  ...draft,
                                  answerStatus: 'skipped',
                                },
                              }))
                            }
                          >
                            跳过
                          </Button>
                        ) : null}
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
                  提交本轮回答
                </Button>
              </div>
            ) : showThinkingAnimation ? (
              <div className="space-y-4">
                <GoldenSandLoader label={`AI ${statusLabel(liveStatus)}...`} />
                <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-5">
                  <p className="text-sm font-medium text-text-primary">
                    当前没有新的追问，AI 正在继续推进分析。
                  </p>
                  <p className="mt-3 text-sm leading-7 text-text-secondary">
                    {currentFocus ||
                      lastStopReason ||
                      '系统正在搜索、计算或整理结果，请稍等片刻。'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-border-subtle bg-app-bg-elevated p-5 text-sm leading-7 text-text-secondary">
                当前没有待回答问题，结果页面准备好后会自动可用。
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-5 p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Brain className="size-5 text-gold-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    AI 当前状态
                  </h2>
                  <p className="text-sm leading-7 text-text-secondary">
                    这些状态直接来自后端当前会话，而不是前端本地猜测。
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

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                  当前焦点
                </p>
                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  {currentFocus || '等待系统推进下一步。'}
                </p>
              </div>
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                  最近停顿原因
                </p>
                <p className="mt-3 text-sm leading-7 text-text-secondary">
                  {lastStopReason || '当前没有额外停顿原因。'}
                </p>
              </div>
            </div>

            {session.status === 'FAILED' ? (
              <div className="rounded-[20px] border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-4 text-sm leading-7 text-[#f1cbc6]">
                {session.errorMessage ||
                  '分析失败，请检查后端日志或重新发起分析。'}
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
                      {stage.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              任务与产物
            </h2>

            <div className="space-y-3">
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Search className="size-4 text-gold-primary" />
                  <span className="font-medium">搜索任务</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {(progress?.pendingSearchTasks?.length ??
                    session.searchTasks.length) || 0}{' '}
                  项
                </p>
              </div>

              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Clock3 className="size-4 text-gold-primary" />
                  <span className="font-medium">已回答问题</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {session.answers.length} 项
                </p>
              </div>

              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <TableProperties className="size-4 text-gold-primary" />
                  <span className="font-medium">图表预览</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {progress?.chartArtifacts?.length ??
                    session.chartArtifacts?.length ??
                    0}{' '}
                  项
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
