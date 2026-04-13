import type { ApiAdapter } from '@/lib/api/adapters/base'
import type { AnalysisReport, AnalysisSession, CalculationTask, EvidenceItem } from '@/types'

export interface AnalysisCatalog {
  reportsBySession: Record<string, AnalysisReport>
  sessions: AnalysisSession[]
}

export async function fetchAnalysisCatalog(
  adapter: ApiAdapter,
): Promise<AnalysisCatalog> {
  const sessions = (await adapter.analysis.list({ page: 1, pageSize: 100 })).items

  const completedSessions = sessions.filter(
    (session) =>
      session.status === 'READY_FOR_EXECUTION' ||
      session.status === 'EXECUTING' ||
      session.status === 'MONITORING' ||
      session.status === 'COMPLETED',
  )
  const reports = await Promise.all(
    completedSessions.map(async (session) => [
      session.id,
      await adapter.analysis.getReport(session.id),
    ] as const),
  )

  return {
    sessions,
    reportsBySession: Object.fromEntries(reports),
  }
}

export function flattenEvidence(catalog: AnalysisCatalog) {
  return catalog.sessions.flatMap((session) =>
    mergeEvidence(session, catalog.reportsBySession[session.id]).map((item) => ({
      item,
      session,
      report: catalog.reportsBySession[session.id],
    })),
  )
}

export function flattenCalculations(catalog: AnalysisCatalog) {
  return catalog.sessions.flatMap((session) =>
    mergeCalculations(session, catalog.reportsBySession[session.id]).map((task) => ({
      task,
      session,
      report: catalog.reportsBySession[session.id],
    })),
  )
}

export function uniqueEvidenceCount(session: AnalysisSession, report?: AnalysisReport) {
  const ids = new Set<string>()
  ;[...session.evidence, ...(report?.evidence ?? [])].forEach((item) => ids.add(item.id))
  return ids.size
}

export function uniqueCalculationCount(
  session: AnalysisSession,
  report?: AnalysisReport,
) {
  const ids = new Set<string>()
  ;[...session.calculations, ...(report?.calculations ?? [])].forEach((item) =>
    ids.add(item.id),
  )
  return ids.size
}

export function mergeEvidence(
  session: AnalysisSession,
  report?: AnalysisReport,
): EvidenceItem[] {
  const seen = new Set<string>()
  return [...session.evidence, ...(report?.evidence ?? [])].filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function mergeCalculations(
  session: AnalysisSession,
  report?: AnalysisReport,
): CalculationTask[] {
  const seen = new Set<string>()
  return [...session.calculations, ...(report?.calculations ?? [])].filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
