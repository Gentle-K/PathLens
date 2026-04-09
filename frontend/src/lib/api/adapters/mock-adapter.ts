import { mockRealtimeBus } from '@/lib/mock/realtime-bus'
import {
  clearBrowserAccount,
  createBrowserBoundUser,
} from '@/lib/auth/browser-account'
import {
  buildDashboardOverview,
  buildDataVizBundle,
  createMockDatabase,
} from '@/lib/mock/data'
import {
  buildMockAnalysisBundle,
  buildMockModeDefinitions,
} from '@/lib/mock/analysis-workflows'
import type { ApiAdapter } from '@/lib/api/adapters/base'
import type { BackendSession } from '@/lib/api/adapters/genius-backend'
import { useAppStore } from '@/lib/store/app-store'
import type {
  AnalysisProgress,
  AnalysisSession,
  AuditLogEntry,
  FileItem,
  HashKeyChainConfig,
  NotificationItem,
  PaginatedResponse,
  RequestMeta,
  ResourceRecord,
  RwaAssetTemplate,
  RwaBootstrap,
  RwaIntakeContext,
} from '@/types'

const db = createMockDatabase()
const customResources: Record<string, ResourceRecord[]> = {}

const wait = async (duration = 220) =>
  new Promise((resolve) => window.setTimeout(resolve, duration))

const nowIso = () => new Date().toISOString()

const mockChainConfig: HashKeyChainConfig = {
  ecosystemName: 'HashKey Chain',
  nativeTokenSymbol: 'HSK',
  defaultExecutionNetwork: 'testnet',
  testnetChainId: 133,
  testnetRpcUrl: 'https://testnet.hsk.xyz',
  testnetExplorerUrl: 'https://testnet-explorer.hsk.xyz',
  mainnetChainId: 177,
  mainnetRpcUrl: 'https://mainnet.hsk.xyz',
  mainnetExplorerUrl: 'https://hashkey.blockscout.com',
  planRegistryAddress: '0x0000000000000000000000000000000000000133',
  kycSbtAddress: '0x0000000000000000000000000000000000000134',
  testnetPlanRegistryAddress: '0x0000000000000000000000000000000000000133',
  mainnetPlanRegistryAddress: '0x0000000000000000000000000000000000000177',
  testnetKycSbtAddress: '0x0000000000000000000000000000000000000134',
  mainnetKycSbtAddress: '0x0000000000000000000000000000000000000178',
  docsUrls: [
    'https://docs.hashkeychain.net/docs/About-HashKey-Chain',
    'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/network-info',
    'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
    'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC',
  ],
  oracleFeeds: [
    {
      id: 'btc-usd',
      pair: 'BTC/USD',
      sourceName: 'APRO Oracle',
      docsUrl: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
      testnetAddress: '0x646970afb65c1fc88d7dff5d17bebf7ca7639290',
      mainnetAddress: '0x2042d24ed0a86e12b8a3d38db530d7dc3c85ea00',
      decimals: 8,
    },
    {
      id: 'usdt-usd',
      pair: 'USDT/USD',
      sourceName: 'APRO Oracle',
      docsUrl: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
      testnetAddress: '0x450d4d4b55284b9e7a0f2d88ca00f95e29e44e9f',
      decimals: 8,
    },
    {
      id: 'usdc-usd',
      pair: 'USDC/USD',
      sourceName: 'APRO Oracle',
      docsUrl: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/Oracle',
      testnetAddress: '0x6655445f8a6ca6f03f8c4f31da95174cef63f8f6',
      mainnetAddress: '0xe4a755800df1f47179d35b30fd90f80b1f4f2ea6',
      decimals: 8,
    },
  ],
}

const mockAssetLibrary: RwaAssetTemplate[] = [
  {
    id: 'hsk-usdc',
    symbol: 'USDC',
    name: 'HashKey USDC',
    assetType: 'stablecoin',
    description: '高流动性稳定币基线资产。',
    issuer: 'Circle / bridged deployment',
    custody: 'Bridged USDC',
    chainId: 177,
    contractAddress: '0x054ed45810DbBAb8B27668922D110669c9D88D0a',
    settlementAsset: 'USDC',
    executionStyle: 'erc20',
    benchmarkApy: 0.05,
    expectedReturnLow: 0.03,
    expectedReturnBase: 0.049,
    expectedReturnHigh: 0.064,
    priceVolatility: 0.012,
    maxDrawdown180d: 0.018,
    avgDailyVolumeUsd: 3800000,
    redemptionDays: 0,
    lockupDays: 0,
    managementFeeBps: 28,
    entryFeeBps: 0,
    exitFeeBps: 0,
    slippageBps: 5,
    issuerDisclosureScore: 0.78,
    custodyDisclosureScore: 0.76,
    auditDisclosureScore: 0.75,
    contractIsUpgradeable: false,
    hasAdminKey: false,
    oracleCount: 2,
    oracleSources: ['HashKey Oracle'],
    requiresKycLevel: 0,
    minimumTicketUsd: 100,
    tags: ['stablecoin', 'liquidity'],
    thesis: '适合作为流动性底仓。',
    fitSummary: '更适合保守或均衡型配置。',
    evidenceUrls: ['https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Token-Contracts'],
    primarySourceUrl: 'https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Token-Contracts',
    onchainVerified: true,
    issuerDisclosed: true,
    featured: true,
  },
  {
    id: 'cpic-estable-mmf',
    symbol: 'MMF',
    name: 'CPIC Estable MMF',
    assetType: 'mmf',
    description: 'MMF 风格 RWA 演示模板。',
    issuer: 'CPIC / Estable',
    custody: 'Issuer-managed custody',
    chainId: 177,
    settlementAsset: 'USDT',
    executionStyle: 'issuer_portal',
    benchmarkApy: 0.048,
    expectedReturnLow: 0.035,
    expectedReturnBase: 0.046,
    expectedReturnHigh: 0.055,
    priceVolatility: 0.025,
    maxDrawdown180d: 0.03,
    avgDailyVolumeUsd: 1250000,
    redemptionDays: 2,
    lockupDays: 0,
    managementFeeBps: 70,
    entryFeeBps: 10,
    exitFeeBps: 15,
    slippageBps: 0,
    issuerDisclosureScore: 0.82,
    custodyDisclosureScore: 0.8,
    auditDisclosureScore: 0.72,
    contractIsUpgradeable: false,
    hasAdminKey: false,
    oracleCount: 1,
    oracleSources: ['Issuer disclosure'],
    requiresKycLevel: 2,
    minimumTicketUsd: 10000,
    tags: ['mmf', 'rwa'],
    thesis: '适合做稳健收益腿。',
    fitSummary: '适合中低风险偏好。',
    evidenceUrls: ['https://www.prnewswire.com/news-releases/cpic-estable-mmf-launches-on-hashkey-chain-with-100m-first-day-subscriptions-302408505.html'],
    primarySourceUrl: 'https://www.prnewswire.com/news-releases/cpic-estable-mmf-launches-on-hashkey-chain-with-100m-first-day-subscriptions-302408505.html',
    onchainVerified: false,
    issuerDisclosed: true,
    featured: true,
  },
  {
    id: 'hk-regulated-silver',
    symbol: 'SILV',
    name: 'Hong Kong Regulated Silver RWA',
    assetType: 'precious_metal',
    description: '白银 RWA 演示模板。',
    issuer: 'HashKey ecosystem issuer',
    custody: 'Third-party vault custody',
    chainId: 177,
    settlementAsset: 'USDT',
    executionStyle: 'issuer_portal',
    benchmarkApy: 0.022,
    expectedReturnLow: -0.08,
    expectedReturnBase: 0.065,
    expectedReturnHigh: 0.18,
    priceVolatility: 0.24,
    maxDrawdown180d: 0.19,
    avgDailyVolumeUsd: 420000,
    redemptionDays: 3,
    lockupDays: 0,
    managementFeeBps: 85,
    entryFeeBps: 20,
    exitFeeBps: 25,
    slippageBps: 30,
    issuerDisclosureScore: 0.74,
    custodyDisclosureScore: 0.88,
    auditDisclosureScore: 0.7,
    contractIsUpgradeable: false,
    hasAdminKey: false,
    oracleCount: 1,
    oracleSources: ['Spot silver reference'],
    requiresKycLevel: 2,
    minimumTicketUsd: 5000,
    tags: ['silver', 'rwa'],
    thesis: '适合作为宏观对冲腿。',
    fitSummary: '更适合均衡到进取型配置。',
    evidenceUrls: ['https://group.hashkey.com/en/newsroom/hashkey-chain-supports-the-onchain-issuance-of-hk-s-first-regulated-silverbacked-rwa-token'],
    primarySourceUrl: 'https://group.hashkey.com/en/newsroom/hashkey-chain-supports-the-onchain-issuance-of-hk-s-first-regulated-silverbacked-rwa-token',
    onchainVerified: false,
    issuerDisclosed: true,
    featured: true,
  },
]

const mockRwaBootstrap: RwaBootstrap = {
  appName: 'Genius Actuary for RWA',
  chainConfig: mockChainConfig,
  assetLibrary: mockAssetLibrary,
  supportedAssetTypes: ['stablecoin', 'mmf', 'precious_metal'],
  holdingPeriodPresets: [7, 30, 90, 180],
  notes: ['Mock mode returns seeded HashKey Chain asset templates for local UI testing.'],
}

export const defaultRwaIntakeContext: RwaIntakeContext = {
  investmentAmount: 10000,
  baseCurrency: 'USDT',
  preferredAssetIds: ['hsk-usdc', 'cpic-estable-mmf', 'hk-regulated-silver'],
  holdingPeriodDays: 30,
  riskTolerance: 'balanced',
  liquidityNeed: 't_plus_3',
  minimumKycLevel: 0,
  walletAddress: '',
  walletNetwork: '',
  walletKycLevelOnchain: undefined,
  walletKycVerified: undefined,
  wantsOnchainAttestation: true,
  additionalConstraints: '',
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function paginate<T>(items: T[], meta?: RequestMeta): PaginatedResponse<T> {
  const page = meta?.page ?? 1
  const pageSize = meta?.pageSize ?? 10
  const start = (page - 1) * pageSize
  const pagedItems = items.slice(start, start + pageSize)

  return {
    items: pagedItems,
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

function pushNotification(notification: NotificationItem) {
  db.notifications.unshift(notification)
  mockRealtimeBus.emit({
    type: 'NOTIFICATION_CREATED',
    payload: {
      id: notification.id,
      title: notification.title,
      read: notification.read,
    },
  })
}

function pushLog(entry: AuditLogEntry) {
  db.logs.unshift(entry)
  mockRealtimeBus.emit({
    type: 'AUDIT_LOG_ADDED',
    payload: {
      id: entry.id,
      action: entry.action,
      status: entry.status,
    },
  })
}

function sessionSummary(session: AnalysisSession) {
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

function ensureMockBrowserUser() {
  const browserUser = createBrowserBoundUser()
  const existingUser = db.users.find(
    (candidate) => candidate.id === browserUser.id,
  )

  if (existingUser) {
    existingUser.name = browserUser.name
    existingUser.email = browserUser.email
    existingUser.title = browserUser.title
    existingUser.locale = browserUser.locale
    existingUser.roles = browserUser.roles
    existingUser.lastActiveAt = browserUser.lastActiveAt
    return existingUser
  }

  db.users.unshift(browserUser)
  return browserUser
}

function resolveCurrentUser() {
  return useAppStore.getState().currentUser ?? ensureMockBrowserUser()
}

function resourceRecords(resourceKey: string): ResourceRecord[] {
  const baseRecords = (() => {
    switch (resourceKey) {
      case 'analyses':
        return db.sessions.map((session) => ({
          id: session.id,
          title: session.problemStatement,
          subtitle: session.mode,
          status: session.status,
          updatedAt: session.updatedAt,
          createdAt: session.createdAt,
        }))
      case 'users':
        return db.users.map((user) => ({
          id: user.id,
          title: user.name,
          subtitle: user.email,
          status: user.roles.join(', '),
          updatedAt: user.lastActiveAt,
          titleValue: user.title,
        }))
      case 'roles':
        return db.roles.map((role) => ({
          id: role.id,
          title: role.name,
          subtitle: role.description,
          status: `${role.memberCount} members`,
          updatedAt: nowIso(),
        }))
      case 'notifications':
        return db.notifications.map((notification) => ({
          id: notification.id,
          title: notification.title,
          subtitle: notification.message,
          status: notification.read ? 'read' : 'unread',
          updatedAt: notification.createdAt,
        }))
      case 'logs':
        return db.logs.map((log) => ({
          id: log.id,
          title: log.action,
          subtitle: log.summary,
          status: log.status,
          updatedAt: log.createdAt,
        }))
      case 'files':
        return db.files.map((file) => ({
          id: file.id,
          title: file.name,
          subtitle: file.mime,
          status: file.status,
          updatedAt: file.createdAt,
        }))
      default:
        return []
    }
  })()

  const customRecords = customResources[resourceKey] ?? []
  const merged = new Map<string, ResourceRecord>()

  baseRecords.forEach((record) => merged.set(record.id, record))
  customRecords.forEach((record) => merged.set(record.id, record))

  return Array.from(merged.values())
}

function findUser(userId: string) {
  const user = db.users.find((candidate) => candidate.id === userId)
  if (!user) {
    throw new Error(`Unknown user: ${userId}`)
  }

  return user
}

function findRole(roleId: string) {
  const role = db.roles.find((candidate) => candidate.id === roleId)
  if (!role) {
    throw new Error(`Unknown role: ${roleId}`)
  }

  return role
}

function findSession(sessionId: string) {
  const session = db.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) {
    throw new Error(`Unknown session: ${sessionId}`)
  }

  return session
}

function ensureMockBundle(session: AnalysisSession) {
  const bundle = buildMockAnalysisBundle(
    session.id,
    session.problemStatement,
    session.mode,
  )

  if (!session.questions.length || !session.questions[0]?.questionGroup) {
    session.questions = structuredClone(bundle.questions)
  }

  if (!session.searchTasks.length || !session.searchTasks[0]?.notes) {
    session.searchTasks = structuredClone(bundle.searchTasks)
  }

  if (!session.calculations.length || !session.calculations[0]?.status) {
    session.calculations = structuredClone(bundle.calculations)
  }

  if (!session.chartTasks?.length) {
    session.chartTasks = structuredClone(bundle.chartTasks)
  }

  if (!db.reports[session.id]?.tables?.length) {
    db.reports[session.id] = structuredClone(bundle.report)
  }

  return bundle
}

function buildMockTimeline(mode: AnalysisSession['mode']) {
  if (mode === 'multi-option') {
    return [
      {
        label: '识别方案并收集证据',
        activityStatus: 'searching_and_synthesizing',
        focus: '正在识别可选方案，并搜索支持或反驳每种方案的证据。',
      },
      {
        label: '整理平行优缺点与成本',
        activityStatus: 'running_deterministic_calculations',
        focus: '正在把方案优点、缺点、成本和门槛整理到同一比较框架。',
      },
      {
        label: '生成对比图表与表格',
        activityStatus: 'preparing_visualizations',
        focus: '正在生成方案评分图、成本图和对比表格。',
      },
      {
        label: '撰写最终决策建议',
        activityStatus: 'running_analysis_pipeline',
        focus: '正在形成带有建议、图表和表格的完整决策结果。',
      },
    ]
  }

  return [
    {
      label: '搜索成本与收入证据',
      activityStatus: 'searching_web_for_evidence',
      focus: '正在搜索成本、收入回收、市场报价和关键风险证据。',
    },
    {
      label: '估算预算区间',
      activityStatus: 'running_deterministic_calculations',
      focus: '正在汇总预算项，并形成低位、基准和高位预算区间。',
    },
    {
      label: '生成预算图表与表格',
      activityStatus: 'preparing_visualizations',
      focus: '正在生成预算结构图、收入回收图和预算拆分表格。',
    },
    {
      label: '撰写最终成本报告',
      activityStatus: 'running_analysis_pipeline',
      focus: '正在输出预算结论、风险提醒和执行建议。',
    },
  ]
}

function phaseStatus(
  cursor: number,
  index: number,
): AnalysisProgress['stages'][number]['status'] {
  if (index < cursor) {
    return 'completed'
  }

  if (index === cursor) {
    return 'active'
  }

  return 'pending'
}

function toDebugMode(mode: AnalysisSession['mode']): BackendSession['mode'] {
  return mode === 'multi-option' ? 'multi_option' : 'single_decision'
}

export const mockApiAdapter: ApiAdapter = {
  auth: {
    async login() {
      await wait()

      return {
        accessToken: 'mock_cookie_session',
        refreshToken: 'mock_cookie_session',
        user: ensureMockBrowserUser(),
      }
    },
    async logout() {
      await wait(100)
      clearBrowserAccount()
    },
    async me() {
      await wait(120)
      return resolveCurrentUser()
    },
    async deletePersonalData() {
      await wait(120)
      clearBrowserAccount()
      const deletedSessionCount = db.sessions.length
      db.sessions = []
      db.logs = []
      db.notifications = []
      db.files = []
      Object.keys(db.reports).forEach((key) => delete db.reports[key])
      Object.keys(db.progressCursor).forEach(
        (key) => delete db.progressCursor[key],
      )
      return { deletedSessionCount }
    },
  },
  modes: {
    async list() {
      await wait(120)
      return buildMockModeDefinitions()
    },
  },
  rwa: {
    async getBootstrap() {
      await wait(120)
      return structuredClone(mockRwaBootstrap)
    },
  },
  dashboard: {
    async getOverview() {
      await wait()
      return buildDashboardOverview(db)
    },
  },
  analysis: {
    async list(meta) {
      await wait()
      const filtered = db.sessions.filter((session) =>
        matchQuery(
          `${session.problemStatement} ${session.lastInsight}`,
          meta?.q,
        ),
      )
      return paginate(
        filtered.map((session) => ({ ...session })),
        meta,
      )
    },
    async create(payload) {
      await wait()

      const sessionId = createId('sess')
      const bundle = buildMockAnalysisBundle(
        sessionId,
        payload.problemStatement,
        payload.mode,
      )
      const session: AnalysisSession = {
        id: sessionId,
        mode: payload.mode,
        problemStatement: payload.problemStatement,
        status: 'CLARIFYING',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        followUpRoundLimit: 10,
        followUpRoundsUsed: 0,
        followUpExtensionsUsed: 0,
        followUpBudgetExhausted: false,
        deferredFollowUpQuestionCount: 0,
        activityStatus: 'waiting_for_user_clarification_answers',
        intakeContext: structuredClone(payload.intakeContext),
        currentFocus:
          payload.mode === 'multi-option'
            ? '等待用户补充决策目标、约束和偏好，以便识别并比较方案。'
            : '等待用户补充预算边界、约束和回收条件，以便开始预算估算。',
        lastStopReason: 'The workflow is waiting for the user to answer clarification questions.',
        lastInsight:
          payload.mode === 'multi-option'
            ? '先补齐目标、预算和偏好，系统再识别并比较可行方案。'
            : '先补齐预算边界和约束，系统再估算预算区间和成本拆分。',
        questions: bundle.questions,
        answers: [],
        searchTasks: bundle.searchTasks,
        calculations: bundle.calculations,
        evidence: [],
        conclusions: [],
        chartTasks: bundle.chartTasks,
        chartArtifacts: [],
      }

      db.sessions.unshift(session)
      db.reports[session.id] = bundle.report
      db.progressCursor[session.id] = 0

      pushLog({
        id: createId('log'),
        action: 'SESSION_CREATED',
        actor: resolveCurrentUser().name,
        target: session.id,
        ipAddress: 'mock',
        createdAt: nowIso(),
        status: 'success',
        summary: `Created ${payload.mode} analysis for ${payload.problemStatement}`,
        metadata: {
          mode: payload.mode,
        },
      })

      return { ...session }
    },
    async getById(sessionId) {
      await wait(120)
      const session = findSession(sessionId)
      ensureMockBundle(session)
      return structuredClone(session)
    },
    async submitAnswers(sessionId, payload) {
      await wait()
      const session = findSession(sessionId)
      const bundle = ensureMockBundle(session)
      const timeline = buildMockTimeline(session.mode)
      session.answers = payload.answers
      session.questions = session.questions.map((question) => ({
        ...question,
        answered: payload.answers.some((answer) => answer.questionId === question.id),
      }))
      session.status = 'ANALYZING'
      session.updatedAt = nowIso()
      session.activityStatus = timeline[0]?.activityStatus
      session.currentFocus = timeline[0]?.focus ?? ''
      session.lastStopReason = 'The workflow moved from clarification into analysis.'
      session.lastInsight =
        session.mode === 'multi-option'
          ? '已收到回答，系统开始识别方案并整理平行对比。'
          : '已收到回答，系统开始搜索成本证据并估算预算区间。'
      session.searchTasks = structuredClone(bundle.searchTasks).map((task) => ({
        ...task,
        status: 'running',
      }))
      session.chartTasks = structuredClone(bundle.chartTasks)
      session.chartArtifacts = []
      db.progressCursor[session.id] = 0

      pushNotification({
        id: createId('n'),
        title: 'Analysis started',
        message: `Session ${session.id} has started structured evidence synthesis.`,
        level: 'info',
        channel: 'in-app',
        read: false,
        createdAt: nowIso(),
      })

      mockRealtimeBus.emit({
        type: 'SESSION_UPDATED',
        payload: sessionSummary(session),
      })

      return structuredClone(session)
    },
    async recordAttestation(sessionId, payload) {
      await wait(120)
      const session = findSession(sessionId)
      const report = db.reports[sessionId]
      if (report?.attestationDraft) {
        report.attestationDraft = {
          ...report.attestationDraft,
          network: payload.network,
          transactionHash: payload.transactionHash,
          transactionUrl: `${report.attestationDraft.explorerUrl ?? ''}/tx/${payload.transactionHash}`,
          submittedBy: payload.submittedBy ?? '',
          submittedAt: nowIso(),
          blockNumber: payload.blockNumber,
        }
      }
      session.updatedAt = nowIso()
      return structuredClone(session)
    },
    async requestMoreFollowUp(sessionId) {
      await wait(160)
      const session = findSession(sessionId)
      session.followUpRoundsUsed = 0
      session.followUpExtensionsUsed = (session.followUpExtensionsUsed ?? 0) + 1
      session.followUpBudgetExhausted = false
      session.deferredFollowUpQuestionCount = 0
      session.status = 'CLARIFYING'
      session.updatedAt = nowIso()
      session.activityStatus = 'waiting_for_user_clarification_answers'
      session.currentFocus = '已重新打开提问窗口，等待用户继续补充关键信息。'
      session.lastStopReason = 'A new clarification window was opened by request.'
      session.chartArtifacts = []
      return structuredClone(session)
    },
    async getProgress(sessionId) {
      await wait(180)
      const session = findSession(sessionId)
      const bundle = ensureMockBundle(session)
      const timeline = buildMockTimeline(session.mode)
      const stages =
        session.mode === 'multi-option'
          ? [
              {
                id: 'clarify',
                title: '澄清决策目标',
                description: '确认目标、约束和偏好排序。',
              },
              {
                id: 'search',
                title: '识别并搜索方案',
                description: '搜索各方案的证据与约束。',
              },
              {
                id: 'compare',
                title: '整理平行优缺点',
                description: '把收益、成本、门槛和风险整理到同一框架。',
              },
              {
                id: 'visualize',
                title: '生成对比图表与表格',
                description: '输出方案对比图和表格。',
              },
              {
                id: 'report',
                title: '撰写最终决策建议',
                description: '汇总结论、建议和文字分析。',
              },
            ]
          : [
              {
                id: 'clarify',
                title: '澄清预算边界',
                description: '确认规模、目标、约束和预算敏感点。',
              },
              {
                id: 'search',
                title: '搜索成本与收入证据',
                description: '收集成本、收入和风险的外部依据。',
              },
              {
                id: 'calculate',
                title: '估算预算区间',
                description: '形成低位、基准和高位预算区间。',
              },
              {
                id: 'visualize',
                title: '生成预算图表与表格',
                description: '绘制预算结构和回收图表。',
              },
              {
                id: 'report',
                title: '撰写最终成本报告',
                description: '输出预算结论、建议和长文分析。',
              },
            ]

      if (session.status === 'ANALYZING') {
        db.progressCursor[session.id] = Math.min(
          (db.progressCursor[session.id] ?? 0) + 1,
          timeline.length,
        )
        const cursor = db.progressCursor[session.id]

        const timelineStep = timeline[Math.max(0, cursor - 1)]
        if (timelineStep) {
          session.activityStatus = timelineStep.activityStatus
          session.currentFocus = timelineStep.focus
          session.lastInsight = timelineStep.focus
        }

        session.searchTasks = session.searchTasks.map((task) => ({
          ...task,
          status: cursor >= 1 ? 'completed' : 'running',
        }))
        session.chartTasks = (session.chartTasks ?? []).map((task) => ({
          ...task,
          status: cursor >= 3 ? 'completed' : cursor >= 2 ? 'running' : 'pending',
        }))

        if (cursor >= 3) {
          session.chartArtifacts = structuredClone(bundle.charts)
        }

        if (cursor >= timeline.length) {
          session.status = 'COMPLETED'
          session.updatedAt = nowIso()
          session.activityStatus = 'completed'
          session.currentFocus = '报告、图表和表格已准备完毕，可以查看最终结果。'
          session.lastStopReason = 'The mock workflow completed successfully.'
          session.lastInsight = '最终报告、图表和表格已准备完成。'
          session.chartArtifacts = structuredClone(bundle.charts)
          db.reports[session.id] = structuredClone(bundle.report)

          pushNotification({
            id: createId('n'),
            title: 'Report ready',
            message: `${session.problemStatement} has completed successfully.`,
            level: 'success',
            channel: 'in-app',
            read: false,
            createdAt: nowIso(),
          })

          pushLog({
            id: createId('log'),
            action: 'REPORT_READY',
            actor: 'System',
            target: session.id,
            ipAddress: 'mock',
            createdAt: nowIso(),
            status: 'success',
            summary:
              'Completed staged analysis and assembled final report bundle.',
            metadata: {
              session: session.id,
            },
          })

          mockRealtimeBus.emit({
            type: 'REPORT_READY',
            payload: { sessionId: session.id },
          })
        }
      }

      const cursor = Math.min(db.progressCursor[session.id] ?? 0, timeline.length)

      return {
        sessionId: session.id,
        status: session.status,
        overallProgress:
          session.status === 'COMPLETED'
            ? 100
            : Math.round(((cursor + 1) / stages.length) * 100),
        currentStepLabel:
          session.status === 'COMPLETED'
            ? '结果已就绪'
            : (timeline[Math.min(cursor, timeline.length - 1)]?.label ?? '分析进行中'),
        nextAction:
          session.status === 'CLARIFYING'
            ? 'ask_user'
            : session.status === 'COMPLETED'
              ? 'complete'
              : 'run_mcp',
        activityStatus: session.activityStatus,
        currentFocus: session.currentFocus,
        lastStopReason: session.lastStopReason,
        stages: stages.map((stage, index) => ({
          ...stage,
          status:
            session.status === 'COMPLETED'
              ? 'completed'
              : phaseStatus(Math.min(cursor + 1, stages.length - 1), index),
        })),
        pendingQuestions:
          session.status === 'CLARIFYING'
            ? session.questions.filter((question) => !question.answered)
            : [],
        pendingSearchTasks:
          session.status === 'ANALYZING'
            ? session.searchTasks.filter((task) => task.status !== 'completed')
            : [],
        pendingCalculationTasks:
          session.status === 'ANALYZING'
            ? session.calculations.filter((task) => task.status !== 'completed')
            : [],
        pendingChartTasks:
          session.status === 'ANALYZING'
            ? (session.chartTasks ?? []).filter((task) => task.status !== 'completed')
            : [],
        chartArtifacts: structuredClone(session.chartArtifacts ?? []),
      }
    },
    async getReport(sessionId) {
      await wait(150)
      const session = findSession(sessionId)
      const bundle = ensureMockBundle(session)

      if (session.status === 'COMPLETED') {
        db.reports[session.id] = structuredClone(bundle.report)
      }

      return structuredClone(db.reports[sessionId] ?? bundle.report)
    },
  },
  settings: {
    async get() {
      await wait(120)
      return structuredClone(db.settings)
    },
    async update(payload) {
      await wait(140)
      db.settings = structuredClone(payload)
      return structuredClone(db.settings)
    },
  },
  profile: {
    async get() {
      await wait(120)
      const user = resolveCurrentUser()
      return {
        ...user,
        bio: 'This browser keeps your analysis history and preferences together in one workspace.',
        timezone: 'Asia/Shanghai',
        preferences: db.settings,
        history: db.sessions.map(sessionSummary).slice(0, 6),
      }
    },
  },
  admin: {
    async listRoles() {
      await wait(120)
      return structuredClone(db.roles)
    },
    async listUsers() {
      await wait(120)
      return structuredClone(db.users)
    },
    async updateUserRole(userId, roleIds) {
      await wait(180)
      roleIds.forEach(findRole)
      const user = findUser(userId)
      user.roles = roleIds
      user.lastActiveAt = nowIso()
      return structuredClone(user)
    },
  },
  notifications: {
    async list() {
      await wait(120)
      return structuredClone(db.notifications)
    },
    async markRead(notificationId) {
      await wait(80)
      const notification = db.notifications.find(
        (candidate) => candidate.id === notificationId,
      )
      if (notification) {
        notification.read = true
      }
    },
    async markAllRead() {
      await wait(80)
      db.notifications = db.notifications.map((notification) => ({
        ...notification,
        read: true,
      }))
    },
  },
  logs: {
    async list(meta) {
      await wait(120)
      const filtered = db.logs.filter((log) =>
        matchQuery(`${log.action} ${log.summary} ${log.target}`, meta?.q),
      )
      return paginate(filtered, meta)
    },
    async getById(logId) {
      await wait(80)
      const log = db.logs.find((candidate) => candidate.id === logId)
      if (!log) {
        throw new Error(`Unknown log: ${logId}`)
      }

      return structuredClone(log)
    },
  },
  debug: {
    async listSessions() {
      await wait(120)
      return db.sessions
        .map((session) => ({
          id: session.id,
          ownerClientId: 'mock-debug-owner',
          mode: toDebugMode(session.mode),
          problemStatement: session.problemStatement,
          status: session.status,
          eventCount:
            session.answers.length +
            session.searchTasks.length +
            session.evidence.length +
            1,
          answerCount: session.answers.length,
          evidenceCount: session.evidence.length,
          searchTaskCount: session.searchTasks.length,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },
    async getSession(sessionId) {
      await wait(120)
      const session = findSession(sessionId)
      return {
        summary: {
          id: session.id,
          ownerClientId: 'mock-debug-owner',
          mode: toDebugMode(session.mode),
          problemStatement: session.problemStatement,
          status: session.status,
          eventCount:
            session.answers.length +
            session.searchTasks.length +
            session.evidence.length +
            1,
          answerCount: session.answers.length,
          evidenceCount: session.evidence.length,
          searchTaskCount: session.searchTasks.length,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        session: {
          session_id: session.id,
          owner_client_id: 'mock-debug-owner',
          mode: toDebugMode(session.mode),
          problem_statement: session.problemStatement,
          intake_context: {
            investment_amount: session.intakeContext?.investmentAmount ?? 10000,
            base_currency: session.intakeContext?.baseCurrency ?? 'USDT',
            preferred_asset_ids: session.intakeContext?.preferredAssetIds ?? [],
            holding_period_days: session.intakeContext?.holdingPeriodDays ?? 30,
            risk_tolerance: session.intakeContext?.riskTolerance ?? 'balanced',
            liquidity_need: session.intakeContext?.liquidityNeed ?? 't_plus_3',
            minimum_kyc_level: session.intakeContext?.minimumKycLevel ?? 0,
            wallet_address: session.intakeContext?.walletAddress ?? '',
            wants_onchain_attestation:
              session.intakeContext?.wantsOnchainAttestation ?? true,
            additional_constraints:
              session.intakeContext?.additionalConstraints ?? '',
          },
          status: session.status,
          analysis_rounds_completed: session.status === 'COMPLETED' ? 1 : 0,
          follow_up_round_limit: session.followUpRoundLimit ?? 10,
          follow_up_rounds_used: session.followUpRoundsUsed ?? 0,
          follow_up_extensions_used: session.followUpExtensionsUsed ?? 0,
          follow_up_budget_exhausted: session.followUpBudgetExhausted ?? false,
          deferred_follow_up_question_count:
            session.deferredFollowUpQuestionCount ?? 0,
          activity_status:
            session.activityStatus ??
            (session.status === 'COMPLETED'
              ? 'completed'
              : 'waiting_for_user_clarification_answers'),
          current_focus:
            session.currentFocus ??
            (session.status === 'COMPLETED'
              ? 'Mock report is ready for review.'
              : 'Mock session is waiting for user clarification answers.'),
          last_stop_reason:
            session.lastStopReason ??
            (session.status === 'COMPLETED'
              ? 'The mock analysis completed successfully.'
              : 'The mock session has unanswered clarification questions.'),
          clarification_questions: session.questions.map((question) => ({
            question_id: question.id,
            question_text: question.question,
            purpose: question.purpose,
            options: question.options?.map((option) => option.label) ?? [],
            allow_custom_input: question.allowCustomInput,
            allow_skip: question.allowSkip,
            priority: question.priority,
            answered: session.answers.some(
              (answer) => answer.questionId === question.id,
            ),
          })),
          answers: session.answers.map((answer) => ({
            question_id: answer.questionId,
            value:
              answer.customInput ??
              answer.selectedOptions?.join(', ') ??
              String(answer.numericValue ?? answer.answerStatus),
            source: 'mock-frontend',
            answered_at: session.updatedAt,
          })),
          search_tasks: session.searchTasks.map((task) => ({
            task_id: task.id,
            search_topic: task.topic,
            search_goal: task.goal,
            search_scope: task.scope,
            suggested_queries: task.suggestedQueries,
            required_fields: task.requiredFields,
            freshness_requirement: task.freshnessRequirement,
            status: task.status,
            task_group: task.taskGroup ?? '',
            notes: task.notes ?? '',
          })),
          calculation_tasks: session.calculations.map((task) => ({
            task_id: task.id,
            objective: task.taskType,
            formula_hint: task.formulaExpression,
            input_params: task.inputParams,
            unit: task.units,
            result_text: task.result,
            notes: task.notes ?? '',
            status: task.status ?? task.result,
          })),
          chart_tasks: (session.chartTasks ?? []).map((task) => ({
            task_id: task.id,
            objective: task.objective,
            chart_type: task.chartType,
            title: task.title,
            preferred_unit: task.preferredUnit,
            source_task_ids: task.sourceTaskIds ?? [],
            notes: task.notes ?? '',
            status: task.status,
          })),
          evidence_items: session.evidence.map((item) => ({
            evidence_id: item.id,
            title: item.title,
            source_url: item.sourceUrl,
            source_name: item.sourceName,
            fetched_at: item.fetchedAt,
            summary: item.summary,
            extracted_facts: item.extractedFacts,
            confidence: item.confidence,
          })),
          chart_artifacts: (session.chartArtifacts ?? []).map((artifact) => ({
            chart_id: artifact.id,
            chart_type: artifact.kind,
            title: artifact.title,
            spec: {
              unit: artifact.unit,
            },
            notes: artifact.note ?? '',
          })),
          major_conclusions: session.conclusions.map((item) => ({
            conclusion_id: item.id,
            content: item.conclusion,
            conclusion_type: item.conclusionType,
            basis_refs: item.basisRefs,
            confidence: item.confidence,
          })),
          report: null,
          events: [
            {
              timestamp: session.createdAt,
              kind: 'session_created',
              payload: {
                mode: session.mode,
              },
            },
            ...session.answers.map((answer, index) => ({
              timestamp: session.updatedAt,
              kind: 'answer_recorded',
              payload: {
                order: index + 1,
                question_id: answer.questionId,
              },
            })),
          ],
          created_at: session.createdAt,
          updated_at: session.updatedAt,
        },
      }
    },
  },
  files: {
    async list() {
      await wait(120)
      return structuredClone(db.files)
    },
    async upload(payload) {
      await wait(260)
      const file = {
        id: createId('f'),
        name: payload.fileName,
        size: payload.size,
        mime: payload.mime,
        intent: payload.intent,
        status: 'available',
        tags: ['uploaded'],
        createdAt: nowIso(),
      } satisfies FileItem

      db.files.unshift(file)

      mockRealtimeBus.emit({
        type: 'FILE_UPLOADED',
        payload: file,
      })

      return structuredClone(file)
    },
  },
  dataviz: {
    async getBundle() {
      await wait()
      return buildDataVizBundle(db)
    },
  },
  resources: {
    async list(resourceKey, meta) {
      await wait(160)
      const filtered = resourceRecords(resourceKey).filter((record) =>
        matchQuery(`${record.title} ${record.subtitle ?? ''}`, meta?.q),
      )
      return paginate(filtered, meta)
    },
    async getById(resourceKey, recordId) {
      await wait(100)
      const record = resourceRecords(resourceKey).find(
        (item) => item.id === recordId,
      )
      if (!record) {
        throw new Error(`Unknown record ${resourceKey}/${recordId}`)
      }

      return structuredClone(record)
    },
    async save(resourceKey, record) {
      await wait(180)
      const currentRecords = resourceRecords(resourceKey)
      const existing = currentRecords.find((item) => item.id === record.id)
      const savedRecord: ResourceRecord = {
        id: record.id ?? createId(resourceKey),
        title: String(record.title ?? existing?.title ?? 'Untitled resource'),
        subtitle: String(record.subtitle ?? existing?.subtitle ?? ''),
        status: String(record.status ?? existing?.status ?? 'draft'),
        updatedAt: nowIso(),
      }

      if (resourceKey === 'roles') {
        const target = existing ? findRole(existing.id) : null
        if (target) {
          target.description = savedRecord.subtitle ?? ''
        } else {
          db.roles.push({
            id: savedRecord.id,
            name: savedRecord.title,
            description: savedRecord.subtitle ?? '',
            permissions: ['analysis.run'],
            memberCount: 0,
          })
        }
      } else {
        const existingCustomRecords = customResources[resourceKey] ?? []
        const nextRecords = existingCustomRecords.filter(
          (item) => item.id !== savedRecord.id,
        )
        nextRecords.unshift(savedRecord)
        customResources[resourceKey] = nextRecords
      }

      return savedRecord
    },
  },
}
