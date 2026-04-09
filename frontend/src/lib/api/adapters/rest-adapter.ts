import { apiClient } from '@/lib/api/client'
import type { ApiAdapter } from '@/lib/api/adapters/base'
import { clearBrowserAccount } from '@/lib/auth/browser-account'
import {
  COOKIE_SESSION_TOKEN,
  type BackendAuditLogEntry,
  type BackendAuditLogListResponse,
  type BackendDebugSessionListResponse,
  type BackendPersonalDataDeletionResponse,
  type BackendUserAnswer,
  type BackendBootstrapResponse,
  type BackendSession,
  type BackendSessionStepResponse,
  type BackendRequestMoreFollowUpResponse,
  backendSessionToResourceRecord,
  createBackendPseudoUser,
  mapAuditLogEntry,
  mapDebugSessionSummary,
  mapBackendProgress,
  mapBackendReport,
  mapBackendSession,
  mapModeDefinitions,
  mapRwaBootstrap,
  toBackendIntakeContext,
  toBackendAnswers,
} from '@/lib/api/adapters/genius-backend'
import { mockApiAdapter } from '@/lib/api/adapters/mock-adapter'
import { endpoints } from '@/lib/api/endpoints'
import { useAppStore } from '@/lib/store/app-store'
import type {
  AnalysisMode,
  AnalysisSession,
  DashboardOverview,
  LanguageCode,
  PaginatedResponse,
  RequestMeta,
  ResourceRecord,
} from '@/types'

const bootstrapPromises = new Map<LanguageCode, Promise<BackendBootstrapResponse>>()

function toBackendMode(mode: AnalysisMode) {
  return mode === 'multi-option' ? 'multi_option' : 'single_decision'
}

async function getBootstrap(force = false) {
  const locale = useAppStore.getState().locale
  const cached = bootstrapPromises.get(locale)

  if (force || !cached) {
    const request = apiClient.request<BackendBootstrapResponse>(
      endpoints.backend.bootstrap,
    )
    bootstrapPromises.set(locale, request)
    return request
  }

  return cached
}

async function fetchBackendSession(sessionId: string) {
  return apiClient.request<BackendSession>(
    endpoints.backend.sessionDetail(sessionId),
  )
}

async function advanceBackendSession(
  sessionId: string,
  answers: BackendUserAnswer[] = [],
) {
  return apiClient.request<BackendSessionStepResponse>(
    endpoints.backend.sessionStep(sessionId),
    {
      method: 'POST',
      body: JSON.stringify({
        answers,
      }),
    },
  )
}

function paginate<T>(items: T[], meta?: RequestMeta): PaginatedResponse<T> {
  const page = meta?.page ?? 1
  const pageSize = meta?.pageSize ?? 10
  const start = (page - 1) * pageSize

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    nextPage: start + pageSize < items.length ? page + 1 : undefined,
  }
}

function matchQuery(text: string, q?: string) {
  if (!q) {
    return true
  }

  return text.toLowerCase().includes(q.toLowerCase())
}

function sessionToSummary(session: AnalysisSession) {
  const {
    id,
    mode,
    problemStatement,
    status,
    createdAt,
    updatedAt,
    lastInsight,
  } = session
  return {
    id,
    mode,
    problemStatement,
    status,
    createdAt,
    updatedAt,
    lastInsight,
  }
}

async function listKnownBackendSessions() {
  const sessions = await apiClient.request<BackendSession[]>(
    endpoints.backend.mySessions,
  )
  return sessions.map(mapBackendSession)
}

async function buildDashboardOverview() {
  const fallback = await mockApiAdapter.dashboard.getOverview()
  const liveSessions = await listKnownBackendSessions()

  if (!liveSessions.length) {
    return fallback
  }

  const completed = liveSessions.filter(
    (session) => session.status === 'COMPLETED',
  ).length
  const clarifying = liveSessions.filter(
    (session) => session.status === 'CLARIFYING',
  ).length

  const overview: DashboardOverview = {
    ...fallback,
    metrics: [
      {
        id: 'backend-live-sessions',
        label: 'Tracked backend sessions',
        value: String(liveSessions.length),
        change: `+${Math.max(1, completed)}`,
        detail:
          'Sessions created from the real FastAPI backend in this browser.',
      },
      {
        id: 'backend-completed',
        label: 'Completed loops',
        value: String(completed),
        change: completed ? '+1' : '0',
        detail: 'Sessions that reached COMPLETED on the backend.',
      },
      {
        id: 'backend-clarifying',
        label: 'Need user input',
        value: String(clarifying),
        change: clarifying ? '+1' : '0',
        detail: 'Sessions still waiting on clarification answers.',
      },
      ...fallback.metrics.slice(0, 1),
    ],
    recentSessions: liveSessions.slice(0, 6).map(sessionToSummary),
    activity: [
      {
        id: 'backend-sync',
        title: 'Backend contract synced',
        detail:
          'Anonymous cookie-based sessions are now wired to the FastAPI backend.',
        createdAt: new Date().toISOString(),
        tone: 'positive',
      },
      ...fallback.activity.slice(0, 5),
    ],
  }

  return overview
}

async function ensureReportReady(sessionId: string) {
  let session = await fetchBackendSession(sessionId)
  let attempts = 0

  while (!session.report && attempts < 3 && session.status !== 'FAILED') {
    if (session.status === 'CLARIFYING') {
      break
    }

    if (session.status === 'COMPLETED') {
      break
    }

    await advanceBackendSession(sessionId)
    session = await fetchBackendSession(sessionId)
    attempts += 1
  }

  return session
}

export const restApiAdapter: ApiAdapter = {
  auth: {
    async login() {
      await getBootstrap(true)
      return {
        accessToken: COOKIE_SESSION_TOKEN,
        refreshToken: COOKIE_SESSION_TOKEN,
        user: createBackendPseudoUser(),
      }
    },
    async logout() {
      bootstrapPromises.clear()
      clearBrowserAccount()
      await apiClient.request<void>(endpoints.backend.logout, {
        method: 'POST',
      })
    },
    async me() {
      await getBootstrap()
      return createBackendPseudoUser()
    },
    async deletePersonalData() {
      bootstrapPromises.clear()
      clearBrowserAccount()
      const payload =
        await apiClient.request<BackendPersonalDataDeletionResponse>(
          endpoints.backend.deleteMyData,
          {
            method: 'DELETE',
          },
        )
      return {
        deletedSessionCount: payload.deleted_session_count,
      }
    },
  },
  modes: {
    async list() {
      const bootstrap = await getBootstrap()
      return mapModeDefinitions(bootstrap)
    },
  },
  rwa: {
    async getBootstrap() {
      const bootstrap = await getBootstrap()
      return mapRwaBootstrap(bootstrap)
    },
  },
  dashboard: {
    async getOverview() {
      return buildDashboardOverview()
    },
  },
  analysis: {
    async list(meta) {
      const liveSessions = await listKnownBackendSessions()
      const filtered = liveSessions.filter((session) =>
        matchQuery(
          `${session.problemStatement} ${session.lastInsight}`,
          meta?.q,
        ),
      )
      return paginate(filtered, meta)
    },
    async create(payload) {
      const step = await apiClient.request<BackendSessionStepResponse>(
        endpoints.backend.sessions,
        {
          method: 'POST',
          body: JSON.stringify({
            mode: toBackendMode(payload.mode),
            locale: payload.locale,
            problem_statement: payload.problemStatement,
            intake_context: toBackendIntakeContext(payload.intakeContext),
          }),
        },
      )

      return mapBackendSession(await fetchBackendSession(step.session_id))
    },
    async getById(sessionId) {
      return mapBackendSession(await fetchBackendSession(sessionId))
    },
    async submitAnswers(sessionId, payload) {
      await apiClient.request<BackendSessionStepResponse>(
        endpoints.backend.sessionStep(sessionId),
        {
          method: 'POST',
          body: JSON.stringify({
            answers: toBackendAnswers(payload.answers),
          }),
        },
      )

      return mapBackendSession(await fetchBackendSession(sessionId))
    },
    async requestMoreFollowUp(sessionId) {
      const payload =
        await apiClient.request<BackendRequestMoreFollowUpResponse>(
          endpoints.backend.sessionRequestMoreFollowUp(sessionId),
          {
            method: 'POST',
          },
        )

      return mapBackendSession(payload.session)
    },
    async getProgress(sessionId) {
      let session = await fetchBackendSession(sessionId)

      if (
        session.status === 'ANALYZING' ||
        session.status === 'READY_FOR_REPORT' ||
        session.status === 'REPORTING'
      ) {
        const step = await advanceBackendSession(sessionId)
        session = await fetchBackendSession(sessionId)
        return mapBackendProgress(session, step)
      }

      return mapBackendProgress(session)
    },
    async getReport(sessionId) {
      const session = await ensureReportReady(sessionId)
      return mapBackendReport(session)
    },
  },
  settings: {
    get: mockApiAdapter.settings.get,
    update: mockApiAdapter.settings.update,
  },
  profile: {
    async get() {
      const settings = await mockApiAdapter.settings.get()
      const history = (await listKnownBackendSessions())
        .slice(0, 6)
        .map(sessionToSummary)

      return {
        ...createBackendPseudoUser(),
        bio: 'This browser account is created automatically and keeps your analysis history in sync.',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        preferences: settings,
        history,
      }
    },
  },
  admin: {
    listRoles: mockApiAdapter.admin.listRoles,
    listUsers: mockApiAdapter.admin.listUsers,
    updateUserRole: mockApiAdapter.admin.updateUserRole,
  },
  notifications: {
    list: mockApiAdapter.notifications.list,
    markRead: mockApiAdapter.notifications.markRead,
    markAllRead: mockApiAdapter.notifications.markAllRead,
  },
  logs: {
    async list(meta) {
      const payload = await apiClient.request<BackendAuditLogListResponse>(
        endpoints.backend.debugLogs,
      )
      const filtered = payload.logs
        .map(mapAuditLogEntry)
        .filter((log) =>
          matchQuery(
            `${log.action} ${log.summary} ${log.target} ${log.actor}`,
            meta?.q,
          ),
        )
      return paginate(filtered, meta)
    },
    async getById(logId) {
      const payload = await apiClient.request<BackendAuditLogEntry>(
        endpoints.backend.debugLogDetail(logId),
      )
      return mapAuditLogEntry(payload)
    },
  },
  debug: {
    async listSessions() {
      const payload = await apiClient.request<BackendDebugSessionListResponse>(
        endpoints.backend.debugSessions,
      )
      return payload.sessions.map(mapDebugSessionSummary)
    },
    async getSession(sessionId) {
      const session = await apiClient.request<BackendSession>(
        endpoints.backend.debugSessionDetail(sessionId),
      )
      return {
        summary: mapDebugSessionSummary({
          session_id: session.session_id,
          owner_client_id: session.owner_client_id,
          mode: session.mode,
          problem_statement: session.problem_statement,
          status: session.status,
          event_count: session.events.length,
          answer_count: session.answers.length,
          evidence_count: session.evidence_items.length,
          search_task_count: session.search_tasks.length,
          created_at: session.created_at,
          updated_at: session.updated_at,
        }),
        session,
      }
    },
  },
  files: {
    list: mockApiAdapter.files.list,
    upload: mockApiAdapter.files.upload,
  },
  dataviz: {
    async getBundle() {
      const liveSessions = await listKnownBackendSessions()

      if (!liveSessions.length) {
        return mockApiAdapter.dataviz.getBundle()
      }

      const reports = await Promise.all(
        liveSessions
          .slice(0, 3)
          .map(async (session) =>
            restApiAdapter.analysis.getReport(session.id),
          ),
      )

      return {
        charts: reports.flatMap((report) => report.charts),
        notes: [
          'Charts below are derived from backend chart artifacts when available.',
          'The current backend still uses mock chart generation internally.',
        ],
      }
    },
  },
  resources: {
    async list(resourceKey, meta) {
      if (resourceKey === 'analyses') {
        const liveSessions = await restApiAdapter.analysis.list(meta)
        return {
          ...liveSessions,
          items: liveSessions.items.map(backendSessionToResourceRecord),
        }
      }

      return mockApiAdapter.resources.list(resourceKey, meta)
    },
    async getById(resourceKey, recordId) {
      if (resourceKey === 'analyses') {
        return backendSessionToResourceRecord(
          await restApiAdapter.analysis.getById(recordId),
        )
      }

      return mockApiAdapter.resources.getById(resourceKey, recordId)
    },
    async save(resourceKey, record) {
      if (resourceKey === 'analyses') {
        const liveRecord: ResourceRecord = record.id
          ? await restApiAdapter.resources.getById(resourceKey, record.id)
          : {
              id: `analysis-${Date.now()}`,
              title: String(record.title ?? 'Backend analysis'),
              subtitle: String(record.subtitle ?? 'Read only'),
              status: 'read-only',
              updatedAt: new Date().toISOString(),
            }

        return liveRecord
      }

      return mockApiAdapter.resources.save(resourceKey, record)
    },
  },
}
