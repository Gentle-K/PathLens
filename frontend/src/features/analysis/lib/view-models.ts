import { formatDistanceToNowStrict } from 'date-fns'

import type {
  AnalysisMode,
  AnalysisReport,
  AnalysisSession,
  CalculationTask,
  EvidenceItem,
  SessionStatus,
} from '@/types'

export function formatRelativeTime(value: string) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

export function modeLabel(mode: AnalysisMode) {
  return mode === 'strategy-compare' || mode === 'multi-option'
    ? 'Strategy compare'
    : 'Single-asset allocation'
}

export function modeSummary(mode: AnalysisMode) {
  return mode === 'strategy-compare' || mode === 'multi-option'
    ? 'Compare eligible RWA paths, execution friction, and monitoring trade-offs.'
    : 'Go deep on one target asset from wallet eligibility through execution.'
}

export function statusMeta(status: SessionStatus | string) {
  const mapping: Record<
    string,
    { label: string; tone: 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info' }
  > = {
    INIT: { label: 'Draft', tone: 'neutral' },
    CLARIFYING: { label: 'Clarifying', tone: 'info' },
    ANALYZING: { label: 'Analyzing', tone: 'gold' },
    READY_FOR_REPORT: { label: 'Ready for report', tone: 'info' },
    REPORTING: { label: 'Drafting report', tone: 'gold' },
    READY_FOR_EXECUTION: { label: 'Ready for execution', tone: 'success' },
    EXECUTING: { label: 'Executing', tone: 'gold' },
    MONITORING: { label: 'Monitoring', tone: 'info' },
    COMPLETED: { label: 'Completed', tone: 'success' },
    FAILED: { label: 'Failed', tone: 'danger' },
  }

  return mapping[status] ?? { label: status, tone: 'neutral' }
}

export function averageConfidence(values: number[]) {
  if (!values.length) {
    return undefined
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function sessionConfidence(
  session: AnalysisSession,
  report?: AnalysisReport,
) {
  const conclusionAverage = averageConfidence(
    session.conclusions.map((item) => item.confidence),
  )
  const evidenceAverage = averageConfidence(
    (report?.evidence ?? session.evidence).map((item) => item.confidence),
  )

  if (typeof conclusionAverage === 'number' && typeof evidenceAverage === 'number') {
    return (conclusionAverage + evidenceAverage) / 2
  }

  return conclusionAverage ?? evidenceAverage
}

export function confidenceMeta(confidence?: number) {
  if (typeof confidence !== 'number') {
    return {
      label: 'Needs evidence',
      tone: 'neutral' as const,
    }
  }

  if (confidence >= 0.82) {
    return { label: 'High confidence', tone: 'success' as const }
  }

  if (confidence >= 0.66) {
    return { label: 'Medium confidence', tone: 'gold' as const }
  }

  return { label: 'Low confidence', tone: 'warning' as const }
}

export function evidenceFreshnessMeta(item: EvidenceItem) {
  if (item.freshness) {
    const bucketTone =
      item.freshness.bucket === 'fresh'
        ? 'success'
        : item.freshness.bucket === 'aging'
          ? 'warning'
          : item.freshness.bucket === 'stale'
            ? 'danger'
            : 'neutral'

    return {
      label: item.freshness.label,
      tone: bucketTone as 'success' | 'warning' | 'danger' | 'neutral',
    }
  }

  const ageHours = Math.max(
    1,
    Math.round(
      (Date.now() - new Date(item.fetchedAt).getTime()) / (1000 * 60 * 60),
    ),
  )

  if (ageHours <= 48) {
    return { label: 'Fresh source', tone: 'success' as const }
  }

  if (ageHours <= 24 * 30) {
    return { label: 'Aging source', tone: 'warning' as const }
  }

  return { label: 'Potentially stale', tone: 'danger' as const }
}

export function evidenceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown'
  }
}

export function extractExecutiveSummary(markdown: string) {
  const plain = markdown
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return plain.find((line) => !line.endsWith(':')) ?? 'Structured report generated.'
}

export function reportState(
  session: AnalysisSession,
  report?: AnalysisReport,
) {
  if (session.status !== 'COMPLETED') {
    if (
      session.status === 'READY_FOR_EXECUTION' ||
      session.status === 'EXECUTING' ||
      session.status === 'MONITORING'
    ) {
      return { label: 'Execution-ready', tone: 'success' as const }
    }
    return { label: 'Draft', tone: 'neutral' as const }
  }

  const staleEvidence = (report?.evidence ?? []).some(
    (item) => evidenceFreshnessMeta(item).tone === 'danger',
  )

  if ((report?.unknowns?.length ?? 0) > 2 || (report?.warnings?.length ?? 0) > 1) {
    return { label: 'Needs review', tone: 'warning' as const }
  }

  if (staleEvidence) {
    return { label: 'Updated with new evidence', tone: 'info' as const }
  }

  return { label: 'Completed', tone: 'success' as const }
}

export function reportPath(sessionId: string) {
  return `/reports/${sessionId}`
}

export function sessionPath(sessionId: string) {
  return `/sessions/${sessionId}`
}

export function continuePath(session: AnalysisSession) {
  if (session.status === 'CLARIFYING') {
    return `/sessions/${session.id}/clarify`
  }

  if (
    session.status === 'READY_FOR_EXECUTION' ||
    session.status === 'EXECUTING' ||
    session.status === 'MONITORING' ||
    session.status === 'COMPLETED'
  ) {
    return reportPath(session.id)
  }

  return `/sessions/${session.id}/analyzing`
}

export function sessionKeyConclusion(session: AnalysisSession) {
  return session.conclusions[0]?.conclusion ?? session.lastInsight
}

export function currentUnderstanding(session: AnalysisSession) {
  const items = [
    session.intakeContext.budgetRange
      ? `Budget range: ${session.intakeContext.budgetRange}`
      : null,
    session.intakeContext.timeHorizonLabel
      ? `Time horizon: ${session.intakeContext.timeHorizonLabel}`
      : null,
    session.intakeContext.riskPreferenceLabel
      ? `Risk preference: ${session.intakeContext.riskPreferenceLabel}`
      : null,
    session.intakeContext.mustHaveGoals?.length
      ? `Must-have goals: ${session.intakeContext.mustHaveGoals.join(', ')}`
      : null,
    session.intakeContext.mustAvoidOutcomes?.length
      ? `Must-avoid outcomes: ${session.intakeContext.mustAvoidOutcomes.join(', ')}`
      : null,
  ]

  return items.filter(Boolean) as string[]
}

export function calculationTitle(task: CalculationTask) {
  const mapping: Record<string, string> = {
    'budget-band': 'Budget range',
    'safety-buffer': 'Safety buffer',
    'break-even': 'Breakeven point',
    'opportunity-cost': 'Opportunity cost',
  }

  return mapping[task.taskType] ?? task.taskType.replace(/-/g, ' ')
}
