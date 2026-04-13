import type { SessionStatus } from '@/types'

export function isResultSessionStatus(status?: SessionStatus | string) {
  return (
    status === 'READY_FOR_EXECUTION' ||
    status === 'EXECUTING' ||
    status === 'MONITORING' ||
    status === 'COMPLETED' ||
    status === 'FAILED'
  )
}

export function getAnalysisSessionPath(
  sessionId: string,
  status?: SessionStatus | string,
) {
  return isResultSessionStatus(status)
    ? `/analysis/session/${sessionId}/result`
    : `/analysis/session/${sessionId}`
}
