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
export type WalletNetworkKey = 'testnet' | 'mainnet'
export type DataSourceTag =
  | 'onchain_verified'
  | 'oracle_fed'
  | 'issuer_disclosed'
  | 'third_party_source'
  | 'model_inference'
  | 'user_assumption'

export type KycStatus = 'none' | 'approved' | 'revoked' | 'unavailable'

export interface OracleSnapshotBackend {
  feedId: string
  pair: string
  network: WalletNetworkKey | string
  sourceName: string
  sourceUrl: string
  feedAddress: string
  explorerUrl?: string
  price?: number
  decimals: number
  fetchedAt: string
  updatedAt?: string
  roundId?: number
  note?: string
  status: 'live' | 'unavailable' | 'demo' | string
}

export interface KycOnchainResult {
  walletAddress: string
  network: WalletNetworkKey | string
  contractAddress?: string
  status: KycStatus
  isHuman: boolean
  level: number
  sourceUrl?: string
  explorerUrl?: string
  fetchedAt: string
  note?: string
}

export interface TxReceipt {
  transactionHash: string
  transactionUrl: string
  blockNumber?: number
  submittedBy?: string
  submittedAt?: string
  network: WalletNetworkKey | string
}

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
  testnetPlanRegistryAddress?: string
  mainnetPlanRegistryAddress?: string
  testnetKycSbtAddress?: string
  mainnetKycSbtAddress?: string
  docsUrls: string[]
  oracleFeeds: OracleFeedConfig[]
}

export interface OracleFeedConfig {
  id: string
  pair: string
  sourceName: string
  docsUrl?: string
  testnetAddress?: string
  mainnetAddress?: string
  decimals: number
}

export interface MarketDataSnapshot {
  feedId: string
  pair: string
  network: WalletNetworkKey
  sourceName: string
  sourceUrl: string
  feedAddress: string
  explorerUrl?: string
  price?: number
  decimals: number
  fetchedAt: string
  updatedAt?: string
  roundId?: number
  note?: string
  status: 'live' | 'unavailable' | 'demo' | string
}

export interface WalletKycSnapshot {
  walletAddress: string
  network: WalletNetworkKey
  contractAddress?: string
  status: KycStatus
  isHuman: boolean
  level: number
  sourceUrl?: string
  explorerUrl?: string
  fetchedAt: string
  note?: string
}

export type AssetStatus =
  | 'production'
  | 'verified'
  | 'issuer_disclosed'
  | 'benchmark'
  | 'demo'
  | 'experimental'

export type TruthLevel =
  | 'onchain_verified'
  | 'issuer_disclosed'
  | 'benchmark_reference'
  | 'demo_only'

export type LiveReadiness = 'ready' | 'partial' | 'unavailable' | 'demo_only'

export type ActionType =
  | 'subscribe'
  | 'mint'
  | 'redeem'
  | 'hold'
  | 'learn_more'
  | 'external_only'

export type ActionReadiness = 'ready' | 'partial' | 'unavailable'

export type EvidenceFactType =
  | 'onchain_verified_fact'
  | 'offchain_disclosed_fact'
  | 'oracle_fact'
  | 'third_party_fact'
  | 'inferred_fact'

export type EvidenceFreshnessBucket = 'fresh' | 'aging' | 'stale' | 'undated'

export interface RwaIntakeContext {
  investmentAmount: number
  baseCurrency: string
  preferredAssetIds: string[]
  holdingPeriodDays: number
  riskTolerance: RiskTolerance
  liquidityNeed: LiquidityNeed
  minimumKycLevel: number
  walletAddress?: string
  walletNetwork?: WalletNetworkKey | ''
  walletKycLevelOnchain?: number
  walletKycVerified?: boolean
  wantsOnchainAttestation: boolean
  additionalConstraints?: string
  includeNonProductionAssets?: boolean
  demoMode?: boolean
  demoScenarioId?: string
  analysisSeed?: number
}

export interface ActionLink {
  kind: string
  label: string
  url: string
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
  primarySourceUrl?: string
  onchainVerified?: boolean
  issuerDisclosed?: boolean
  featured: boolean
  statuses?: AssetStatus[]
  truthLevel?: TruthLevel
  liveReadiness?: LiveReadiness
  defaultRankEligible?: boolean
  statusExplanation?: string
  truthLevelExplanation?: string
  actionType?: ActionType
  actionReadiness?: ActionReadiness
  actionLinks?: ActionLink[]
  actionBlockerReasons?: string[]
  executionNotes?: string[]
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
  assetId?: string
  sourceType: EvidenceSourceType
  sourceUrl: string
  sourceName: string
  title: string
  summary: string
  extractedFacts: string[]
  fetchedAt: string
  confidence: number
  sourceTag?: DataSourceTag
  factType?: EvidenceFactType
  freshness?: {
    bucket: EvidenceFreshnessBucket
    label: string
    ageHours?: number
    staleWarning?: string
  }
  conflictKeys?: string[]
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
  validationState?: 'pending' | 'validated' | 'rejected'
  failureReason?: string
  userVisible?: boolean
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

export interface RiskBreakdownItem {
  dimension: string
  rawValue?: number
  normalizedScore: number
  weight: number
  evidenceRefs: string[]
  dataStatus?: string
  note?: string
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
  network?: WalletNetworkKey | string
  contractAddress?: string
  explorerUrl?: string
  eventName: string
  ready: boolean
  transactionHash?: string
  transactionUrl?: string
  submittedBy?: string
  submittedAt?: string
  blockNumber?: number
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
  primarySourceUrl?: string
  onchainVerified?: boolean
  issuerDisclosed?: boolean
  statuses?: AssetStatus[]
  truthLevel?: TruthLevel
  liveReadiness?: LiveReadiness
  defaultRankEligible?: boolean
  statusExplanation?: string
  truthLevelExplanation?: string
  riskVector: RiskVector
  riskBreakdown: RiskBreakdownItem[]
  riskDataQuality: number
  metadata: Record<string, unknown>
  evidenceRefs: string[]
}

export interface ComparisonMatrixMetric {
  key: string
  label: string
  description?: string
  unit?: string
}

export interface ComparisonMatrixCell {
  metricKey: string
  label: string
  displayValue: string
  rawValue?: string | number | boolean | null
  tone: 'neutral' | 'success' | 'gold' | 'warning' | 'danger' | string
  badges: string[]
  rationale: string
  tooltip: string
  isBlocked: boolean
}

export interface ComparisonMatrixRow {
  assetId: string
  assetName: string
  assetSymbol: string
  statuses: AssetStatus[]
  truthLevel: TruthLevel
  liveReadiness: LiveReadiness
  defaultRankEligible: boolean
  cells: ComparisonMatrixCell[]
}

export interface ComparisonMatrix {
  title: string
  metrics: ComparisonMatrixMetric[]
  rows: ComparisonMatrixRow[]
  notes: string[]
}

export interface RecommendationDriver {
  title: string
  detail: string
  impact: string
  assetId?: string
}

export interface ExcludedAssetReason {
  assetId: string
  assetName: string
  category?: string
  reason: string
}

export interface ConstraintImpact {
  constraintKey: string
  label: string
  impactLevel: string
  detail: string
}

export interface SensitivitySummary {
  scenarioKey: string
  label: string
  impactSummary: string
  changedAssets: string[]
  recommendedShift: string
}

export interface RecommendationReason {
  summary: string
  topDrivers: RecommendationDriver[]
  excludedReasons: ExcludedAssetReason[]
  constraintImpacts: ConstraintImpact[]
  sensitivitySummary: SensitivitySummary[]
}

export interface ActionBlocker {
  code: string
  label: string
  detail: string
  severity: string
}

export interface ActionIntent {
  assetId: string
  assetName: string
  actionType: ActionType
  actionReadiness: ActionReadiness
  summary: string
  actionBlockers: ActionBlocker[]
  actionLinks: ActionLink[]
  executionNotes: string[]
  checklist: string[]
}

export interface EvidenceConflict {
  assetId?: string
  fieldKey: string
  severity: string
  summary: string
  evidenceIds: string[]
}

export interface EvidenceCoverage {
  assetId: string
  assetName?: string
  coverageScore: number
  completenessScore: number
  strengths: string[]
  gaps: string[]
  missingFields: string[]
}

export interface EvidenceGovernance {
  overallScore: number
  weakEvidenceWarning: string
  conflicts: EvidenceConflict[]
  coverage: EvidenceCoverage[]
}

export interface DemoScenarioDefinition {
  scenarioId: string
  title: string
  description: string
  problemStatement: string
  intakeContext: RwaIntakeContext
  featuredAssetIds: string[]
  analysisSeed: number
  demoLabel: string
  notes: string[]
}

export interface DiffFieldChange {
  label: string
  before: string
  after: string
  detail?: string
}

export interface AllocationDiffItem {
  assetId: string
  assetName: string
  beforeWeightPct: number
  afterWeightPct: number
  deltaWeightPct: number
  reason?: string
}

export interface RiskDiffItem {
  assetId: string
  assetName: string
  beforeOverall: number
  afterOverall: number
  deltaOverall: number
}

export interface EvidenceDiffItem {
  assetId?: string
  assetName?: string
  beforeCoverageScore: number
  afterCoverageScore: number
  beforeConflictCount: number
  afterConflictCount: number
  summary: string
}

export interface ReanalysisDiff {
  previousSnapshotAt?: string
  currentGeneratedAt?: string
  summary: string
  changedConstraints: DiffFieldChange[]
  changedWeights: AllocationDiffItem[]
  changedRisk: RiskDiffItem[]
  changedEvidence: EvidenceDiffItem[]
  previousRecommendation: string[]
  currentRecommendation: string[]
  whyChanged: string[]
}

export interface MethodologyReference {
  key: string
  title: string
  url: string
  summary: string
}

export interface SourceProvenanceRef {
  refId: string
  title: string
  sourceName: string
  sourceUrl: string
  sourceKind: string
  sourceTier: string
  freshnessDate?: string
  verifiedSummary: string
}

export interface ConfidenceBand {
  label: string
  low: number
  base: number
  high: number
  unit: string
  confidenceLevel: number
  note?: string
}

export interface StressScenario {
  scenarioKey: string
  title: string
  severity: string
  narrative: string
  portfolioImpactPct: number
  liquidityImpactDays: number
  affectedAssetIds: string[]
  sourceProvenanceRefs: string[]
}

export interface ReserveBackingSummary {
  title: string
  summary: string
  reserveQualityScore: number
  attestationStatus: string
  liquidityNotice?: string
  assetSymbols: string[]
  sourceProvenanceRefs: string[]
}

export interface RwaBootstrap {
  appName: string
  chainConfig: HashKeyChainConfig
  assetLibrary: RwaAssetTemplate[]
  supportedAssetTypes: string[]
  holdingPeriodPresets: number[]
  notes: string[]
  oracleSnapshots?: OracleSnapshotBackend[]
  demoScenarios?: DemoScenarioDefinition[]
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
  unknowns?: string[]
  warnings?: string[]
  disclaimers: string[]
  budgetSummary?: BudgetSummary
  budgetItems?: BudgetLineItem[]
  optionProfiles?: OptionProfile[]
  tables?: ReportTable[]
  confidenceBand?: ConfidenceBand
  stressScenarios?: StressScenario[]
  reserveBackingSummary?: ReserveBackingSummary
  sourceProvenanceRefs?: SourceProvenanceRef[]
  oracleStressScore?: number
  chainConfig?: HashKeyChainConfig
  kycSnapshot?: KycOnchainResult
  marketSnapshots?: MarketDataSnapshot[]
  assetCards: AssetAnalysisCard[]
  simulations: HoldingPeriodSimulation[]
  recommendedAllocations: PortfolioAllocation[]
  comparisonMatrix?: ComparisonMatrix
  recommendationReason?: RecommendationReason
  actionIntents?: ActionIntent[]
  evidenceGovernance?: EvidenceGovernance
  reanalysisDiff?: ReanalysisDiff
  methodologyReferences?: MethodologyReference[]
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

export interface RecordAttestationPayload {
  network: WalletNetworkKey
  transactionHash: string
  submittedBy?: string
  blockNumber?: number
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
