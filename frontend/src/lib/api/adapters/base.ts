import type {
  AssetProofHistoryItem,
  AssetProofSnapshot,
  AssetReadiness,
  DebugOperationReceipt,
  RwaBootstrap,
  AnalysisProgress,
  AnalysisReport,
  AnalysisSession,
  AuthSession,
  AuditLogEntry,
  CreateSessionPayload,
  DashboardOverview,
  DataVizBundle,
  ExecutionPlan,
  ExecutionReceipt,
  ExecutionQuote,
  FileItem,
  FileUploadPayload,
  OpsJobRun,
  PortfolioAlert,
  PortfolioAlertAck,
  PortfolioOverview,
  PositionSnapshot,
  LoginPayload,
  ModeDefinition,
  NotificationItem,
  PaginatedResponse,
  RecordAttestationPayload,
  RequestMeta,
  ReportAnchorRecord,
  ResourceRecord,
  Role,
  RwaOpsSummary,
  RwaAssetTemplate,
  SettingsPayload,
  SubmitAnswersPayload,
  User,
  UserProfile,
  WalletSummary,
} from '@/types'
import type { DebugSessionDetail, DebugSessionSummary } from '@/lib/api/adapters/genius-backend'

export interface ApiAdapter {
  auth: {
    login(payload: LoginPayload): Promise<AuthSession>
    logout(): Promise<void>
    me(): Promise<User>
    deletePersonalData(): Promise<{ deletedSessionCount: number }>
  }
  modes: {
    list(): Promise<ModeDefinition[]>
  }
  rwa: {
    getBootstrap(): Promise<RwaBootstrap>
    getAssetProof(assetId: string, network?: 'testnet' | 'mainnet' | ''): Promise<AssetProofSnapshot>
    getAssetProofHistory(assetId: string, network?: 'testnet' | 'mainnet' | ''): Promise<AssetProofHistoryItem[]>
    getAssetReadiness(params: {
      assetId: string
      address?: string
      sessionId?: string
      network?: 'testnet' | 'mainnet' | ''
      amount?: number
      sourceAsset?: string
      sourceChain?: string
    }): Promise<AssetReadiness>
    getWalletSummary(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<WalletSummary>
    getWalletPositions(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<PositionSnapshot[]>
    getPortfolio(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<PortfolioOverview>
    getPortfolioAlerts(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<PortfolioAlert[]>
    ackPortfolioAlert(address: string, alertId: string): Promise<PortfolioAlertAck>
    readPortfolioAlert(address: string, alertId: string): Promise<PortfolioAlertAck>
    getEligibleCatalog(params: {
      address: string
      sessionId?: string
      network?: 'testnet' | 'mainnet' | ''
    }): Promise<{
      eligible: Array<{ asset: RwaAssetTemplate; decision: import('@/types').EligibilityDecision }>
      conditional: Array<{ asset: RwaAssetTemplate; decision: import('@/types').EligibilityDecision }>
      blocked: Array<{ asset: RwaAssetTemplate; decision: import('@/types').EligibilityDecision }>
    }>
    getQuote(payload: {
      sessionId?: string
      sourceAsset: string
      targetAsset: string
      amount: number
      walletAddress?: string
      safeAddress?: string
      sourceChain?: string
      routePreferences?: Record<string, string>
    }): Promise<ExecutionQuote>
    simulate(payload: {
      sessionId?: string
      sourceAsset: string
      targetAsset: string
      amount: number
      walletAddress?: string
      safeAddress?: string
      sourceChain?: string
      includeAttestation?: boolean
    }): Promise<{
      quote: ExecutionQuote
      requiredApprovals: Array<Record<string, unknown>>
      possibleFailureReasons: string[]
      complianceBlockers: string[]
      warnings: string[]
    }>
    execute(payload: {
      sessionId: string
      sourceAsset: string
      targetAsset: string
      amount: number
      walletAddress?: string
      safeAddress?: string
      sourceChain?: string
      includeAttestation?: boolean
      generateOnly?: boolean
    }): Promise<{
      executionPlan: ExecutionPlan
      prepareSummary: string
      checklist: string[]
      blockers: string[]
      executionReceipt?: ExecutionReceipt
      txReceipts: import('@/types').TransactionReceiptRecord[]
      reportAnchorRecords: ReportAnchorRecord[]
    }>
    submitExecution(payload: {
      sessionId: string
      sourceAsset: string
      targetAsset: string
      amount: number
      walletAddress?: string
      safeAddress?: string
      sourceChain?: string
      includeAttestation?: boolean
      network?: 'testnet' | 'mainnet' | ''
      transactionHash?: string
      submittedBy?: string
      blockNumber?: number
      note?: string
    }): Promise<{
      executionPlan: ExecutionPlan
      receipt: ExecutionReceipt
      allowanceSteps: import('@/types').ExecutionApproval[]
      issuerRequestId?: string
      redirectUrl?: string
      submissionStatus: string
      submissionMessage: string
      externalActionUrl?: string
      txReceipts: import('@/types').TransactionReceiptRecord[]
      reportAnchorRecords: ReportAnchorRecord[]
    }>
    getExecutionReceipt(receiptId: string): Promise<ExecutionReceipt>
    listExecutionReceipts(params?: { sessionId?: string; assetId?: string }): Promise<ExecutionReceipt[]>
    monitor(sessionId: string): Promise<{
      positionSnapshots: PositionSnapshot[]
      currentBalance: number
      latestNavOrPrice: number
      costBasis: number
      unrealizedPnl: number
      realizedIncome: number
      accruedYield: number
      redemptionForecast: number
      allocationMix: Record<string, number>
      nextRedemptionWindow?: string
      oracleStalenessFlag: boolean
      kycChangeFlag: boolean
      proofStalenessFlag: boolean
      issuerDisclosureUpdateFlag: boolean
      alertFlags: string[]
      portfolioAlerts: PortfolioAlert[]
    }>
    anchorReport(payload: {
      reportId: string
      network: 'testnet' | 'mainnet'
      transactionHash?: string
      submittedBy?: string
      blockNumber?: number
      note?: string
    }): Promise<ReportAnchorRecord>
  }
  dashboard: {
    getOverview(): Promise<DashboardOverview>
  }
  analysis: {
    list(meta?: RequestMeta): Promise<PaginatedResponse<AnalysisSession>>
    create(payload: CreateSessionPayload): Promise<AnalysisSession>
    getById(sessionId: string): Promise<AnalysisSession>
    submitAnswers(sessionId: string, payload: SubmitAnswersPayload): Promise<AnalysisSession>
    recordAttestation(sessionId: string, payload: RecordAttestationPayload): Promise<AnalysisSession>
    requestMoreFollowUp(sessionId: string): Promise<AnalysisSession>
    getProgress(sessionId: string): Promise<AnalysisProgress>
    getReport(sessionId: string): Promise<AnalysisReport>
  }
  settings: {
    get(): Promise<SettingsPayload>
    update(payload: SettingsPayload): Promise<SettingsPayload>
  }
  profile: {
    get(): Promise<UserProfile>
  }
  admin: {
    listRoles(): Promise<Role[]>
    listUsers(): Promise<User[]>
    updateUserRole(userId: string, roleIds: string[]): Promise<User>
  }
  notifications: {
    list(): Promise<NotificationItem[]>
    markRead(notificationId: string): Promise<void>
    markAllRead(): Promise<void>
  }
  logs: {
    list(meta?: RequestMeta): Promise<PaginatedResponse<AuditLogEntry>>
    getById(logId: string): Promise<AuditLogEntry>
  }
  debug: {
    listSessions(): Promise<DebugSessionSummary[]>
    getSession(sessionId: string): Promise<DebugSessionDetail>
    getRwaOpsSummary(network?: 'testnet' | 'mainnet' | ''): Promise<RwaOpsSummary>
    listRwaJobs(): Promise<OpsJobRun[]>
    refreshRwaProofs(network?: 'testnet' | 'mainnet' | ''): Promise<DebugOperationReceipt>
    retryRwaPublishes(network?: 'testnet' | 'mainnet' | ''): Promise<DebugOperationReceipt>
    publishRwaSnapshot(snapshotId: string): Promise<DebugOperationReceipt>
    syncRwaExecutionStatus(): Promise<DebugOperationReceipt>
    runRwaIndexer(): Promise<DebugOperationReceipt>
  }
  files: {
    list(): Promise<FileItem[]>
    upload(payload: FileUploadPayload): Promise<FileItem>
  }
  dataviz: {
    getBundle(): Promise<DataVizBundle>
  }
  resources: {
    list(resourceKey: string, meta?: RequestMeta): Promise<PaginatedResponse<ResourceRecord>>
    getById(resourceKey: string, recordId: string): Promise<ResourceRecord>
    save(resourceKey: string, record: Partial<ResourceRecord>): Promise<ResourceRecord>
  }
  stocks: {
    getBootstrap(): Promise<import('@/types').StocksBootstrap>
    getAccount(mode: import('@/types').TradingMode): Promise<import('@/types').StockBrokerAccount>
    getCandidates(mode: import('@/types').TradingMode): Promise<{
      mode: import('@/types').TradingMode
      candidates: import('@/types').TradeCandidate[]
      aiDecisions: import('@/types').AiDecision[]
      riskOutcomes: import('@/types').RiskGateResult[]
      latestCycle?: import('@/types').DecisionCycleRecord
    }>
    getPositions(mode: import('@/types').TradingMode): Promise<{
      mode: import('@/types').TradingMode
      positions: import('@/types').StockPositionState[]
      account: import('@/types').StockBrokerAccount
    }>
    getOrders(mode: import('@/types').TradingMode): Promise<{
      mode: import('@/types').TradingMode
      orders: import('@/types').StockOrder[]
      positions: import('@/types').StockPositionState[]
      account: import('@/types').StockBrokerAccount
    }>
    setAutopilotState(
      mode: import('@/types').TradingMode,
      state: import('@/types').AutopilotState,
    ): Promise<{
      mode: import('@/types').TradingMode
      state: import('@/types').AutopilotState
      account: import('@/types').StockBrokerAccount
      promotionGate: import('@/types').PromotionGateResult
    }>
    triggerKillSwitch(
      mode: import('@/types').TradingMode,
      reason: string,
    ): Promise<{
      mode: import('@/types').TradingMode
      state: import('@/types').AutopilotState
      account: import('@/types').StockBrokerAccount
      reason: string
    }>
    updateSettings(
      payload: Partial<import('@/types').StocksSettings>,
    ): Promise<import('@/types').StocksBootstrap>
    getPromotionGate(): Promise<import('@/types').PromotionGateResult>
    getDecisionCycles(
      mode?: import('@/types').TradingMode,
    ): Promise<import('@/types').DecisionCycleRecord[]>
  }
}
