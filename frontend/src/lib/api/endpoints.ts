export const endpoints = {
  backend: {
    health: '/health',
    bootstrap: '/api/frontend/bootstrap',
    oracleSnapshots: (network: 'testnet' | 'mainnet') => `/api/oracle/snapshots?network=${network}`,
    walletKyc: (walletAddress: string, network: 'testnet' | 'mainnet') =>
      `/api/kyc/${walletAddress}?network=${network}`,
    walletSummary: (address: string, network = '') =>
      `/api/wallet/summary?address=${encodeURIComponent(address)}${network ? `&network=${network}` : ''}`,
    walletPositions: (address: string, network = '') =>
      `/api/wallet/positions?address=${encodeURIComponent(address)}${network ? `&network=${network}` : ''}`,
    logout: '/api/auth/logout',
    sessions: '/api/sessions',
    mySessions: '/api/my/sessions',
    deleteMyData: '/api/me/data',
    sessionDetail: (sessionId: string) => `/api/sessions/${sessionId}`,
    sessionStep: (sessionId: string) => `/api/sessions/${sessionId}/step`,
    sessionAttestation: (sessionId: string) => `/api/sessions/${sessionId}/attestation`,
    sessionRequestMoreFollowUp: (sessionId: string) => `/api/sessions/${sessionId}/request-more-follow-up`,
    reportAnchor: (reportId: string) => `/api/reports/${reportId}/anchor`,
    rwaEligibleCatalog: (address: string, sessionId = '', network = '') =>
      `/api/rwa/eligible-catalog?address=${encodeURIComponent(address)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}${network ? `&network=${network}` : ''}`,
    rwaQuote: '/api/rwa/quote',
    rwaSimulate: '/api/rwa/simulate',
    rwaExecute: '/api/rwa/execute',
    rwaMonitor: (sessionId: string) => `/api/rwa/monitor?session_id=${encodeURIComponent(sessionId)}`,
    debugAuthMe: '/api/debug/auth/me',
    debugLogs: '/api/debug/logs',
    debugLogDetail: (logId: string) => `/api/debug/logs/${logId}`,
    debugSessions: '/api/debug/sessions',
    debugSessionDetail: (sessionId: string) => `/api/debug/sessions/${sessionId}`,
  },
  auth: {
    login: '/api/auth/login',
    refresh: '/api/auth/refresh',
    me: '/api/auth/me',
    logout: '/api/auth/logout',
  },
  dashboard: '/api/dashboard',
  analysis: {
    list: '/api/analysis/sessions',
    create: '/api/analysis/sessions',
    detail: (sessionId: string) => `/api/analysis/sessions/${sessionId}`,
    questions: (sessionId: string) => `/api/analysis/sessions/${sessionId}/questions`,
    answers: (sessionId: string) => `/api/analysis/sessions/${sessionId}/answers`,
    progress: (sessionId: string) => `/api/analysis/sessions/${sessionId}/progress`,
    report: (sessionId: string) => `/api/analysis/sessions/${sessionId}/report`,
  },
  settings: '/api/settings',
  profile: '/api/profile',
  admin: {
    roles: '/api/roles',
    users: '/api/users',
    userRoles: (userId: string) => `/api/users/${userId}/roles`,
  },
  notifications: {
    list: '/api/notifications',
    detail: (notificationId: string) => `/api/notifications/${notificationId}`,
    readAll: '/api/notifications/read-all',
  },
  logs: {
    list: '/api/audit/logs',
    detail: (logId: string) => `/api/audit/logs/${logId}`,
  },
  files: {
    list: '/api/files',
    detail: (fileId: string) => `/api/files/${fileId}`,
  },
  dataviz: '/api/dataviz',
  resources: {
    collection: (resourceKey: string) => `/api/resources/${resourceKey}`,
    detail: (resourceKey: string, recordId: string) => `/api/resources/${resourceKey}/${recordId}`,
  },
} as const
