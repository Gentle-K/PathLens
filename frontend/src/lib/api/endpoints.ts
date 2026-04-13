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
    rwaAssetProof: (assetId: string, network = '') =>
      `/api/rwa/assets/${encodeURIComponent(assetId)}/proof${network ? `?network=${network}` : ''}`,
    rwaAssetProofHistory: (assetId: string, network = '') =>
      `/api/rwa/assets/${encodeURIComponent(assetId)}/proof/history${network ? `?network=${network}` : ''}`,
    rwaAssetProofAnchorHistory: (assetId: string, network = '') =>
      `/api/rwa/assets/${encodeURIComponent(assetId)}/proof/anchor-history${network ? `?network=${network}` : ''}`,
    rwaAssetPlanHistory: (assetId: string, network = '') =>
      `/api/rwa/assets/${encodeURIComponent(assetId)}/plan-history${network ? `?network=${network}` : ''}`,
    rwaAssetReadiness: (
      assetId: string,
      params: {
        address?: string
        sessionId?: string
        network?: string
        amount?: number
        sourceAsset?: string
        sourceChain?: string
      } = {},
    ) => {
      const query = new URLSearchParams()
      if (params.address) query.set('address', params.address)
      if (params.sessionId) query.set('session_id', params.sessionId)
      if (params.network) query.set('network', params.network)
      if (typeof params.amount === 'number') query.set('amount', String(params.amount))
      if (params.sourceAsset) query.set('source_asset', params.sourceAsset)
      if (params.sourceChain) query.set('source_chain', params.sourceChain)
      const queryString = query.toString()
      return `/api/rwa/assets/${encodeURIComponent(assetId)}/readiness${queryString ? `?${queryString}` : ''}`
    },
    rwaPortfolio: (address: string, network = '') =>
      `/api/rwa/portfolio/${encodeURIComponent(address)}${network ? `?network=${network}` : ''}`,
    rwaPortfolioAlerts: (address: string, network = '') =>
      `/api/rwa/portfolio/${encodeURIComponent(address)}/alerts${network ? `?network=${network}` : ''}`,
    rwaPortfolioAlertAck: (address: string, alertId: string) =>
      `/api/rwa/portfolio/${encodeURIComponent(address)}/alerts/${encodeURIComponent(alertId)}/ack`,
    rwaPortfolioAlertRead: (address: string, alertId: string) =>
      `/api/rwa/portfolio/${encodeURIComponent(address)}/alerts/${encodeURIComponent(alertId)}/read`,
    rwaEligibleCatalog: (address: string, sessionId = '', network = '') =>
      `/api/rwa/eligible-catalog?address=${encodeURIComponent(address)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}${network ? `&network=${network}` : ''}`,
    rwaQuote: '/api/rwa/quote',
    rwaSimulate: '/api/rwa/simulate',
    rwaExecute: '/api/rwa/execute',
    rwaExecutePrepare: '/api/rwa/execute/prepare',
    rwaExecuteSubmit: '/api/rwa/execute/submit',
    rwaExecutionReceipt: (receiptId: string) =>
      `/api/rwa/execution/receipts/${encodeURIComponent(receiptId)}`,
    rwaExecutionReceipts: (params: { sessionId?: string; assetId?: string } = {}) => {
      const query = new URLSearchParams()
      if (params.sessionId) query.set('session_id', params.sessionId)
      if (params.assetId) query.set('asset_id', params.assetId)
      const queryString = query.toString()
      return `/api/rwa/execution/receipts${queryString ? `?${queryString}` : ''}`
    },
    rwaMonitor: (sessionId: string) => `/api/rwa/monitor?session_id=${encodeURIComponent(sessionId)}`,
    rwaIndexerStatus: '/api/rwa/indexer/status',
    debugAuthMe: '/api/debug/auth/me',
    debugLogs: '/api/debug/logs',
    debugLogDetail: (logId: string) => `/api/debug/logs/${logId}`,
    debugSessions: '/api/debug/sessions',
    debugSessionDetail: (sessionId: string) => `/api/debug/sessions/${sessionId}`,
    debugRwaOpsSummary: (network = '') =>
      `/api/debug/rwa/ops/summary${network ? `?network=${network}` : ''}`,
    debugRwaJobs: '/api/debug/rwa/jobs',
    debugRwaProofRefresh: (network = '') =>
      `/api/debug/rwa/proofs/refresh${network ? `?network=${network}` : ''}`,
    debugRwaProofRetryPublish: (network = '') =>
      `/api/debug/rwa/proofs/publish/retry${network ? `?network=${network}` : ''}`,
    debugRwaProofPublish: (snapshotId: string) =>
      `/api/debug/rwa/proofs/${encodeURIComponent(snapshotId)}/publish`,
    debugRwaExecutionStatusSync: '/api/debug/rwa/execution/status-sync',
    debugRwaIndexerRun: '/api/debug/rwa/indexer/run',
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
