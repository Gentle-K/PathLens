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
  FileItem,
  FileUploadPayload,
  LoginPayload,
  ModeDefinition,
  NotificationItem,
  PaginatedResponse,
  RecordAttestationPayload,
  RequestMeta,
  ResourceRecord,
  Role,
  SettingsPayload,
  SubmitAnswersPayload,
  User,
  UserProfile,
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
