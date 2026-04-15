import { Children, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileSearch,
  Filter,
  Search,
  Sigma,
  Sparkles,
} from 'lucide-react'
import type { TFunction } from 'i18next'

import { Skeleton } from '@/components/feedback/skeleton'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Textarea } from '@/components/ui/field'
import { useAppStore } from '@/lib/store/app-store'
import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/format'
import {
  calculationTitle,
  confidenceMeta,
  currentUnderstanding,
  evidenceDomain,
  evidenceFreshnessMeta,
  formatRelativeTime,
  modeLabel,
  sessionKeyConclusion,
  statusMeta,
} from '@/features/analysis/lib/view-models'
import type {
  AnalysisSession,
  CalculationTask,
  ClarificationQuestion,
  ConclusionType,
  EvidenceItem,
} from '@/types'

export interface ClarificationDraftValue {
  selectedOptions: string[]
  customInput: string
  answerStatus: 'answered' | 'skipped' | 'uncertain' | 'declined'
}

function dotClass(tone: BadgeProps['tone']) {
  if (tone === 'success') return 'bg-success'
  if (tone === 'warning') return 'bg-warning'
  if (tone === 'danger') return 'bg-danger'
  if (tone === 'gold') return 'bg-accent-violet'
  if (tone === 'primary') return 'bg-primary'
  if (tone === 'info') return 'bg-info'
  return 'bg-text-muted'
}

function badgeWithDot(tone: BadgeProps['tone'], label: string) {
  return (
    <Badge tone={tone}>
      <span className={cn('status-dot', dotClass(tone))} />
      {label}
    </Badge>
  )
}

function sourceTypeMeta(
  item: EvidenceItem,
  t: TFunction,
): { label: string; tone: BadgeProps['tone'] } {
  if (item.sourceType === 'user') {
    return { label: t('analysis.decisionUi.sourceTypes.userProvided'), tone: 'primary' }
  }

  if (item.sourceType === 'internal') {
    return { label: t('analysis.decisionUi.sourceTypes.research'), tone: 'gold' }
  }

  const hostname = evidenceDomain(item.sourceUrl)
  const url = item.sourceUrl.toLowerCase()

  if (
    hostname.includes('etherscan') ||
    hostname.includes('blockscout') ||
    hostname.includes('arbiscan') ||
    hostname.includes('basescan') ||
    hostname.includes('solscan') ||
    hostname.includes('defillama')
  ) {
    return { label: t('analysis.decisionUi.sourceTypes.onChain'), tone: 'info' }
  }

  if (
    url.includes('/docs/') ||
    hostname.startsWith('docs.') ||
    hostname.includes('hashkeychain.net')
  ) {
    return { label: t('analysis.decisionUi.sourceTypes.protocolDocs'), tone: 'primary' }
  }

  if (
    hostname.endsWith('.gov') ||
    hostname.includes('sec.gov') ||
    hostname.includes('hkma.gov.hk') ||
    hostname.includes('sfc.hk') ||
    hostname.includes('fca.org') ||
    hostname.includes('esma.europa')
  ) {
    return { label: t('analysis.decisionUi.sourceTypes.officialRegulator'), tone: 'info' }
  }

  if (
    hostname.includes('research') ||
    hostname.includes('messari') ||
    hostname.includes('galaxy.com') ||
    hostname.includes('binance.com/en/research')
  ) {
    return { label: t('analysis.decisionUi.sourceTypes.research'), tone: 'gold' }
  }

  if (
    hostname.includes('news') ||
    hostname.includes('coindesk') ||
    hostname.includes('cointelegraph') ||
    hostname.includes('reuters') ||
    hostname.includes('bloomberg') ||
    hostname.includes('prnewswire')
  ) {
    return { label: t('analysis.decisionUi.sourceTypes.news'), tone: 'warning' }
  }

  return { label: t('analysis.decisionUi.sourceTypes.research'), tone: 'neutral' }
}

function calculationCategory(taskType: string, t: TFunction) {
  const lower = taskType.toLowerCase()
  if (lower.includes('break-even') || lower.includes('breakeven')) {
    return { label: t('analysis.decisionUi.calculationCategories.breakeven'), tone: 'info' as const }
  }
  if (lower.includes('budget')) {
    return { label: t('analysis.decisionUi.calculationCategories.budgetRange'), tone: 'primary' as const }
  }
  if (lower.includes('opportunity')) {
    return { label: t('analysis.decisionUi.calculationCategories.opportunityCost'), tone: 'gold' as const }
  }
  if (lower.includes('sensitivity')) {
    return { label: t('analysis.decisionUi.calculationCategories.sensitivity'), tone: 'warning' as const }
  }
  if (lower.includes('fee')) {
    return { label: t('analysis.decisionUi.calculationCategories.feeDrag'), tone: 'warning' as const }
  }
  if (lower.includes('lock') || lower.includes('liquid')) {
    return { label: t('analysis.decisionUi.calculationCategories.liquidityWindow'), tone: 'info' as const }
  }
  return { label: taskType.replace(/-/g, ' '), tone: 'neutral' as const }
}

function calculationStatusMeta(task: CalculationTask, t: TFunction) {
  if (task.status === 'failed' || task.validationState === 'rejected') {
    return { label: t('analysis.decisionUi.calculationStates.needsReview'), tone: 'danger' as const }
  }
  if (task.validationState === 'pending') {
    return { label: t('analysis.decisionUi.calculationStates.pendingValidation'), tone: 'warning' as const }
  }
  if (task.status === 'running') {
    return { label: t('analysis.decisionUi.calculationStates.running'), tone: 'primary' as const }
  }
  return { label: t('analysis.decisionUi.calculationStates.ready'), tone: 'success' as const }
}

function conclusionTone(type: ConclusionType) {
  if (type === 'fact') return 'info' as const
  if (type === 'estimate') return 'gold' as const
  return 'warning' as const
}

function clarificationStateMeta(value: ClarificationDraftValue, t: TFunction) {
  if (value.answerStatus === 'answered') {
    return { label: t('analysis.decisionUi.clarificationStates.answered'), tone: 'success' as const }
  }
  if (value.answerStatus === 'uncertain') {
    return { label: t('analysis.decisionUi.clarificationStates.uncertain'), tone: 'warning' as const }
  }
  if (value.answerStatus === 'skipped') {
    return { label: t('analysis.decisionUi.clarificationStates.skipped'), tone: 'neutral' as const }
  }
  return { label: t('analysis.decisionUi.clarificationStates.pending'), tone: 'primary' as const }
}

function clarificationSummary(
  question: ClarificationQuestion,
  value: ClarificationDraftValue,
) {
  const optionMap = new Map((question.options ?? []).map((option) => [option.value, option.label]))
  const selectedLabels = value.selectedOptions
    .map((selected) => optionMap.get(selected) ?? selected)
    .filter(Boolean)

  if (selectedLabels.length && value.customInput.trim()) {
    return `${selectedLabels.join(', ')} · ${value.customInput.trim()}`
  }
  if (selectedLabels.length) {
    return selectedLabels.join(', ')
  }
  if (value.customInput.trim()) {
    return value.customInput.trim()
  }
  return ''
}

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status)
  return badgeWithDot(meta.tone, meta.label)
}

export const StatusChip = StatusBadge

export function ConfidenceBadge({ confidence }: { confidence?: number }) {
  const meta = confidenceMeta(confidence)
  return (
    <Badge tone={meta.tone}>
      <span className={cn('status-dot', dotClass(meta.tone))} />
      {meta.label}
      {typeof confidence === 'number' ? ` · ${Math.round(confidence * 100)}%` : ''}
    </Badge>
  )
}

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative min-w-[220px] flex-1', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <Input {...props} className="pl-10" />
    </div>
  )
}

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const items = Children.toArray(children)
  const primaryItem = items[0]
  const secondaryItems = items.slice(1)
  const hasSecondary = secondaryItems.length > 0

  return (
    <>
      <div className={cn('panel-card hidden flex-wrap items-center gap-3 rounded-[24px] p-4 lg:flex', className)}>
        {items}
      </div>

      <div className={cn('space-y-3 lg:hidden', className)}>
        {primaryItem ? <div className="panel-card rounded-[24px] p-3">{primaryItem}</div> : null}
        {hasSecondary ? (
          <div className="panel-card rounded-[24px] p-3">
            <Button variant="secondary" className="w-full justify-between" onClick={() => setMobileOpen(true)}>
              {t('analysis.decisionUi.filters')}
              <Filter className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <DetailDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title={t('analysis.decisionUi.filters')}
        description={t('analysis.decisionUi.filtersDescription')}
      >
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="space-y-3">
              {item}
            </div>
          ))}
          <Button className="w-full" onClick={() => setMobileOpen(false)}>
            {t('analysis.decisionUi.applyFilters')}
          </Button>
        </div>
      </DetailDrawer>
    </>
  )
}

export function SectionCard({
  actions,
  children,
  className,
  description,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
  description?: string
  title: string
}) {
  return (
    <Card className={cn('space-y-5 p-5 md:p-6', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-text-primary">{title}</h2>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-text-secondary">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  )
}

export function MetricCard({
  detail,
  title,
  tone = 'neutral',
  value,
}: {
  detail: string
  title: string
  tone?: 'neutral' | 'brand' | 'success' | 'warning'
  value: string
}) {
  const toneClass =
    tone === 'brand'
      ? 'bg-[linear-gradient(180deg,rgba(22,42,70,0.96),rgba(15,27,49,0.92))] border-[rgba(79,124,255,0.24)]'
      : tone === 'success'
        ? 'bg-[linear-gradient(180deg,rgba(16,49,46,0.94),rgba(12,33,31,0.9))] border-[rgba(34,197,94,0.22)]'
        : tone === 'warning'
          ? 'bg-[linear-gradient(180deg,rgba(67,43,16,0.9),rgba(40,28,13,0.92))] border-[rgba(245,158,11,0.24)]'
          : 'bg-[linear-gradient(180deg,rgba(19,34,58,0.94),rgba(15,27,49,0.92))]'

  return (
    <Card className={cn('space-y-3 p-5', toneClass)}>
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      <p className="metric-value text-[1.95rem] font-semibold leading-none text-text-primary">{value}</p>
      <p className="text-sm leading-6 text-text-secondary">{detail}</p>
    </Card>
  )
}

export function LoadingState({
  description = 'Pulling the latest analysis state.',
  title = 'Loading',
}: {
  description?: string
  title?: string
}) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-text-primary">
          {title === 'Loading' ? t('common.loading') : title}
        </h3>
        <p className="text-sm text-text-secondary">
          {description === 'Pulling the latest analysis state.'
            ? t('analysis.decisionUi.loadingDescription')
            : description}
        </p>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-[18px]" />
        <Skeleton className="h-12 w-full rounded-[18px]" />
        <Skeleton className="h-32 w-full rounded-[20px]" />
      </div>
    </Card>
  )
}

export const SkeletonState = LoadingState

export function ErrorState({
  action,
  description,
  title,
}: {
  action?: ReactNode
  description: string
  title: string
}) {
  return (
    <Card className="space-y-4 border-[rgba(244,63,94,0.28)] bg-[linear-gradient(180deg,rgba(53,18,29,0.9),rgba(34,12,19,0.88))] p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <p className="text-sm leading-6 text-text-secondary">{description}</p>
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </Card>
  )
}

export function SourceBadge({ item }: { item: EvidenceItem }) {
  const { t } = useTranslation()
  const sourceType = sourceTypeMeta(item, t)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={sourceType.tone}>{sourceType.label}</Badge>
      <Badge tone="neutral">{evidenceDomain(item.sourceUrl)}</Badge>
    </div>
  )
}

export function SourceCard({
  item,
  linkedConclusionCount,
  onOpen,
  sessionTitle,
}: {
  item: EvidenceItem
  linkedConclusionCount: number
  onOpen?: () => void
  sessionTitle?: string
}) {
  const { t } = useTranslation()
  const freshness = evidenceFreshnessMeta(item)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge item={item} />
            <ConfidenceBadge confidence={item.confidence} />
            <Badge tone={freshness.tone}>{freshness.label}</Badge>
          </div>
          <h3 className="text-base font-semibold text-text-primary">{item.title}</h3>
          <p className="text-sm text-text-secondary">
            {item.sourceName} · {t('analysis.decisionUi.sourceCard.fetched', { value: formatRelativeTime(item.fetchedAt) })}
          </p>
        </div>
        {onOpen ? (
          <Button variant="secondary" size="sm" onClick={onOpen}>
            {t('analysis.decisionUi.sourceCard.viewDetails')}
            <ArrowUpRight className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sourceCard.sourceSummary')}</p>
          <p className="text-sm leading-6 text-text-secondary">{item.summary}</p>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sourceCard.extractedFacts')}</p>
            <ul className="space-y-2 text-sm leading-6 text-text-secondary">
              {item.extractedFacts.slice(0, 3).map((fact) => (
                <li key={fact} className="flex gap-2">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-info" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-3 rounded-[20px] border border-border-subtle bg-bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sourceCard.usageFreshness')}</p>
          <div className="space-y-2 text-sm leading-6 text-text-secondary">
            <p>{t('analysis.decisionUi.sourceCard.session')}: {sessionTitle ?? t('analysis.decisionUi.sourceCard.unassigned')}</p>
            <p>{t('analysis.decisionUi.sourceCard.linkedConclusions')}: {linkedConclusionCount}</p>
            <p>{t('analysis.decisionUi.sourceCard.freshnessNote')}: {item.freshness?.staleWarning ?? freshness.label}</p>
          </div>
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent-cyan hover:text-text-primary"
          >
            {t('analysis.decisionUi.sourceCard.openOriginalSource')}
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    </Card>
  )
}

export const EvidenceCard = SourceCard

export function ConclusionCard({
  basisCount,
  confidence,
  title,
  type,
}: {
  basisCount: number
  confidence?: number
  title: string
  type: 'fact' | 'estimate' | 'inference'
}) {
  const { t } = useTranslation()
  const label =
    type === 'fact'
      ? t('analysis.decisionUi.conclusionTypes.fact')
      : type === 'estimate'
        ? t('analysis.decisionUi.conclusionTypes.estimate')
        : t('analysis.decisionUi.conclusionTypes.inference')

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={conclusionTone(type)}>{label}</Badge>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <p className="text-sm leading-6 text-text-primary">{title}</p>
      <p className="text-xs text-text-muted">{t('analysis.decisionUi.evidenceLinks')}: {basisCount}</p>
    </Card>
  )
}

export function CalculationCard({
  sessionTitle,
  task,
}: {
  sessionTitle?: string
  task: CalculationTask
}) {
  const { t } = useTranslation()
  const category = calculationCategory(task.taskType, t)
  const status = calculationStatusMeta(task, t)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={category.tone}>{category.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <h3 className="text-base font-semibold text-text-primary">{calculationTitle(task)}</h3>
          <p className="text-sm text-text-secondary">
            {sessionTitle ?? t('analysis.decisionUi.calculationCard.analysisCalculation')} · {formatRelativeTime(task.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.calculationCard.formula')}</p>
          <p className="mono mt-3 text-sm leading-6 text-text-primary">{task.formulaExpression}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(task.inputParams).map(([key, value]) => (
              <div key={key} className="rounded-[16px] border border-border-subtle bg-bg-surface px-3 py-2.5 text-sm">
                <span className="text-text-muted">{key}</span>
                <p className="mono mt-1 text-text-primary">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-border-subtle bg-bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.calculationCard.result')}</p>
          <p className="metric-value mt-3 text-[1.9rem] font-semibold text-text-primary">{task.result}</p>
          <p className="mt-1 text-sm text-text-secondary">{task.units}</p>
          <p className="mt-4 text-sm leading-6 text-text-secondary">
            {task.errorMargin ?? task.notes ?? task.failureReason ?? t('analysis.decisionUi.calculationCard.noAdditionalNote')}
          </p>
        </div>
      </div>
    </Card>
  )
}

export function SessionCard({
  actions,
  confidence,
  evidenceCount,
  calculationCount,
  onOpen,
  session,
}: {
  actions?: ReactNode
  confidence?: number
  evidenceCount?: number
  calculationCount?: number
  onOpen?: () => void
  session: AnalysisSession
}) {
  const { t } = useTranslation()
  const resolvedEvidenceCount = evidenceCount ?? session.evidence.length
  const resolvedCalculationCount = calculationCount ?? session.calculations.length

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{modeLabel(session.mode)}</Badge>
            <StatusBadge status={session.status} />
            <ConfidenceBadge confidence={confidence} />
          </div>
          <h3 className="line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-text-primary">
            {session.problemStatement}
          </h3>
          <p className="text-sm text-text-secondary">{t('analysis.decisionUi.sessionCard.updated', { value: formatRelativeTime(session.updatedAt) })}</p>
        </div>
        {onOpen ? (
          <Button variant="secondary" size="sm" onClick={onOpen}>
            {t('analysis.decisionUi.sessionCard.openSession')}
            <ArrowUpRight className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="rounded-[18px] border border-border-subtle bg-app-bg-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sessionCard.keyConclusion')}</p>
          <p className="mt-2 text-sm leading-6 text-text-primary">{sessionKeyConclusion(session)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sessionCard.currentUnderstanding')}</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
              {currentUnderstanding(session).slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[18px] border border-border-subtle bg-bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{t('analysis.decisionUi.sessionCard.signalCoverage')}</p>
            <div className="mt-2 space-y-1.5 text-sm leading-6 text-text-secondary">
              <p>{t('analysis.decisionUi.sessionCard.evidenceItems', { count: resolvedEvidenceCount })}</p>
              <p>{t('analysis.decisionUi.sessionCard.calculations', { count: resolvedCalculationCount })}</p>
            </div>
          </div>
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  )
}

export function SessionRow({
  actions,
  confidence,
  evidenceCount,
  calculationCount,
  onOpen,
  session,
}: {
  actions?: ReactNode
  confidence?: number
  evidenceCount: number
  calculationCount?: number
  onOpen?: () => void
  session: AnalysisSession
}) {
  return (
    <div
      className="grid cursor-pointer gap-4 rounded-[24px] border border-border-subtle bg-panel px-4 py-4 transition hover:border-border-strong hover:bg-panel-strong xl:grid-cols-[2.4fr_1fr_1fr_1fr_1.8fr_1.3fr_0.8fr_0.8fr_auto]"
      onClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[data-session-row-action="true"]')
        ) {
          return
        }
        onOpen?.()
      }}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('[data-session-row-action="true"]')
        ) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="truncate font-semibold text-text-primary">{session.problemStatement}</p>
        <p className="line-clamp-2 text-sm text-text-secondary">{sessionKeyConclusion(session)}</p>
      </div>
      <div className="text-sm text-text-secondary">{modeLabel(session.mode)}</div>
      <div>
        <StatusBadge status={session.status} />
      </div>
      <div className="text-sm text-text-secondary">{formatRelativeTime(session.updatedAt)}</div>
      <div className="line-clamp-2 text-sm text-text-secondary">{session.lastInsight}</div>
      <div>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <div className="text-sm text-text-secondary">{evidenceCount}</div>
      <div className="text-sm text-text-secondary">{calculationCount ?? session.calculations.length}</div>
      <div className="flex flex-wrap items-center justify-start gap-2" data-session-row-action="true">
        {actions}
      </div>
    </div>
  )
}

export const SessionRowCard = SessionRow

export function ClarificationQuestionCard({
  onChange,
  question,
  value,
}: {
  onChange: (next: ClarificationDraftValue) => void
  question: ClarificationQuestion
  value: ClarificationDraftValue
}) {
  const { t } = useTranslation()
  const currentSliderValue = Number(value.selectedOptions[0] ?? question.recommended?.[0] ?? question.min ?? 5)
  const meta = clarificationStateMeta(value, t)
  const summary = clarificationSummary(question, value)
  const [expandMode, setExpandMode] = useState<'auto' | 'expanded' | 'collapsed'>('auto')
  const expanded =
    expandMode === 'expanded'
      ? true
      : expandMode === 'collapsed'
        ? false
        : value.answerStatus !== 'answered' || !summary

  const updateSelectedOption = (nextValue: string) => {
    if (question.fieldType === 'multi-choice') {
      const exists = value.selectedOptions.includes(nextValue)
      onChange({
        ...value,
        answerStatus: 'answered',
        selectedOptions: exists
          ? value.selectedOptions.filter((item) => item !== nextValue)
          : [...value.selectedOptions, nextValue],
      })
      return
    }

    onChange({
      ...value,
      answerStatus: 'answered',
      selectedOptions: [nextValue],
    })
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t('analysis.decisionUi.clarificationCard.question')}</Badge>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <h3 className="text-base font-semibold text-text-primary">{question.question}</h3>
          <div className="flex items-start gap-2 rounded-[18px] border border-border-subtle bg-app-bg-elevated px-3 py-3 text-sm leading-6 text-text-secondary">
            <CircleHelp className="mt-0.5 size-4 shrink-0 text-info" />
            <span>{question.purpose}</span>
          </div>
        </div>
        {summary ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setExpandMode((current) =>
                current === 'expanded' || (current === 'auto' && expanded)
                  ? 'collapsed'
                  : 'expanded',
              )
            }
          >
            {expanded ? t('analysis.decisionUi.clarificationCard.hide') : t('analysis.decisionUi.clarificationCard.edit')}
            <ChevronRight className={cn('size-4 transition', expanded ? 'rotate-90' : '')} />
          </Button>
        ) : null}
      </div>

      {!expanded && summary ? (
        <div className="rounded-[18px] border border-[rgba(34,197,94,0.18)] bg-[rgba(20,184,122,0.1)] px-4 py-3 text-sm leading-6 text-text-primary">
          {summary}
        </div>
      ) : null}

      {expanded ? (
        <>
          {question.fieldType === 'slider' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t('analysis.decisionUi.clarificationCard.currentAnswer')}</span>
                <span className="mono rounded-full bg-primary-soft px-3 py-1 text-text-primary">
                  {currentSliderValue}
                  {question.unit ?? ''}
                </span>
              </div>
              <input
                type="range"
                min={question.min ?? 1}
                max={question.max ?? 10}
                value={currentSliderValue}
                onChange={(event) =>
                  onChange({
                    ...value,
                    answerStatus: 'answered',
                    selectedOptions: [event.target.value],
                  })
                }
                className="w-full accent-[var(--primary)]"
              />
            </div>
          ) : null}

          {question.options?.length ? (
            <div className="flex flex-wrap gap-2.5">
              {question.options.map((option) => {
                const active = value.selectedOptions.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateSelectedOption(option.value)}
                    className={cn(
                      'interactive-lift rounded-full border px-3.5 py-2 text-sm',
                      active
                        ? 'border-[rgba(79,124,255,0.32)] bg-primary-soft text-text-primary'
                        : 'border-border-subtle bg-bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}

          {question.allowCustomInput ? (
            question.fieldType === 'text' ? (
              <Input
                value={value.customInput}
                placeholder={question.inputHint || t('analysis.decisionUi.clarificationCard.addCustomContext')}
                onChange={(event) =>
                  onChange({
                    ...value,
                    answerStatus: 'answered',
                    customInput: event.target.value,
                  })
                }
              />
            ) : (
              <Textarea
                value={value.customInput}
                placeholder={
                  question.inputHint ||
                  question.exampleAnswer ||
                  t('analysis.decisionUi.clarificationCard.addAnythingThatChangesRecommendation')
                }
                className="min-h-24"
                onChange={(event) =>
                  onChange({
                    ...value,
                    answerStatus: 'answered',
                    customInput: event.target.value,
                  })
                }
              />
            )
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange({ ...value, answerStatus: 'uncertain' })}>
          {t('analysis.decisionUi.clarificationCard.markUncertain')}
        </Button>
        {question.allowSkip ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                ...value,
                answerStatus: 'skipped',
                selectedOptions: [],
                customInput: '',
              })
            }
          >
            {t('analysis.decisionUi.clarificationCard.skipForNow')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('panel-card sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 p-4', className)}>
      {children}
    </div>
  )
}

export function WorklogCard({
  detail,
  icon,
  title,
}: {
  detail: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-4">
      <div className="mt-1 flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{detail}</p>
      </div>
    </div>
  )
}

export function ReportSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode
  description?: string
  id: string
  title: string
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <Card className="space-y-5 p-6">
        <div className="space-y-1.5">
          <h2 className="apple-kicker text-left">{title}</h2>
          {description ? <p className="max-w-3xl text-sm leading-6 text-text-secondary">{description}</p> : null}
        </div>
        {children}
      </Card>
    </section>
  )
}

export const ReportSectionCard = ReportSection

export function ChartPanel({
  children,
  description,
  title,
}: {
  children: ReactNode
  description?: string
  title: string
}) {
  return (
    <SectionCard title={title} description={description}>
      {children}
    </SectionCard>
  )
}

export function MiniFact({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-[20px] border border-border-subtle bg-app-bg-elevated p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  )
}

export function SmallMetaList({
  items,
}: {
  items: Array<{ label: string; value: string }>
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <MiniFact key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  )
}

export function PreviewNote({
  children,
  icon,
}: {
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 rounded-[18px] border border-[rgba(34,211,238,0.18)] bg-[rgba(34,211,238,0.08)] px-4 py-3 text-sm leading-6 text-text-secondary">
      {icon ?? <Sparkles className="mt-0.5 size-4 shrink-0 text-info" />}
      <span>{children}</span>
    </div>
  )
}

export function DetailDrawer({
  actions,
  children,
  description,
  onClose,
  open,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  description?: string
  onClose: () => void
  open: boolean
  title: string
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-[rgba(2,8,20,0.68)]" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 md:items-center">
          <DialogPanel className="panel-card w-full max-w-3xl space-y-5 rounded-[28px] p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <h3 className="text-xl font-semibold text-text-primary">{title}</h3>
                {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
            {children}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

export function ResourceKicker({
  fetchedAt,
  url,
}: {
  fetchedAt: string
  url: string
}) {
  const locale = useAppStore((state) => state.locale)
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
      <span className="inline-flex items-center gap-1">
        <Clock3 className="size-3.5" />
        {formatDateTime(fetchedAt, locale)}
      </span>
      <span className="inline-flex items-center gap-1">
        <FileSearch className="size-3.5" />
        {evidenceDomain(url)}
      </span>
    </div>
  )
}

export function CalculationEmptyHint() {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-border-subtle bg-app-bg-elevated px-4 py-4 text-sm leading-6 text-text-secondary">
      <Sigma className="mt-0.5 size-4 shrink-0 text-info" />
      <span>
        {t('analysis.decisionUi.calculationEmptyHint')}
      </span>
    </div>
  )
}

export { EmptyState }
