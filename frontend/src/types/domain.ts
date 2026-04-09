export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>
export type LanguageCode = 'zh' | 'en'
export type ApiMode = 'mock' | 'rest'
export type DisplayDensity = 'cozy' | 'compact'

export type AnalysisMode = 'single-option' | 'multi-option'
export type AssetType =
  | 'stablecoin'
  | 'mmf'
  | 'precious_metal'
  | 'real_estate'
  | 'stocks'
  | 'benchmark'
export type SessionStatus =
  | 'INIT'
  | 'CLARIFYING'
  | 'ANALYZING'
  | 'READY_FOR_REPORT'
  | 'REPORTING'
  | 'COMPLETED'
  | 'FAILED'

export type AnswerStatus = 'answered' | 'skipped' | 'uncertain' | 'declined'
export type ConclusionType = 'fact' | 'estimate' | 'inference'
export type EvidenceSourceType = 'web' | 'internal' | 'user'
export type ChartKind = 'line' | 'bar' | 'scatter' | 'radar' | 'heatmap' | 'pie'
export type ChartValueNature = 'actual' | 'estimated' | 'inferred'
export type NotificationLevel = 'info' | 'success' | 'warning' | 'critical'
export type NotificationChannel = 'in-app' | 'email' | 'push'
export type FileStatus = 'available' | 'processing' | 'failed'
export type UploadIntent = 'report' | 'evidence' | 'attachment'
export type RealtimeTransport = 'mock' | 'websocket' | 'sse'
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive'
export type LiquidityNeed = 'instant' | 't_plus_3' | 'locked'

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  nextPage?: number
}

export interface RequestMeta {
  page?: number
  pageSize?: number
  q?: string
  sort?: string
  filters?: Record<string, string | number | boolean | undefined>
}

export interface Permission {
  id: string
  label: string
  description: string
  resource: string
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  memberCount: number
}

export interface User {
  id: string
  name: string
  email: string
  title: string
  avatarUrl?: string
  locale: LanguageCode
  roles: string[]
  lastActiveAt: string
}

export interface UserProfile extends User {
  bio: string
  timezone: string
  preferences: SettingsPayload
  history: AnalysisSessionSummary[]
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthSession extends AuthTokens {
  user: User
}

export interface LoginPayload {
  email: string
  password: string
  mfaCode?: string
}

export interface ModeDefinition {
  id: AnalysisMode
  title: string
  subtitle: string
  description: string
  valueLens: string[]
  icon: string
}

export interface HashKeyChainConfig {
  ecosystemName: string
  nativeTokenSymbol: string
  defaultExecutionNetwork: string
  testnetChainId: number
  testnetRpcUrl: string
  testnetExplorerUrl: string
  mainnetChainId: number
  mainnetRpcUrl: string
  mainnetExplorerUrl: string
  planRegistryAddress?: string
  kycSbtAddress?: string
  docsUrls: string[]
}

export interface RwaIntakeContext {
  investmentAmount: number
  baseCurrency: string
  preferredAssetIds: string[]
  holdingPeriodDays: number
  riskTolerance: RiskTolerance
  liquidityNeed: LiquidityNeed
  minimumKycLevel: number
  walletAddress?: string
  wantsOnchainAttestation: boolean
  additionalConstraints?: string
}

export interface RwaAssetTemplate {
  id: string
  symbol: string
  name: string
  assetType: AssetType
  description: string
  issuer?: string
  custody?: string
  chainId: number
  contractAddress?: string
  settlementAsset: string
  executionStyle: string
  benchmarkApy: number
  expectedReturnLow: number
  expectedReturnBase: number
  expectedReturnHigh: number
  priceVolatility: number
  maxDrawdown180d: number
  avgDailyVolumeUsd: number
  redemptionDays: number
  lockupDays: number
  managementFeeBps: number
  entryFeeBps: number
  exitFeeBps: number
  slippageBps: number
  depegEvents90d?: number
  worstDepegBps90d?: number
  issuerDisclosureScore: number
  custodyDisclosureScore: number
  auditDisclosureScore: number
  contractIsUpgradeable: boolean
  hasAdminKey: boolean
  oracleCount: number
  oracleSources: string[]
  requiresKycLevel?: number
  minimumTicketUsd: number
  tags: string[]
  thesis: string
  fitSummary: string
  evidenceUrls: string[]
  featured: boolean
}

export interface ClarificationOption {
  value: string
  label: string
  description?: string
}

export type ClarificationFieldType =
  | 'single-choice'
  | 'multi-choice'
  | 'text'
  | 'number'
  | 'slider'
  | 'textarea'

export interface ClarificationQuestion {
  id: string
  sessionId: string
  question: string
  purpose: string
  questionGroup?: string
  inputHint?: string
  exampleAnswer?: string
  fieldType: ClarificationFieldType
  options?: ClarificationOption[]
  allowCustomInput: boolean
  allowSkip: boolean
  min?: number
  max?: number
  unit?: string
  priority: number
  recommended?: string[]
  answered?: boolean
}

export interface UserAnswer {
  id: string
  questionId: string
  selectedOptions?: string[]
  customInput?: string
  numericValue?: number
  answerStatus: AnswerStatus
}

export interface SearchTask {
  id: string
  sessionId: string
  topic: string
  goal: string
  scope: string
  suggestedQueries: string[]
  requiredFields: string[]
  freshnessRequirement: 'standard' | 'high'
  status: 'pending' | 'running' | 'completed'
  taskGroup?: string
  notes?: string
}

export interface EvidenceItem {
  id: string
  sessionId: string
  sourceType: EvidenceSourceType
  sourceUrl: string
  sourceName: string
  title: string
  summary: string
  extractedFacts: string[]
  fetchedAt: string
  confidence: number
}

export interface CalculationTask {
  id: string
  sessionId: string
  taskType: string
  formulaExpression: string
  inputParams: Record<string, string | number>
  units: string
  result: string
  errorMargin?: string
  notes?: string
  status?: string
  createdAt: string
}

export interface ChartTask {
  id: string
  sessionId: string
  objective: string
  chartType: ChartKind
  title: string
  preferredUnit?: string
  sourceTaskIds?: string[]
  notes?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface MajorConclusionItem {
  id: string
  sessionId: string
  conclusion: string
  conclusionType: ConclusionType
  basisRefs: string[]
  confidence: number
  createdAt: string
}

export interface MetricHighlight {
  id: string
  label: string
  value: string
  detail: string
  trend?: 'up' | 'down' | 'flat'
}

export interface ChartSeriesDatum {
  label: string
  value: number
  group?: string
  nature?: ChartValueNature
  intensity?: number
}

export interface HeatmapDatum {
  x: string
  y: string
  value: number
  nature?: ChartValueNature
}

export interface RadarDatum {
  dimension: string
  value: number
}

export interface ChartArtifact {
  id: string
  sessionId: string
  kind: ChartKind
  title: string
  subtitle?: string
  unit?: string
  source?: string
  note?: string
  lineSeries?: ChartSeriesDatum[]
  compareSeries?: ChartSeriesDatum[]
  scatterSeries?: ChartSeriesDatum[]
  radarSeries?: Array<{ name: string; values: RadarDatum[] }>
  heatmapSeries?: HeatmapDatum[]
}

export interface BudgetLineItem {
  id: string
  name: string
  category: string
  itemType: 'cost' | 'income' | 'opportunity_cost' | string
  low: number
  base: number
  high: number
  currency: string
  rationale?: string
  basisRefs: string[]
  confidence: number
}

export interface BudgetSummary {
  currency: string
  totalCostLow: number
  totalCostBase: number
  totalCostHigh: number
  totalIncomeLow: number
  totalIncomeBase: number
  totalIncomeHigh: number
  netLow: number
  netBase: number
  netHigh: number
  reserveNote?: string
}

export interface OptionProfile {
  id: string
  name: string
  summary: string
  pros: string[]
  cons: string[]
  conditions: string[]
  fitFor: string[]
  cautionFlags: string[]
  estimatedCostLow?: number
  estimatedCostBase?: number
  estimatedCostHigh?: number
  currency: string
  score?: number
  confidence: number
  basisRefs: string[]
}

export interface RiskVector {
  assetId: string
  assetName: string
  market: number
  liquidity: number
  pegRedemption: number
  issuerCustody: number
  smartContract: number
  oracleDependency: number
  complianceAccess: number
  overall: number
}

export interface SimulationPathPoint {
  day: number
  p10Value: number
  p50Value: number
  p90Value: number
}

export interface HoldingPeriodSimulation {
  assetId: string
  assetName: string
  holdingPeriodDays: number
  endingValueLow: number
  endingValueBase: number
  endingValueHigh: number
  returnPctLow: number
  returnPctBase: number
  returnPctHigh: number
  var95Pct: number
  cvar95Pct: number
  maxDrawdownLowPct: number
  maxDrawdownBasePct: number
  maxDrawdownHighPct: number
  scenarioNote: string
  path: SimulationPathPoint[]
}

export interface PortfolioAllocation {
  assetId: string
  assetName: string
  targetWeightPct: number
  suggestedAmount: number
  rationale: string
  blockedReason?: string
}

export interface TxDraftStep {
  step: number
  title: string
  description: string
  actionType: string
  targetContract?: string
  explorerUrl?: string
  estimatedFeeUsd: number
  caution?: string
}

export interface TxDraft {
  title: string
  chainId: number
  chainName: string
  fundingAsset: string
  totalEstimatedFeeUsd: number
  steps: TxDraftStep[]
  riskWarnings: string[]
  canExecuteOnchain: boolean
}

export interface AttestationDraft {
  chainId: number
  reportHash: string
  portfolioHash: string
  attestationHash: string
  createdAt: string
  contractAddress?: string
  explorerUrl?: string
  eventName: string
  ready: boolean
}

export interface AssetAnalysisCard {
  assetId: string
  symbol: string
  name: string
  assetType: AssetType
  issuer?: string
  custody?: string
  chainId: number
  contractAddress?: string
  expectedReturnLow: number
  expectedReturnBase: number
  expectedReturnHigh: number
  exitDays: number
  totalCostBps: number
  kycRequiredLevel?: number
  thesis: string
  fitSummary: string
  tags: string[]
  riskVector: RiskVector
  metadata: Record<string, unknown>
  evidenceRefs: string[]
}

export interface RwaBootstrap {
  appName: string
  chainConfig: HashKeyChainConfig
  assetLibrary: RwaAssetTemplate[]
  supportedAssetTypes: string[]
  holdingPeriodPresets: number[]
  notes: string[]
}

export interface ReportTable {
  id: string
  title: string
  columns: string[]
  rows: Array<Record<string, string | number | null>>
  notes?: string
}

export interface AnalysisReport {
  id: string
  sessionId: string
  mode: AnalysisMode
  summaryTitle: string
  markdown: string
  highlights: MetricHighlight[]
  calculations: CalculationTask[]
  charts: ChartArtifact[]
  evidence: EvidenceItem[]
  assumptions: string[]
  disclaimers: string[]
  budgetSummary?: BudgetSummary
  budgetItems?: BudgetLineItem[]
  optionProfiles?: OptionProfile[]
  tables?: ReportTable[]
  chainConfig?: HashKeyChainConfig
  assetCards: AssetAnalysisCard[]
  simulations: HoldingPeriodSimulation[]
  recommendedAllocations: PortfolioAllocation[]
  txDraft?: TxDraft
  attestationDraft?: AttestationDraft
  exportedAt?: string
}

export interface AnalysisStage {
  id: string
  title: string
  description: string
  status: 'pending' | 'active' | 'completed'
}

export interface AnalysisProgress {
  sessionId: string
  status: SessionStatus
  overallProgress: number
  currentStepLabel: string
  errorMessage?: string
  nextAction?: 'ask_user' | 'run_mcp' | 'preview_report' | 'complete'
  activityStatus?: string
  currentFocus?: string
  lastStopReason?: string
  stages: AnalysisStage[]
  pendingQuestions?: ClarificationQuestion[]
  pendingSearchTasks?: SearchTask[]
  pendingCalculationTasks?: CalculationTask[]
  pendingChartTasks?: ChartTask[]
  chartArtifacts?: ChartArtifact[]
}

export interface AnalysisSessionSummary {
  id: string
  mode: AnalysisMode
  locale?: LanguageCode
  problemStatement: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
  lastInsight: string
}

export interface AnalysisSession extends AnalysisSessionSummary {
  errorMessage?: string
  followUpRoundLimit?: number
  followUpRoundsUsed?: number
  followUpExtensionsUsed?: number
  followUpBudgetExhausted?: boolean
  deferredFollowUpQuestionCount?: number
  activityStatus?: string
  currentFocus?: string
  lastStopReason?: string
  intakeContext: RwaIntakeContext
  questions: ClarificationQuestion[]
  answers: UserAnswer[]
  searchTasks: SearchTask[]
  evidence: EvidenceItem[]
  conclusions: MajorConclusionItem[]
  calculations: CalculationTask[]
  chartTasks?: ChartTask[]
  chartArtifacts?: ChartArtifact[]
}

export interface DashboardMetric {
  id: string
  label: string
  value: string
  change: string
  detail: string
}

export interface ActivityItem {
  id: string
  title: string
  detail: string
  createdAt: string
  tone: 'neutral' | 'positive' | 'warning'
}

export interface DashboardOverview {
  metrics: DashboardMetric[]
  recentSessions: AnalysisSessionSummary[]
  activity: ActivityItem[]
  charts: ChartArtifact[]
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  level: NotificationLevel
  channel: NotificationChannel
  read: boolean
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  action: string
  actor: string
  target: string
  ipAddress: string
  createdAt: string
  status: 'success' | 'warning' | 'error'
  summary: string
  metadata: Record<string, string>
}

export interface FileItem {
  id: string
  name: string
  size: number
  mime: string
  folderId?: string
  tags: string[]
  createdAt: string
  status: FileStatus
  intent: UploadIntent
}

export interface DataVizBundle {
  charts: ChartArtifact[]
  notes: string[]
}

export interface SettingsPayload {
  themeMode: ThemeMode
  language: LanguageCode
  apiMode: ApiMode
  displayDensity: DisplayDensity
  notificationsEmail: boolean
  notificationsPush: boolean
  autoExportPdf: boolean
  chartMotion: boolean
}

export interface RealtimeEvent {
  type:
    | 'NOTIFICATION_CREATED'
    | 'SESSION_UPDATED'
    | 'REPORT_READY'
    | 'AUDIT_LOG_ADDED'
    | 'FILE_UPLOADED'
  payload: Record<string, unknown>
}

export interface ResourceRecord {
  id: string
  title: string
  subtitle?: string
  status?: string
  updatedAt: string
  [key: string]: unknown
}

export interface CreateSessionPayload {
  mode: AnalysisMode
  locale: LanguageCode
  problemStatement: string
  intakeContext: RwaIntakeContext
}

export interface SubmitAnswersPayload {
  answers: UserAnswer[]
}

export interface FileUploadPayload {
  fileName: string
  size: number
  mime: string
  intent: UploadIntent
}

export interface ExportPayload {
  title: string
  headers: string[]
  rows: Array<Array<string | number>>
}
