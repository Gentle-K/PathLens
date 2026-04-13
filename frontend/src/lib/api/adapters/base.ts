import type {
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
  ExecutionQuote,
  FileItem,
  FileUploadPayload,
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
    getWalletSummary(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<WalletSummary>
    getWalletPositions(address: string, network?: 'testnet' | 'mainnet' | ''): Promise<PositionSnapshot[]>
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
      txReceipts: import('@/types').TransactionReceiptRecord[]
      reportAnchorRecords: ReportAnchorRecord[]
    }>
    monitor(sessionId: string): Promise<{
      positionSnapshots: PositionSnapshot[]
      currentBalance: number
      latestNavOrPrice: number
      costBasis: number
      unrealizedPnl: number
      accruedYield: number
      nextRedemptionWindow?: string
      oracleStalenessFlag: boolean
      kycChangeFlag: boolean
      alertFlags: string[]
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
}
