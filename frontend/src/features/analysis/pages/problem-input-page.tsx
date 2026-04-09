import { useMutation } from '@tanstack/react-query'
import { Form, Formik } from 'formik'
import { Lightbulb, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as Yup from 'yup'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { AnalysisPendingView } from '@/features/analysis/components/analysis-pending-view'
import { useApiAdapter } from '@/lib/api/use-api-adapter'

export function ProblemInputPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const adapter = useApiAdapter()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessionFailure, setSessionFailure] = useState<string | null>(null)
  const mode = (searchParams.get('mode') as 'single-option' | 'multi-option' | null) ?? 'single-option'
  const isChinese = i18n.language.startsWith('zh')

  const promptSuggestions = isChinese
    ? [
        '我是否应该在大三参加海外交换项目？',
        '我是否应该买车，而不是继续依赖公共交通？',
        '我现在是应该申请研究生，还是先工作两年？',
      ]
    : [
        'Should I join an overseas exchange program in my junior year?',
        'Should I buy a car instead of continuing to rely on public transit?',
        'Should I apply for graduate school now or work for two years first?',
      ]

  const createMutation = useMutation({
    mutationFn: adapter.analysis.create,
    onSuccess: (session) => {
      if (session.status === 'FAILED') {
        setSessionFailure(
          session.errorMessage ??
            (isChinese ? 'LLM 在多次重试后仍然失败，请检查模型配置后再试。' : 'The LLM failed after all retry attempts.'),
        )
        return
      }

      setSessionFailure(null)
      void navigate(`/analysis/session/${session.id}/clarify`)
    },
  })

  if (createMutation.isPending) {
    return (
      <AnalysisPendingView
        eyebrow={t('common.nextStep')}
        title={isChinese ? 'AI 正在分析你的问题' : 'AI is analyzing your prompt'}
        description={
          isChinese
            ? '系统正在创建分析会话、整理问题背景，并生成第一轮高价值追问。'
            : 'The system is creating the session, organizing the problem context, and preparing the first clarification round.'
        }
        loaderLabel={
          isChinese ? 'AI 正在分析，请稍候，不要重复点击。' : 'The AI is analyzing now. Please wait without clicking again.'
        }
        stageLabel={isChinese ? '正在初始化' : 'Initializing'}
        stageTitle={isChinese ? '创建分析会话' : 'Creating analysis session'}
        stageDescription={
          isChinese
            ? '我们正在把你的问题转成结构化分析任务，完成后会自动进入补充信息页面。'
            : 'We are converting your prompt into a structured analysis task. You will move to clarification automatically when it is ready.'
        }
        tips={[
          isChinese ? '系统会提炼目标、约束和关键不确定性。' : 'The system is extracting goals, constraints, and key uncertainties.',
          isChinese ? '如果问题较复杂，这一步可能持续几秒。' : 'This step can take a few seconds for more complex prompts.',
        ]}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('common.nextStep')}
        title={t('analysis.intakeTitle')}
        description={t('analysis.intakeSubtitle')}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <Badge tone="gold">{mode === 'single-option' ? t('analysis.singleMode') : t('analysis.multiMode')}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const nextMode = mode === 'single-option' ? 'multi-option' : 'single-option'
                setSearchParams({ mode: nextMode })
              }}
            >
              {t('analysis.switchMode')}
            </Button>
          </div>

          <Formik
            initialValues={{
              problemStatement: promptSuggestions[0],
            }}
            validationSchema={Yup.object({
              problemStatement: Yup.string().min(12).required(),
            })}
            onSubmit={async (values) => {
              setSessionFailure(null)
              await createMutation.mutateAsync({
                mode,
                locale: isChinese ? 'zh' : 'en',
                problemStatement: values.problemStatement,
                intakeContext: {
                  investmentAmount: 10000,
                  baseCurrency: 'USDT',
                  preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf', 'hk-regulated-silver'],
                  holdingPeriodDays: 30,
                  riskTolerance: 'balanced',
                  liquidityNeed: 't_plus_3',
                  minimumKycLevel: 0,
                  walletAddress: '',
                  wantsOnchainAttestation: true,
                  additionalConstraints: '',
                },
              })
            }}
          >
            {({ values, handleChange, handleSubmit, setFieldValue, isSubmitting }) => (
              <Form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label htmlFor="problemStatement" className="text-sm text-text-secondary">
                    {t('analysis.problemStatementLabel')}
                  </label>
                  <Textarea
                    id="problemStatement"
                    name="problemStatement"
                    value={values.problemStatement}
                    onChange={handleChange}
                    placeholder={t('analysis.problemStatementPlaceholder')}
                    className="min-h-44 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-text-muted">{t('analysis.suggestions')}</p>
                  <div className="flex flex-wrap gap-2">
                    {promptSuggestions.map((suggestion) => {
                      const isActive = values.problemStatement === suggestion

                      return (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setFieldValue('problemStatement', suggestion)}
                          className={`interactive-lift rounded-full border px-4 py-2 text-sm transition ${
                            isActive
                              ? 'border-border-strong bg-[rgba(212,175,55,0.14)] text-text-primary shadow-[0_0_0_1px_rgba(249,228,159,0.08)]'
                              : 'border-border-subtle bg-app-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary'
                          }`}
                        >
                          {suggestion}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Button type="submit" disabled={createMutation.isPending || isSubmitting}>
                  <WandSparkles className="size-4" />
                  {t('analysis.startAnalysis')}
                </Button>

                {createMutation.error || sessionFailure ? (
                  <p className="rounded-2xl border border-[rgba(197,109,99,0.35)] bg-[rgba(197,109,99,0.12)] px-4 py-3 text-sm text-[#f7d4cf]">
                    {sessionFailure ??
                      (isChinese
                        ? '开始分析失败，请检查后端服务或稍后重试。'
                        : 'Failed to start the analysis. Please check the backend and try again.')}
                  </p>
                ) : null}
              </Form>
            )}
          </Formik>
        </Card>

        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-3 text-gold-primary">
            <Lightbulb className="size-5" />
            <h2 className="text-lg font-semibold text-text-primary">{t('analysis.suggestions')}</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {t('analysis.suggestionHint1')}
            </div>
            <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {t('analysis.suggestionHint2')}
            </div>
            <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4 text-sm leading-7 text-text-secondary">
              {t('analysis.suggestionHint3')}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
