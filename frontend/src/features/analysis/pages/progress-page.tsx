import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Hourglass } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { GoldenSandLoader } from '@/components/feedback/golden-sand-loader'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiAdapter } from '@/lib/api/use-api-adapter'

export function ProgressPage() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { sessionId = '' } = useParams()
  const adapter = useApiAdapter()
  const isZh = i18n.language.startsWith('zh')

  const progressQuery = useQuery({
    queryKey: ['analysis', sessionId, 'progress'],
    queryFn: () => adapter.analysis.getProgress(sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === 'COMPLETED' || query.state.data?.status === 'FAILED' ? false : 1400,
  })

  const progress = progressQuery.data

  useEffect(() => {
    if (progress?.status === 'CLARIFYING') {
      void navigate(`/analysis/session/${sessionId}/clarify`, { replace: true })
    }
  }, [navigate, progress?.status, sessionId])

  const stageText = {
    clarify: {
      title: isZh ? '梳理决策上下文' : 'Clarify decision context',
      description: isZh ? '补齐目标、约束与缺失的关键信息。' : 'Collect goals, constraints, and missing high-value facts.',
    },
    plan: {
      title: isZh ? '规划分析轮次' : 'Plan analysis round',
      description: isZh ? '后端正在准备搜索任务和第一版结论框架。' : 'Prepare search tasks and first-pass conclusions on the backend.',
    },
    evidence: {
      title: isZh ? '汇聚证据与图表' : 'Gather evidence',
      description: isZh ? '执行搜索、汇总证据，并生成预览图表。' : 'Execute search, gather evidence, and compose preview artifacts.',
    },
    report: {
      title: isZh ? '组装最终报告' : 'Assemble report',
      description: isZh ? '整合摘要、建议、依据与图表引用。' : 'Build the final report summary, recommendations, and chart references.',
    },
  }

  const failureMessage =
    progress?.errorMessage ??
    (isZh ? 'LLM 连续重试后仍然失败，请检查模型配置或稍后重试。' : 'The LLM failed after all retry attempts.')

  return (
    <div className="space-y-6" data-testid="progress-page">
      <PageHeader
        eyebrow={t('common.nextStep')}
        title={t('analysis.progressTitle')}
        description={t('analysis.progressSubtitle')}
        actions={
          progress?.status === 'COMPLETED' ? (
            <Button onClick={() => void navigate(`/analysis/session/${sessionId}/report`)}>
              {t('analysis.generateReport')}
            </Button>
          ) : null
        }
      />

      {progressQuery.isLoading && !progress ? (
        <Card className="p-6 text-sm text-text-secondary">
          {isZh ? '正在读取分析进度...' : 'Loading analysis progress...'}
        </Card>
      ) : null}

      {progressQuery.error ? (
        <Card className="space-y-3 border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-6">
          <h2 className="text-base font-semibold text-[#f7d4cf]">
            {isZh ? '分析进度读取失败' : 'Failed to load analysis progress'}
          </h2>
          <p className="text-sm leading-7 text-[#f1cbc6]">
            {isZh
              ? '当前无法获取后端进度快照，请稍后重试。'
              : 'The backend progress snapshot is unavailable right now. Please retry.'}
          </p>
          <div>
            <Button type="button" onClick={() => void progressQuery.refetch()}>
              {isZh ? '重试加载' : 'Retry'}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <GoldenSandLoader
          label={
            progress?.status === 'FAILED'
              ? failureMessage
              : progress?.status === 'COMPLETED'
                ? t('analysis.progressReadyHint')
                : progress?.currentStepLabel ?? (isZh ? '正在整理结构化分析结果' : 'Preparing structured analysis')
          }
        />

        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{t('analysis.progressStageTitle')}</h2>
              <Badge tone={progress?.status === 'COMPLETED' ? 'success' : progress?.status === 'FAILED' ? 'warning' : 'gold'}>
                {progress?.overallProgress ?? 0}%
              </Badge>
            </div>

            {progress?.status === 'FAILED' ? (
              <div className="rounded-[20px] border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.08)] p-4 text-sm leading-7 text-[#f1cbc6]">
                {failureMessage}
              </div>
            ) : null}

            <div className="space-y-3">
              {progress?.stages.map((stage) => {
                const localizedStage = stageText[stage.id as keyof typeof stageText]

                return (
                  <div key={stage.id} className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">{localizedStage?.title ?? stage.title}</p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {localizedStage?.description ?? stage.description}
                        </p>
                      </div>
                      {stage.status === 'completed' ? (
                        <CheckCircle2 className="size-5 text-[#ccebd7]" />
                      ) : (
                        <Hourglass className="size-5 text-gold-primary" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {progress ? (
            <Card className="space-y-3 p-6">
              <h2 className="text-lg font-semibold text-text-primary">
                {isZh ? '当前状态摘要' : 'Current status summary'}
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                  <p className="text-xs text-text-muted">{isZh ? '状态' : 'Status'}</p>
                  <p className="mt-2 text-sm text-text-primary">{progress.status}</p>
                </div>
                <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 md:col-span-2">
                  <p className="text-xs text-text-muted">{isZh ? '当前焦点' : 'Current focus'}</p>
                  <p className="mt-2 text-sm leading-7 text-text-primary">
                    {progress.currentFocus ?? (isZh ? '等待后端推进下一步。' : 'Waiting for the backend to advance.')}
                  </p>
                </div>
              </div>
              <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
                <p className="text-xs text-text-muted">{isZh ? '最近停顿原因' : 'Latest pause reason'}</p>
                <p className="mt-2 text-sm leading-7 text-text-primary">
                  {progress.lastStopReason ?? (isZh ? '当前没有额外停顿原因。' : 'There is no extra pause reason at the moment.')}
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
