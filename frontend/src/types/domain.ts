export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>
export type LanguageCode = 'en' | 'zh-CN' | 'zh-HK'
export type ApiMode = 'mock' | 'rest'
export type DisplayDensity = 'cozy' | 'compact'

export type AnalysisMode =
  | 'single-asset-allocation'
  | 'strategy-compare'
  | 'single-option'
  | 'multi-option'
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
  | 'READY_FOR_EXECUTION'
  | 'EXECUTING'
  | 'MONITORING'
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
export type EligibilityStatus = 'eligible' | 'conditional' | 'blocked'
export type ExecutionLifecycleStatus =
  | 'prepared'
  | 'submitted'
  | 'redirect_required'
  | 'pending_settlement'
  | 'completed'
  | 'failed'
export type TransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed'
export type SettlementStatus =
  | 'not_started'
  | 'pending'
  | 'delayed'
  | 'completed'
  | 'failed'
export type ProofPublishStatus = 'pending' | 'published' | 'retry' | 'failed' | 'skipped'
export type AlertEventStatus = 'open' | 'resolved'

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
  assetProofRegistryAddress?: string
  testnetPlanRegistryAddress?: string
  mainnetPlanRegistryAddress?: string
  testnetKycSbtAddress?: string
  mainnetKycSbtAddress?: string
  testnetAssetProofRegistryAddress?: string
  mainnetAssetProofRegistryAddress?: string
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

export type LiveReadiness = 'ready' | 'partial' | 'unavailable' | 'demo_only' | 'benchmark_only'
export type ExecutionAdapterKind = 'direct_contract' | 'issuer_portal' | 'view_only'
export type ExecutionReadiness = 'ready' | 'requires_issuer' | 'view_only' | 'blocked'

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
  budgetRange?: string
  timeHorizonLabel?: string
  riskPreferenceLabel?: string
  mustHaveGoals?: string[]
  mustAvoidOutcomes?: string[]
  draftPrompt?: string
  investmentAmount: number
  baseCurrency: string
  preferredAssetIds: string[]
  holdingPeriodDays: number
  riskTolerance: RiskTolerance
  liquidityNeed: LiquidityNeed
  minimumKycLevel: number
  walletAddress?: string
  safeAddress?: string
  walletNetwork?: WalletNetworkKey | ''
  walletKycLevelOnchain?: number
  walletKycVerified?: boolean
  kycLevel?: number
  kycStatus?: string
  investorType?: string
  jurisdiction?: string
  sourceChain?: string
  sourceAsset?: string
  ticketSize?: number
  liquidityUrgency?: string
  lockupTolerance?: string
  targetYield?: number
  maxDrawdownTolerance?: number
  custodyPreference?: string
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
  protocolName?: string
  permissioningStandard?: string
  requiredKycLevel?: number
  eligibleInvestorTypes?: string[]
  restrictedJurisdictions?: string[]
  minSubscriptionAmount?: number
  redemptionWindow?: string
  settlementAsset: string
  oracleProvider?: string
  oracleContract?: string
  lastOracleTimestamp?: string
  navOrPrice?: number
  indicativeYield?: number
  reserveSummary?: string
  custodySummary?: string
  bridgeSupport?: string[]
  proofRefs?: string[]
  secondaryMarketAvailable?: boolean
  riskFlags?: string[]
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
  contractAddress?: string
  chainId?: number
  oracleProvider?: string
  proofType?: string
  lastVerifiedAt?: string
  includedInExecutionPlan?: boolean
  reportSectionKeys?: string[]
  executionStepIds?: string[]
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
  reportSectionKeys?: string[]
  executionStepIds?: string[]
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
  evidenceHash?: string
  executionPlanHash?: string
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

export interface WalletBalance {
  symbol: string
  amount: number
  chainId: number
  contractAddress?: string
  usdValue: number
  price: number
}

export interface WalletSummary {
  address: string
  network: WalletNetworkKey | string
  balances: WalletBalance[]
  kyc: KycOnchainResult
  safeDetected: boolean
  lastSyncAt: string
}

export interface EligibilityDecision {
  id: string
  assetId: string
  assetName: string
  chainId: number
  contractAddress?: string
  status: EligibilityStatus
  reasons: string[]
  missingRequirements: string[]
  nextActions: string[]
  checkedAt: string
}

export interface ExecutionApproval {
  approvalType: string
  tokenSymbol?: string
  spender?: string
  approvalTarget?: string
  amount?: number
  note?: string
  allowanceRequired?: boolean
}

export interface ExecutionQuote {
  sourceAsset: string
  targetAsset: string
  amountIn: number
  expectedAmountOut: number
  feeAmount: number
  feeBps: number
  gasEstimate: number
  gasEstimateUsd: number
  etaSeconds: number
  routeType: string
  warnings: string[]
}

export interface ExecutionStep {
  id: string
  stepIndex: number
  title: string
  description: string
  stepType: string
  routeKind: string
  assetId?: string
  targetContract?: string
  explorerUrl?: string
  chainId?: number
  estimatedFeeUsd: number
  expectedAmount?: number
  requiresSignature: boolean
  requiresWallet: boolean
  requiresSafe: boolean
  complianceBlockers: string[]
  requiredApprovals: ExecutionApproval[]
  checklist: string[]
  warnings: string[]
  txRequest: Record<string, unknown>
  offchainActions: string[]
  redirectUrl?: string
  externalRequestId?: string
  status: string
}

export interface ExecutionPlan {
  id: string
  sessionId: string
  generatedAt: string
  walletAddress?: string
  safeAddress?: string
  sourceChain?: string
  sourceAsset?: string
  targetAsset?: string
  executionAdapterKind?: ExecutionAdapterKind
  executionReadiness?: ExecutionReadiness
  readinessReason?: string
  externalActionUrl?: string
  externalActionLabel?: string
  ticketSize: number
  receiptId?: string
  status: ExecutionLifecycleStatus
  quote?: ExecutionQuote
  warnings: string[]
  simulationWarnings: string[]
  possibleFailureReasons: string[]
  complianceBlockers: string[]
  requiredApprovals: ExecutionApproval[]
  checklist: string[]
  externalSteps: string[]
  steps: ExecutionStep[]
  txBundle: Array<Record<string, unknown>>
  eligibility: EligibilityDecision[]
  canExecuteOnchain: boolean
  planHash?: string
}

export interface ExecutionReceipt {
  id: string
  sessionId?: string
  assetId: string
  adapterKind: ExecutionAdapterKind
  status: ExecutionLifecycleStatus
  settlementStatus: SettlementStatus
  preparedPayload: Record<string, unknown>
  submitPayload: Record<string, unknown>
  externalRequestId?: string
  redirectUrl?: string
  txHash?: string
  blockNumber?: number
  walletAddress?: string
  safeAddress?: string
  failureReason?: string
  note?: string
  submittedAt?: string
  updatedAt: string
}

export interface AssetReadiness {
  asset: RwaAssetTemplate
  proof: AssetProofSnapshot
  decision: EligibilityDecision
  executionAdapterKind: ExecutionAdapterKind
  executionReadiness: ExecutionReadiness
  routeSummary: string
  quote?: ExecutionQuote
  requiredApprovals: ExecutionApproval[]
  possibleFailureReasons: string[]
  complianceBlockers: string[]
  warnings: string[]
}

export interface PortfolioOverview {
  address: string
  network: WalletNetworkKey | string
  positions: PositionSnapshot[]
  proofSnapshots: AssetProofSnapshot[]
  alerts: PortfolioAlert[]
  indexerHealth?: IndexerStatusItem[]
  latestAnchorSummary?: ContractAnchorSummary[]
  totalValueUsd: number
  totalCostBasis: number
  totalUnrealizedPnl: number
  totalRealizedIncome: number
  totalAccruedYield: number
  totalRedemptionForecast: number
  allocationMix: Record<string, number>
  lastSyncAt: string
}

export interface TransactionReceiptRecord {
  id: string
  txHash: string
  txStatus: TransactionStatus
  blockNumber?: number
  chainId?: number
  executedAt: string
  walletAddress?: string
  safeAddress?: string
  relatedExecutionStepId?: string
  explorerUrl?: string
  receiptPayload?: Record<string, unknown>
  failureReason?: string
  retryHint?: string
}

export interface ReportAnchorRecord {
  id: string
  reportHash: string
  evidenceHash: string
  executionPlanHash: string
  attestationHash: string
  status: string
  chainId?: number
  contractAddress?: string
  transactionHash?: string
  blockNumber?: number
  explorerUrl?: string
  anchoredAt?: string
  note?: string
}

export interface PositionSnapshot {
  id: string
  assetId: string
  assetName: string
  chainId: number
  contractAddress?: string
  walletAddress?: string
  safeAddress?: string
  currentBalance: number
  latestNavOrPrice: number
  currentValue: number
  costBasis: number
  unrealizedPnl: number
  realizedIncome: number
  accruedYield: number
  redemptionForecast: number
  allocationWeightPct: number
  liquidityRisk?: string
  nextRedemptionWindow?: string
  oracleStalenessFlag: boolean
  kycChangeFlag: boolean
  asOf: string
}

export interface ProofSourceRef {
  refId: string
  title: string
  sourceName: string
  sourceUrl: string
  sourceKind?: string
  sourceTier?: string
  freshnessDate?: string
  summary?: string
  status?: string
  unavailableReason?: string
  isPrimary?: boolean
  confidence?: number
}

export interface ProofFreshnessState {
  bucket: string
  label: string
  checkedAt: string
  staleAfterHours: number
  ageHours?: number
  reason?: string
}

export interface RedemptionWindow {
  label: string
  windowType: string
  settlementDays: number
  detail?: string
  nextWindow?: string
  status: string
}

export interface ProofStatusCard {
  key: string
  label: string
  status: string
  detail: string
}

export interface OnchainAnchorStatus {
  status: string
  proofKey?: string
  registryAddress?: string
  transactionHash?: string
  blockNumber?: number
  explorerUrl?: string
  recordedAt?: string
  attester?: string
  note?: string
}

export interface AssetProofHistoryItem {
  snapshotId: string
  assetId: string
  network: WalletNetworkKey | string
  snapshotHash: string
  snapshotUri: string
  proofType: string
  effectiveAt: string
  publishedAt?: string
  timelineVersion: number
  attester: string
  publishStatus: ProofPublishStatus
  onchainAnchorStatus: OnchainAnchorStatus
  oracleFreshness?: string
  kycPolicySummary?: string
  sourceConfidence?: number
  unavailableReasons: string[]
  onchainIndexed?: boolean
  indexedAt?: string
}

export interface AssetProofSnapshot {
  snapshotId?: string
  assetId: string
  assetName: string
  assetSymbol: string
  network: WalletNetworkKey | string
  liveAsset: boolean
  includedInRegistry: boolean
  snapshotHash: string
  snapshotUri: string
  proofType: string
  effectiveAt: string
  publishedAt?: string
  attester: string
  registryAddress?: string
  registryExplorerUrl?: string
  anchorStatus: OnchainAnchorStatus
  indexedAnchorStatus?: OnchainAnchorStatus
  indexedAt?: string
  historySource?: string
  timelineVersion: number
  publishStatus: ProofPublishStatus
  onchainProofKey?: string
  executionAdapterKind: ExecutionAdapterKind
  executionReadiness: ExecutionReadiness
  truthLevel: TruthLevel
  liveReadiness: LiveReadiness
  requiredKycLevel?: number
  proofFreshness: ProofFreshnessState
  oracleFreshness?: string
  kycPolicySummary?: string
  sourceConfidence?: number
  redemptionWindow: RedemptionWindow
  statusCards: ProofStatusCard[]
  proofSourceRefs: ProofSourceRef[]
  unavailableReasons: string[]
  monitoringNotes: string[]
  primaryActionUrl?: string
  visibilityRole?: string
  isExecutable: boolean
}

export interface PortfolioAlert {
  id: string
  address?: string
  alertType: string
  severity: string
  title: string
  detail: string
  assetId?: string
  assetName?: string
  sourceUrl?: string
  sourceRef?: string
  dedupeKey?: string
  status?: AlertEventStatus
  acked?: boolean
  acknowledgedAt?: string
  read?: boolean
  readAt?: string
  detectedAt: string
  resolvedAt?: string
}

export interface PortfolioAlertAck {
  alertId: string
  address: string
  acked: boolean
  acknowledgedAt?: string
  read: boolean
  readAt?: string
}

export interface IndexerStatusItem {
  network: WalletNetworkKey | string
  contractName: string
  contractAddress?: string
  lastIndexedBlock: number
  lastSafeHead: number
  chainHead: number
  lag: number
  status: string
  lastError?: string
  updatedAt: string
}

export interface OpsJobRun {
  jobRunId: string
  jobName: string
  network?: WalletNetworkKey | string
  status: string
  startedAt: string
  finishedAt?: string
  itemCount: number
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export interface DebugOperationReceipt {
  operationId: string
  status: string
  startedAt: string
  finishedAt?: string
  errorMessage?: string
  itemCount: number
  metadata?: Record<string, unknown>
}

export interface AttesterRegistryStatus {
  network: WalletNetworkKey | string
  registryAddress?: string
  owner?: string
  pendingOwner?: string
  publisherAddress?: string
  publisherAuthorized: boolean
  publishEnabled: boolean
  attesters: string[]
  latestPublishStatus?: string
  latestPublishTxHash?: string
  latestPublishAt?: string
}

export interface SourceHealthStatus {
  assetId: string
  assetName: string
  network: WalletNetworkKey | string
  visibilityRole?: string
  liveAsset: boolean
  proofFreshnessBucket?: string
  proofFreshnessLabel?: string
  oracleFreshness?: string
  kycPolicySummary?: string
  sourceConfidence?: number
  publishStatus: ProofPublishStatus
  unavailableReasons: string[]
}

export interface ContractAnchorSummary {
  assetId: string
  assetName: string
  network: WalletNetworkKey | string
  visibilityRole?: string
  isLive: boolean
  latestProofKey?: string
  latestSnapshotHash?: string
  latestPublishStatus?: string
  latestTxHash?: string
  latestBlockNumber?: number
  latestIndexedAt?: string
  proofHistoryCount: number
  latestPlanKey?: string
  latestPlanSessionId?: string
  latestPlanTxHash?: string
  latestPlanBlockNumber?: number
  latestPlanIndexedAt?: string
}

export interface RwaOpsSummary {
  pendingPublishCount: number
  failedPublishCount: number
  staleProofCount: number
  maxIndexerLag: number
  failedJobCount: number
  proofQueue: AssetProofSnapshot[]
  attesterStatus: AttesterRegistryStatus[]
  sourceHealth: SourceHealthStatus[]
  jobHealth: OpsJobRun[]
  indexerHealth: IndexerStatusItem[]
  contractAnchors: ContractAnchorSummary[]
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
  protocolName?: string
  permissioningStandard?: string
  requiredKycLevel?: number
  eligibleInvestorTypes?: string[]
  restrictedJurisdictions?: string[]
  minSubscriptionAmount?: number
  redemptionWindow?: string
  settlementAsset?: string
  oracleProvider?: string
  oracleContract?: string
  lastOracleTimestamp?: string
  navOrPrice?: number
  indicativeYield?: number
  reserveSummary?: string
  custodySummary?: string
  bridgeSupport?: string[]
  proofRefs?: string[]
  secondaryMarketAvailable?: boolean
  riskFlags?: string[]
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
  locale?: LanguageCode
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
  eligibilitySummary?: EligibilityDecision[]
  executionPlan?: ExecutionPlan
  transactionReceipts?: TransactionReceiptRecord[]
  reportAnchorRecords?: ReportAnchorRecord[]
  positionSnapshots?: PositionSnapshot[]
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
  walletAddress?: string
  safeAddress?: string
  kycLevel?: number
  kycStatus?: string
  investorType?: string
  jurisdiction?: string
  sourceChain?: string
  sourceAsset?: string
  ticketSize?: number
  liquidityUrgency?: string
  lockupTolerance?: string
  targetYield?: number
  maxDrawdownTolerance?: number
  executionStatus?: ExecutionLifecycleStatus
  lastOnchainSyncAt?: string
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
  eligibilityDecisions?: EligibilityDecision[]
  executionPlan?: ExecutionPlan
  transactionReceipts?: TransactionReceiptRecord[]
  reportAnchorRecords?: ReportAnchorRecord[]
  positionSnapshots?: PositionSnapshot[]
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

export type TradingMode = 'paper' | 'live'
export type AutopilotState = 'paused' | 'armed' | 'running' | 'halted'
export type StrategyTemplate =
  | 'trend_follow'
  | 'pullback_reclaim'
  | 'breakout_confirmation'
export type AiTradeAction = 'buy' | 'hold' | 'sell_to_close' | 'skip'
export type RiskGateStatus = 'approved' | 'blocked' | 'watch_only'
export type ProviderConnectionStatus = 'connected' | 'simulated' | 'unavailable'
export type StockOrderStatus =
  | 'draft'
  | 'ready_not_sent'
  | 'submitted'
  | 'filled'
  | 'canceled'
  | 'rejected'

export interface StocksProviderStatus {
  provider: string
  mode?: TradingMode
  status: ProviderConnectionStatus
  detail: string
  updatedAt: string
}

export interface StocksRiskLimits {
  singlePositionCapPct: number
  grossExposureCapPct: number
  dailyLossStopPct: number
  maxOpenPositions: number
  maxNewEntriesPerSymbolPerDay: number
  allowExtendedHours: boolean
  useMarketableLimitOrders: boolean
  tradingWindowEt: string
}

export interface StocksSettings {
  whitelist: string[]
  notificationsEnabled: boolean
  defaultMode: TradingMode
  riskLimits: StocksRiskLimits
}

export interface StockMarketSnapshot {
  ticker: string
  companyName: string
  asOf: string
  lastPrice: number
  openPrice: number
  highPrice: number
  lowPrice: number
  previousClose: number
  dayChangePct: number
  volume: number
  averageVolume: number
  minuteClose: number
  minuteOpen: number
  minuteHigh: number
  minuteLow: number
  minuteVolume: number
  source: string
  sourceStatus: ProviderConnectionStatus
}

export interface SignalFeatureSet {
  priceAboveShortSma: boolean
  shortSmaAboveLongSma: boolean
  volumeRatio: number
  intradayBreakout: boolean
  pullbackReclaim: boolean
  momentumPct: number
  distanceFromOpenPct: number
  riskBufferPct: number
  signalScore: number
}

export interface TradeCandidate {
  candidateId: string
  ticker: string
  companyName: string
  snapshot: StockMarketSnapshot
  features: SignalFeatureSet
  triggeredStrategies: StrategyTemplate[]
  preferredStrategy?: StrategyTemplate
  score: number
  eligible: boolean
  notes: string[]
}

export interface AiDecision {
  decisionId: string
  ticker: string
  action: AiTradeAction
  selectedStrategy?: StrategyTemplate
  confidence: number
  rankingScore: number
  rationale: string
  modelName: string
  generatedAt: string
}

export interface RiskGateResult {
  gateId: string
  ticker: string
  status: RiskGateStatus
  reasons: string[]
  warnings: string[]
  targetWeightPct: number
  maxNotionalUsd: number
  suggestedQuantity: number
  evaluatedAt: string
}

export interface OrderIntent {
  intentId: string
  cycleId: string
  ticker: string
  mode: TradingMode
  action: AiTradeAction
  quantity: number
  side: string
  orderType: string
  timeInForce: string
  limitPrice: number
  status: StockOrderStatus
  rationale: string
  riskGate: RiskGateResult
  submittedOrderId: string
  createdAt: string
}

export interface StockOrder {
  orderId: string
  clientOrderId: string
  mode: TradingMode
  ticker: string
  side: string
  quantity: number
  filledQuantity: number
  limitPrice: number
  averageFillPrice: number
  status: StockOrderStatus
  sourceIntentId: string
  broker: string
  submittedAt: string
  updatedAt: string
  metadata: Record<string, unknown>
}

export interface StockPositionState {
  ticker: string
  companyName: string
  mode: TradingMode
  direction: 'long'
  quantity: number
  averageEntryPrice: number
  marketPrice: number
  marketValue: number
  unrealizedPnl: number
  realizedPnlToday: number
  entryStrategy?: StrategyTemplate
  stopPrice: number
  takeProfitPrice: number
  openedAt: string
  updatedAt: string
}

export interface StockBrokerAccount {
  mode: TradingMode
  equity: number
  cash: number
  buyingPower: number
  dayPnl: number
  grossExposurePct: number
  openPositions: number
  autopilotState: AutopilotState
  killSwitchActive: boolean
  providerStatus: ProviderConnectionStatus
  providerName: string
  updatedAt: string
}

export interface PromotionGateResult {
  eligibleForLiveArm: boolean
  paperTradingDays: number
  fillSuccessRate: number
  unresolvedOrdersCount: number
  maxDrawdownPct: number
  riskExceptions: number
  blockers: string[]
  evaluatedAt: string
}

export interface DecisionCycleRecord {
  cycleId: string
  mode: TradingMode
  createdAt: string
  summary: string
  marketPhase: string
  snapshots: StockMarketSnapshot[]
  candidates: TradeCandidate[]
  aiDecisions: AiDecision[]
  orderIntents: OrderIntent[]
  ordersSubmitted: string[]
  riskOutcomes: RiskGateResult[]
  accountEquity: number
  status: string
}

export interface StocksBootstrap {
  settings: StocksSettings
  modes: TradingMode[]
  autopilotStates: AutopilotState[]
  strategies: StrategyTemplate[]
  providerStatuses: StocksProviderStatus[]
  promotionGate: PromotionGateResult
}
