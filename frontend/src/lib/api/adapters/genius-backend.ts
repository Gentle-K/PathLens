import type {
  AnalysisMode,
  AnalysisProgress,
  AnalysisReport,
  AnalysisSession,
  AssetAnalysisCard,
  AuditLogEntry,
  AttestationDraft,
  BudgetLineItem,
  BudgetSummary,
  CalculationTask,
  ChartArtifact,
  ChartTask,
  ClarificationQuestion,
  ConfidenceBand,
  HashKeyChainConfig,
  HoldingPeriodSimulation,
  MarketDataSnapshot,
  MethodologyReference,
  ModeDefinition,
  OptionProfile,
  OracleSnapshotBackend,
  OracleFeedConfig,
  PortfolioAllocation,
  ReportTable,
  ReserveBackingSummary,
  RiskBreakdownItem,
  RiskVector,
  ResourceRecord,
  RwaAssetTemplate,
  RwaBootstrap,
  RwaIntakeContext,
  SearchTask,
  SourceProvenanceRef,
  StressScenario,
  TxDraft,
  User,
  UserAnswer,
} from '@/types'
import { createBrowserBoundUser } from '@/lib/auth/browser-account'
import { i18n } from '@/lib/i18n'

export const COOKIE_SESSION_TOKEN = 'backend-cookie-session'

export interface BackendBootstrapResponse {
  app_name: string
  supported_modes: string[]
  session_statuses: string[]
  next_actions: string[]
  notes: string[]
  chain_config: BackendHashKeyChainConfig
  asset_library: BackendAssetTemplate[]
  supported_asset_types: string[]
  holding_period_presets: number[]
  oracle_snapshots?: BackendMarketDataSnapshot[]
}

export interface BackendHashKeyChainConfig {
  ecosystem_name: string
  native_token_symbol: string
  default_execution_network: string
  testnet_chain_id: number
  testnet_rpc_url: string
  testnet_explorer_url: string
  mainnet_chain_id: number
  mainnet_rpc_url: string
  mainnet_explorer_url: string
  plan_registry_address?: string
  kyc_sbt_address?: string
  testnet_plan_registry_address?: string
  mainnet_plan_registry_address?: string
  testnet_kyc_sbt_address?: string
  mainnet_kyc_sbt_address?: string
  docs_urls: string[]
  oracle_feeds?: BackendOracleFeedConfig[]
}

export interface BackendOracleFeedConfig {
  feed_id: string
  pair: string
  source_name: string
  docs_url?: string
  testnet_address?: string
  mainnet_address?: string
  decimals: number
}

export interface BackendRwaIntakeContext {
  investment_amount: number
  base_currency: string
  preferred_asset_ids: string[]
  holding_period_days: number
  risk_tolerance: 'conservative' | 'balanced' | 'aggressive'
  liquidity_need: 'instant' | 't_plus_3' | 'locked'
  minimum_kyc_level: number
  wallet_address?: string
  wallet_network?: 'testnet' | 'mainnet' | ''
  wallet_kyc_level_onchain?: number
  wallet_kyc_verified?: boolean
  wants_onchain_attestation: boolean
  additional_constraints?: string
}

export interface BackendAssetTemplate {
  asset_id: string
  symbol: string
  name: string
  asset_type: string
  description: string
  issuer?: string
  custody?: string
  chain_id: number
  contract_address?: string
  settlement_asset: string
  execution_style: string
  benchmark_apy: number
  expected_return_low: number
  expected_return_base: number
  expected_return_high: number
  price_volatility: number
  max_drawdown_180d: number
  avg_daily_volume_usd: number
  redemption_days: number
  lockup_days: number
  management_fee_bps: number
  entry_fee_bps: number
  exit_fee_bps: number
  slippage_bps: number
  depeg_events_90d?: number
  worst_depeg_bps_90d?: number
  issuer_disclosure_score: number
  custody_disclosure_score: number
  audit_disclosure_score: number
  contract_is_upgradeable: boolean
  has_admin_key: boolean
  oracle_count: number
  oracle_sources: string[]
  requires_kyc_level?: number
  minimum_ticket_usd: number
  tags: string[]
  thesis: string
  fit_summary: string
  evidence_urls: string[]
  primary_source_url?: string
  onchain_verified: boolean
  issuer_disclosed: boolean
  featured: boolean
}

export interface BackendClarificationQuestion {
  question_id: string
  question_text: string
  purpose: string
  options: string[]
  allow_custom_input: boolean
  allow_skip: boolean
  priority: number
  answered: boolean
  question_group?: string
  input_hint?: string
  example_answer?: string
}

export interface BackendUserAnswer {
  question_id: string
  value: string
  source?: string
  answered_at?: string
}

export interface BackendSearchTask {
  task_id: string
  search_topic: string
  search_goal: string
  search_scope: string
  suggested_queries: string[]
  required_fields: string[]
  freshness_requirement: string
  status: string
  task_group?: string
  notes?: string
}

export interface BackendCalculationTask {
  task_id: string
  objective: string
  formula_hint: string
  input_params: Record<string, unknown>
  unit?: string
  result_value?: number | null
  result_text?: string
  result_payload?: Record<string, unknown>
  error_margin?: string
  notes?: string
  status: string
  validation_state?: 'pending' | 'validated' | 'rejected' | string
  failure_reason?: string
  user_visible?: boolean
  semantic_signature?: string
}

export interface BackendChartTask {
  task_id: string
  objective: string
  chart_type: string
  title: string
  preferred_unit?: string
  source_task_ids?: string[]
  notes?: string
  status: string
}

export interface BackendEvidenceItem {
  evidence_id: string
  title: string
  source_url: string
  source_name: string
  source_type?: 'web' | 'internal' | 'user'
  source_tag?: string
  fetched_at: string
  summary: string
  extracted_facts: string[]
  confidence: number
}

export interface BackendKycOnchainResult {
  wallet_address: string
  network: 'testnet' | 'mainnet' | string
  contract_address?: string
  status: 'none' | 'approved' | 'revoked' | 'unavailable'
  is_human: boolean
  level: number
  source_url?: string
  explorer_url?: string
  fetched_at: string
  note?: string
}

export interface BackendKycCheckResponse {
  result: BackendKycOnchainResult
}

export interface BackendOracleSnapshotResponse {
  snapshots: BackendMarketDataSnapshot[]
  network: 'testnet' | 'mainnet' | string
  note?: string
}

export interface BackendMarketDataSnapshot {
  feed_id: string
  pair: string
  network: 'testnet' | 'mainnet'
  source_name: string
  source_url: string
  feed_address: string
  explorer_url?: string
  price?: number | null
  decimals: number
  fetched_at: string
  updated_at?: string | null
  round_id?: number | null
  note?: string
  status: 'live' | 'unavailable'
}

export interface BackendChartArtifact {
  chart_id: string
  chart_type: string
  title: string
  spec: {
    categories?: string[]
    labels?: string[]
    values?: number[]
    radar_indicators?: string[]
    series?: Array<{
      name?: string
      data?: number[]
    }>
    unit?: string
    [key: string]: unknown
  }
  notes: string
}

export interface BackendMajorConclusionItem {
  conclusion_id: string
  content: string
  conclusion_type: 'fact' | 'estimate' | 'inference' | string
  basis_refs: string[]
  confidence: number
}

export interface BackendBudgetSummary {
  currency: string
  total_cost_low: number
  total_cost_base: number
  total_cost_high: number
  total_income_low: number
  total_income_base: number
  total_income_high: number
  net_low: number
  net_base: number
  net_high: number
  reserve_note?: string
}

export interface BackendBudgetLineItem {
  line_item_id: string
  name: string
  category: string
  item_type: string
  low: number
  base: number
  high: number
  currency: string
  rationale?: string
  basis_refs?: string[]
  confidence?: number
}

export interface BackendOptionProfile {
  option_id: string
  name: string
  summary?: string
  pros?: string[]
  cons?: string[]
  conditions?: string[]
  fit_for?: string[]
  caution_flags?: string[]
  estimated_cost_low?: number | null
  estimated_cost_base?: number | null
  estimated_cost_high?: number | null
  currency?: string
  score?: number | null
  confidence?: number
  basis_refs?: string[]
}

export interface BackendReportTable {
  table_id: string
  title: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  notes?: string
}

export interface BackendRiskVector {
  asset_id: string
  asset_name: string
  market: number
  liquidity: number
  peg_redemption: number
  issuer_custody: number
  smart_contract: number
  oracle_dependency: number
  compliance_access: number
  overall: number
}

export interface BackendRiskBreakdownItem {
  dimension: string
  raw_value?: number | null
  normalized_score: number
  weight: number
  evidence_refs?: string[]
  data_status?: string
  note?: string
}

export interface BackendSimulationPathPoint {
  day: number
  p10_value: number
  p50_value: number
  p90_value: number
}

export interface BackendHoldingPeriodSimulation {
  asset_id: string
  asset_name: string
  holding_period_days: number
  ending_value_low: number
  ending_value_base: number
  ending_value_high: number
  return_pct_low: number
  return_pct_base: number
  return_pct_high: number
  var_95_pct: number
  cvar_95_pct: number
  max_drawdown_low_pct: number
  max_drawdown_base_pct: number
  max_drawdown_high_pct: number
  scenario_note: string
  path: BackendSimulationPathPoint[]
}

export interface BackendPortfolioAllocation {
  asset_id: string
  asset_name: string
  target_weight_pct: number
  suggested_amount: number
  rationale: string
  blocked_reason?: string
}

export interface BackendTxDraftStep {
  step: number
  title: string
  description: string
  action_type: string
  target_contract?: string
  explorer_url?: string
  estimated_fee_usd: number
  caution?: string
}

export interface BackendTxDraft {
  title: string
  chain_id: number
  chain_name: string
  funding_asset: string
  total_estimated_fee_usd: number
  steps: BackendTxDraftStep[]
  risk_warnings: string[]
  can_execute_onchain: boolean
}

export interface BackendAttestationDraft {
  chain_id: number
  report_hash: string
  portfolio_hash: string
  attestation_hash: string
  created_at: string
  network: 'testnet' | 'mainnet' | string
  contract_address?: string
  explorer_url?: string
  event_name: string
  ready: boolean
  transaction_hash?: string
  transaction_url?: string
  submitted_by?: string
  submitted_at?: string | null
  block_number?: number | null
}

export interface BackendAssetAnalysisCard {
  asset_id: string
  symbol: string
  name: string
  asset_type: string
  issuer?: string
  custody?: string
  chain_id: number
  contract_address?: string
  expected_return_low: number
  expected_return_base: number
  expected_return_high: number
  exit_days: number
  total_cost_bps: number
  kyc_required_level?: number
  thesis: string
  fit_summary: string
  tags: string[]
  primary_source_url?: string
  onchain_verified: boolean
  issuer_disclosed: boolean
  risk_vector: BackendRiskVector
  risk_breakdown?: BackendRiskBreakdownItem[]
  risk_data_quality?: number
  metadata: Record<string, unknown>
  evidence_refs: string[]
}

export interface BackendMethodologyReference {
  key: string
  title: string
  url: string
  summary?: string
}

export interface BackendSourceProvenanceRef {
  ref_id: string
  title: string
  source_name: string
  source_url: string
  source_kind: string
  source_tier: string
  freshness_date?: string
  verified_summary?: string
}

export interface BackendConfidenceBand {
  label: string
  low: number
  base: number
  high: number
  unit: string
  confidence_level: number
  note?: string
}

export interface BackendStressScenario {
  scenario_key: string
  title: string
  severity: string
  narrative: string
  portfolio_impact_pct: number
  liquidity_impact_days: number
  affected_asset_ids?: string[]
  source_provenance_refs?: string[]
}

export interface BackendReserveBackingSummary {
  title: string
  summary: string
  reserve_quality_score: number
  attestation_status: string
  liquidity_notice?: string
  asset_symbols?: string[]
  source_provenance_refs?: string[]
}

export interface BackendReport {
  summary: string
  assumptions: string[]
  recommendations: string[]
  open_questions: string[]
  chart_refs: string[]
  markdown?: string
  confidence_band?: BackendConfidenceBand | null
  stress_scenarios?: BackendStressScenario[]
  reserve_backing_summary?: BackendReserveBackingSummary | null
  source_provenance_refs?: BackendSourceProvenanceRef[]
  oracle_stress_score?: number | null
  budget_summary?: BackendBudgetSummary | null
  budget_items?: BackendBudgetLineItem[]
  option_profiles?: BackendOptionProfile[]
  tables?: BackendReportTable[]
  chain_config?: BackendHashKeyChainConfig | null
  kyc_snapshot?: BackendKycOnchainResult | null
  market_snapshots?: BackendMarketDataSnapshot[]
  asset_cards?: BackendAssetAnalysisCard[]
  simulations?: BackendHoldingPeriodSimulation[]
  recommended_allocations?: BackendPortfolioAllocation[]
  methodology_references?: BackendMethodologyReference[]
  tx_draft?: BackendTxDraft | null
  attestation_draft?: BackendAttestationDraft | null
}

export interface BackendSessionEvent {
  timestamp: string
  kind: string
  payload: Record<string, unknown>
}

export interface BackendSession {
  session_id: string
  owner_client_id: string
  mode: 'single_decision' | 'multi_option'
  locale?: 'zh' | 'en'
  problem_statement: string
  intake_context: BackendRwaIntakeContext
  status:
    | 'INIT'
    | 'CLARIFYING'
    | 'ANALYZING'
    | 'READY_FOR_REPORT'
    | 'REPORTING'
    | 'COMPLETED'
    | 'FAILED'
  clarification_questions: BackendClarificationQuestion[]
  answers: BackendUserAnswer[]
  search_tasks: BackendSearchTask[]
  calculation_tasks: BackendCalculationTask[]
  chart_tasks: BackendChartTask[]
  evidence_items: BackendEvidenceItem[]
  chart_artifacts: BackendChartArtifact[]
  major_conclusions: BackendMajorConclusionItem[]
  report: BackendReport | null
  analysis_rounds_completed: number
  follow_up_round_limit: number
  follow_up_rounds_used: number
  follow_up_extensions_used: number
  follow_up_budget_exhausted: boolean
  deferred_follow_up_question_count: number
  activity_status: string
  current_focus: string
  last_stop_reason: string
  error_message?: string | null
  events: BackendSessionEvent[]
  created_at: string
  updated_at: string
}

export interface BackendSessionStepResponse {
  session_id: string
  status: BackendSession['status']
  next_action: 'ask_user' | 'run_mcp' | 'preview_report' | 'complete'
  prompt_to_user: string
  analysis_rounds_completed?: number
  activity_status?: string
  current_focus?: string
  last_stop_reason?: string
  error_message?: string | null
  pending_questions: BackendClarificationQuestion[]
  pending_search_tasks: BackendSearchTask[]
  pending_calculation_tasks?: BackendCalculationTask[]
  pending_chart_tasks?: BackendChartTask[]
  evidence_items: BackendEvidenceItem[]
  chart_artifacts?: BackendChartArtifact[]
  major_conclusions: BackendMajorConclusionItem[]
  report_preview: BackendReport | null
}

export interface BackendRequestMoreFollowUpResponse {
  session: BackendSession
  step: BackendSessionStepResponse
}

export interface BackendPersonalDataDeletionResponse {
  deleted_session_count: number
}

export interface BackendAuditLogEntry {
  log_id: string
  action: string
  actor: string
  target: string
  ip_address: string
  created_at: string
  status: 'success' | 'warning' | 'error'
  summary: string
  metadata: Record<string, string>
}

export interface BackendAuditLogListResponse {
  logs: BackendAuditLogEntry[]
}

export interface BackendDebugAuthStatusResponse {
  username: string
  role: string
}

export interface BackendDebugSessionSummary {
  session_id: string
  owner_client_id: string
  mode: BackendSession['mode']
  problem_statement: string
  status: BackendSession['status']
  event_count: number
  answer_count: number
  evidence_count: number
  search_task_count: number
  created_at: string
  updated_at: string
}

export interface BackendDebugSessionListResponse {
  sessions: BackendDebugSessionSummary[]
}

export interface DebugSessionSummary {
  id: string
  ownerClientId: string
  mode: BackendSession['mode']
  problemStatement: string
  status: BackendSession['status']
  eventCount: number
  answerCount: number
  evidenceCount: number
  searchTaskCount: number
  createdAt: string
  updatedAt: string
}

export interface DebugSessionDetail {
  summary: DebugSessionSummary
  session: BackendSession
}

function isChineseLocale() {
  return i18n.language.startsWith('zh')
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item).trim()).filter(Boolean)
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function buildFallbackLabels(values: number[]) {
  return values.map((_, index) => `#${index + 1}`)
}

function mapOracleFeed(feed: BackendOracleFeedConfig): OracleFeedConfig {
  return {
    id: feed.feed_id,
    pair: feed.pair,
    sourceName: feed.source_name,
    docsUrl: feed.docs_url || undefined,
    testnetAddress: feed.testnet_address || undefined,
    mainnetAddress: feed.mainnet_address || undefined,
    decimals: feed.decimals,
  }
}

function mapChainConfig(config: BackendHashKeyChainConfig): HashKeyChainConfig {
  return {
    ecosystemName: config.ecosystem_name,
    nativeTokenSymbol: config.native_token_symbol,
    defaultExecutionNetwork: config.default_execution_network,
    testnetChainId: config.testnet_chain_id,
    testnetRpcUrl: config.testnet_rpc_url,
    testnetExplorerUrl: config.testnet_explorer_url,
    mainnetChainId: config.mainnet_chain_id,
    mainnetRpcUrl: config.mainnet_rpc_url,
    mainnetExplorerUrl: config.mainnet_explorer_url,
    planRegistryAddress: config.plan_registry_address || undefined,
    kycSbtAddress: config.kyc_sbt_address || undefined,
    testnetPlanRegistryAddress: config.testnet_plan_registry_address || undefined,
    mainnetPlanRegistryAddress: config.mainnet_plan_registry_address || undefined,
    testnetKycSbtAddress: config.testnet_kyc_sbt_address || undefined,
    mainnetKycSbtAddress: config.mainnet_kyc_sbt_address || undefined,
    docsUrls: config.docs_urls ?? [],
    oracleFeeds: (config.oracle_feeds ?? []).map(mapOracleFeed),
  }
}

export function mapAssetType(value: string): RwaAssetTemplate['assetType'] {
  switch (value) {
    case 'stablecoin':
    case 'mmf':
    case 'precious_metal':
    case 'real_estate':
    case 'stocks':
    case 'benchmark':
      return value
    default:
      return 'benchmark'
  }
}

export function mapRwaIntakeContext(
  context?: BackendRwaIntakeContext,
): RwaIntakeContext {
  return {
    investmentAmount: context?.investment_amount ?? 10000,
    baseCurrency: context?.base_currency ?? 'USDT',
    preferredAssetIds: context?.preferred_asset_ids ?? [],
    holdingPeriodDays: context?.holding_period_days ?? 30,
    riskTolerance: context?.risk_tolerance ?? 'balanced',
    liquidityNeed: context?.liquidity_need ?? 't_plus_3',
    minimumKycLevel: context?.minimum_kyc_level ?? 0,
    walletAddress: context?.wallet_address ?? '',
    walletNetwork: context?.wallet_network ?? '',
    walletKycLevelOnchain: context?.wallet_kyc_level_onchain,
    walletKycVerified: context?.wallet_kyc_verified,
    wantsOnchainAttestation: context?.wants_onchain_attestation ?? true,
    additionalConstraints: context?.additional_constraints ?? '',
  }
}

export function toBackendIntakeContext(
  context: RwaIntakeContext,
): BackendRwaIntakeContext {
  return {
    investment_amount: context.investmentAmount,
    base_currency: context.baseCurrency,
    preferred_asset_ids: context.preferredAssetIds,
    holding_period_days: context.holdingPeriodDays,
    risk_tolerance: context.riskTolerance,
    liquidity_need: context.liquidityNeed,
    minimum_kyc_level: context.minimumKycLevel,
    wallet_address: context.walletAddress || '',
    wallet_network: context.walletNetwork || '',
    wallet_kyc_level_onchain: context.walletKycLevelOnchain,
    wallet_kyc_verified: context.walletKycVerified,
    wants_onchain_attestation: context.wantsOnchainAttestation,
    additional_constraints: context.additionalConstraints || '',
  }
}

function mapAssetTemplate(asset: BackendAssetTemplate): RwaAssetTemplate {
  return {
    id: asset.asset_id,
    symbol: asset.symbol,
    name: asset.name,
    assetType: mapAssetType(asset.asset_type),
    description: asset.description,
    issuer: asset.issuer ?? '',
    custody: asset.custody ?? '',
    chainId: asset.chain_id,
    contractAddress: asset.contract_address ?? '',
    settlementAsset: asset.settlement_asset,
    executionStyle: asset.execution_style,
    benchmarkApy: asset.benchmark_apy,
    expectedReturnLow: asset.expected_return_low,
    expectedReturnBase: asset.expected_return_base,
    expectedReturnHigh: asset.expected_return_high,
    priceVolatility: asset.price_volatility,
    maxDrawdown180d: asset.max_drawdown_180d,
    avgDailyVolumeUsd: asset.avg_daily_volume_usd,
    redemptionDays: asset.redemption_days,
    lockupDays: asset.lockup_days,
    managementFeeBps: asset.management_fee_bps,
    entryFeeBps: asset.entry_fee_bps,
    exitFeeBps: asset.exit_fee_bps,
    slippageBps: asset.slippage_bps,
    depegEvents90d: asset.depeg_events_90d,
    worstDepegBps90d: asset.worst_depeg_bps_90d,
    issuerDisclosureScore: asset.issuer_disclosure_score,
    custodyDisclosureScore: asset.custody_disclosure_score,
    auditDisclosureScore: asset.audit_disclosure_score,
    contractIsUpgradeable: asset.contract_is_upgradeable,
    hasAdminKey: asset.has_admin_key,
    oracleCount: asset.oracle_count,
    oracleSources: asset.oracle_sources ?? [],
    requiresKycLevel: asset.requires_kyc_level,
    minimumTicketUsd: asset.minimum_ticket_usd,
    tags: asset.tags ?? [],
    thesis: asset.thesis ?? '',
    fitSummary: asset.fit_summary ?? '',
    evidenceUrls: asset.evidence_urls ?? [],
    primarySourceUrl: asset.primary_source_url ?? '',
    onchainVerified: Boolean(asset.onchain_verified),
    issuerDisclosed: Boolean(asset.issuer_disclosed),
    featured: Boolean(asset.featured),
  }
}

function mapRiskVector(vector: BackendRiskVector): RiskVector {
  return {
    assetId: vector.asset_id,
    assetName: vector.asset_name,
    market: vector.market,
    liquidity: vector.liquidity,
    pegRedemption: vector.peg_redemption,
    issuerCustody: vector.issuer_custody,
    smartContract: vector.smart_contract,
    oracleDependency: vector.oracle_dependency,
    complianceAccess: vector.compliance_access,
    overall: vector.overall,
  }
}

function mapSimulation(
  simulation: BackendHoldingPeriodSimulation,
): HoldingPeriodSimulation {
  return {
    assetId: simulation.asset_id,
    assetName: simulation.asset_name,
    holdingPeriodDays: simulation.holding_period_days,
    endingValueLow: simulation.ending_value_low,
    endingValueBase: simulation.ending_value_base,
    endingValueHigh: simulation.ending_value_high,
    returnPctLow: simulation.return_pct_low,
    returnPctBase: simulation.return_pct_base,
    returnPctHigh: simulation.return_pct_high,
    var95Pct: simulation.var_95_pct,
    cvar95Pct: simulation.cvar_95_pct,
    maxDrawdownLowPct: simulation.max_drawdown_low_pct,
    maxDrawdownBasePct: simulation.max_drawdown_base_pct,
    maxDrawdownHighPct: simulation.max_drawdown_high_pct,
    scenarioNote: simulation.scenario_note,
    path: (simulation.path ?? []).map((point) => ({
      day: point.day,
      p10Value: point.p10_value,
      p50Value: point.p50_value,
      p90Value: point.p90_value,
    })),
  }
}

function mapAllocation(
  allocation: BackendPortfolioAllocation,
): PortfolioAllocation {
  return {
    assetId: allocation.asset_id,
    assetName: allocation.asset_name,
    targetWeightPct: allocation.target_weight_pct,
    suggestedAmount: allocation.suggested_amount,
    rationale: allocation.rationale,
    blockedReason: allocation.blocked_reason ?? '',
  }
}

function mapTxDraft(draft?: BackendTxDraft | null): TxDraft | undefined {
  if (!draft) {
    return undefined
  }

  return {
    title: draft.title,
    chainId: draft.chain_id,
    chainName: draft.chain_name,
    fundingAsset: draft.funding_asset,
    totalEstimatedFeeUsd: draft.total_estimated_fee_usd,
    steps: (draft.steps ?? []).map((step) => ({
      step: step.step,
      title: step.title,
      description: step.description,
      actionType: step.action_type,
      targetContract: step.target_contract ?? '',
      explorerUrl: step.explorer_url ?? '',
      estimatedFeeUsd: step.estimated_fee_usd,
      caution: step.caution ?? '',
    })),
    riskWarnings: draft.risk_warnings ?? [],
    canExecuteOnchain: Boolean(draft.can_execute_onchain),
  }
}

function mapAttestationDraft(
  draft?: BackendAttestationDraft | null,
): AttestationDraft | undefined {
  if (!draft) {
    return undefined
  }

  return {
    chainId: draft.chain_id,
    reportHash: draft.report_hash,
    portfolioHash: draft.portfolio_hash,
    attestationHash: draft.attestation_hash,
    createdAt: draft.created_at,
    network: draft.network,
    contractAddress: draft.contract_address ?? '',
    explorerUrl: draft.explorer_url ?? '',
    eventName: draft.event_name,
    ready: Boolean(draft.ready),
    transactionHash: draft.transaction_hash ?? '',
    transactionUrl: draft.transaction_url ?? '',
    submittedBy: draft.submitted_by ?? '',
    submittedAt: draft.submitted_at ?? undefined,
    blockNumber: draft.block_number ?? undefined,
  }
}

function mapRiskBreakdownItem(
  item: BackendRiskBreakdownItem,
): RiskBreakdownItem {
  return {
    dimension: item.dimension,
    rawValue: typeof item.raw_value === 'number' ? item.raw_value : undefined,
    normalizedScore: item.normalized_score,
    weight: item.weight,
    evidenceRefs: item.evidence_refs ?? [],
    dataStatus: item.data_status ?? '',
    note: item.note ?? '',
  }
}

function mapMethodologyReference(
  item: BackendMethodologyReference,
): MethodologyReference {
  return {
    key: item.key,
    title: item.title,
    url: item.url,
    summary: item.summary ?? '',
  }
}

function mapSourceProvenanceRef(
  item: BackendSourceProvenanceRef,
): SourceProvenanceRef {
  return {
    refId: item.ref_id,
    title: item.title,
    sourceName: item.source_name,
    sourceUrl: item.source_url,
    sourceKind: item.source_kind,
    sourceTier: item.source_tier,
    freshnessDate: item.freshness_date ?? undefined,
    verifiedSummary: item.verified_summary ?? '',
  }
}

function mapConfidenceBand(
  item?: BackendConfidenceBand | null,
): ConfidenceBand | undefined {
  if (!item) {
    return undefined
  }
  return {
    label: item.label,
    low: item.low,
    base: item.base,
    high: item.high,
    unit: item.unit,
    confidenceLevel: item.confidence_level,
    note: item.note ?? '',
  }
}

function mapStressScenario(
  item: BackendStressScenario,
): StressScenario {
  return {
    scenarioKey: item.scenario_key,
    title: item.title,
    severity: item.severity,
    narrative: item.narrative,
    portfolioImpactPct: item.portfolio_impact_pct,
    liquidityImpactDays: item.liquidity_impact_days,
    affectedAssetIds: item.affected_asset_ids ?? [],
    sourceProvenanceRefs: item.source_provenance_refs ?? [],
  }
}

function mapReserveBackingSummary(
  item?: BackendReserveBackingSummary | null,
): ReserveBackingSummary | undefined {
  if (!item) {
    return undefined
  }
  return {
    title: item.title,
    summary: item.summary,
    reserveQualityScore: item.reserve_quality_score,
    attestationStatus: item.attestation_status,
    liquidityNotice: item.liquidity_notice ?? '',
    assetSymbols: item.asset_symbols ?? [],
    sourceProvenanceRefs: item.source_provenance_refs ?? [],
  }
}

function mapAssetAnalysisCard(
  card: BackendAssetAnalysisCard,
): AssetAnalysisCard {
  return {
    assetId: card.asset_id,
    symbol: card.symbol,
    name: card.name,
    assetType: mapAssetType(card.asset_type),
    issuer: card.issuer ?? '',
    custody: card.custody ?? '',
    chainId: card.chain_id,
    contractAddress: card.contract_address ?? '',
    expectedReturnLow: card.expected_return_low,
    expectedReturnBase: card.expected_return_base,
    expectedReturnHigh: card.expected_return_high,
    exitDays: card.exit_days,
    totalCostBps: card.total_cost_bps,
    kycRequiredLevel: card.kyc_required_level,
    thesis: card.thesis ?? '',
    fitSummary: card.fit_summary ?? '',
    tags: card.tags ?? [],
    primarySourceUrl: card.primary_source_url ?? '',
    onchainVerified: Boolean(card.onchain_verified),
    issuerDisclosed: Boolean(card.issuer_disclosed),
    riskVector: mapRiskVector(card.risk_vector),
    riskBreakdown: (card.risk_breakdown ?? []).map(mapRiskBreakdownItem),
    riskDataQuality:
      typeof card.risk_data_quality === 'number' ? card.risk_data_quality : 1,
    metadata: card.metadata ?? {},
    evidenceRefs: card.evidence_refs ?? [],
  }
}

function mapMarketSnapshot(
  snapshot: BackendMarketDataSnapshot,
): MarketDataSnapshot {
  return {
    feedId: snapshot.feed_id,
    pair: snapshot.pair,
    network: snapshot.network,
    sourceName: snapshot.source_name,
    sourceUrl: snapshot.source_url,
    feedAddress: snapshot.feed_address,
    explorerUrl: snapshot.explorer_url ?? '',
    price:
      typeof snapshot.price === 'number' ? snapshot.price : undefined,
    decimals: snapshot.decimals,
    fetchedAt: snapshot.fetched_at,
    updatedAt: snapshot.updated_at ?? undefined,
    roundId:
      typeof snapshot.round_id === 'number' ? snapshot.round_id : undefined,
    note: snapshot.note ?? '',
    status: snapshot.status,
  }
}

export function mapKycSnapshot(
  result: BackendKycOnchainResult,
) {
  return {
    walletAddress: result.wallet_address,
    network:
      result.network === 'mainnet' ? 'mainnet' : 'testnet',
    contractAddress: result.contract_address ?? '',
    status: result.status,
    isHuman: result.is_human,
    level: result.level,
    sourceUrl: result.source_url ?? '',
    explorerUrl: result.explorer_url ?? '',
    fetchedAt: result.fetched_at,
    note: result.note ?? '',
  } as const
}

export function mapRwaBootstrap(
  bootstrap: BackendBootstrapResponse,
): RwaBootstrap {
  return {
    appName: bootstrap.app_name,
    chainConfig: mapChainConfig(bootstrap.chain_config),
    assetLibrary: bootstrap.asset_library.map(mapAssetTemplate),
    supportedAssetTypes: bootstrap.supported_asset_types ?? [],
    holdingPeriodPresets: bootstrap.holding_period_presets ?? [],
    notes: bootstrap.notes ?? [],
    oracleSnapshots: (bootstrap.oracle_snapshots ?? []).map((snapshot) =>
      mapMarketSnapshot(snapshot) as OracleSnapshotBackend,
    ),
  }
}

function normalizeActivityLabel(activityStatus?: string) {
  const isZh = isChineseLocale()
  const mapping: Record<string, string> = {
    idle: isZh ? '等待启动' : 'Idle',
    waiting_for_user_clarification_answers: isZh
      ? '等待用户回答问题'
      : 'Waiting for answers',
    searching_web_for_evidence: isZh ? '搜索网页中' : 'Searching the web',
    running_deterministic_calculations: isZh
      ? '执行 RWA 收益、风险与净值计算'
      : 'Running RWA calculations',
    preparing_visualizations: isZh ? '生成图表中' : 'Preparing charts',
    searching_and_synthesizing: isZh ? '搜索并综合证据中' : 'Searching and synthesizing',
    running_analysis_pipeline: isZh ? '分析思考中' : 'Running analysis',
    analyzing: isZh ? '分析思考中' : 'Analyzing',
    completed: isZh ? '分析完成' : 'Completed',
    failed: isZh ? '分析失败' : 'Failed',
  }

  if (!activityStatus) {
    return isZh ? '等待系统推进' : 'Waiting for orchestration'
  }

  return mapping[activityStatus] ?? activityStatus.replaceAll('_', ' ')
}

function resolveFieldType(
  question: BackendClarificationQuestion,
): ClarificationQuestion['fieldType'] {
  if (question.options.length) {
    return 'single-choice'
  }

  return 'textarea'
}

function mapBackendQuestion(
  question: BackendClarificationQuestion,
): ClarificationQuestion {
  return {
    id: question.question_id,
    sessionId: '',
    question: question.question_text,
    purpose: question.purpose,
    questionGroup: question.question_group ?? '',
    inputHint: question.input_hint ?? '',
    exampleAnswer: question.example_answer ?? '',
    fieldType: resolveFieldType(question),
    options: question.options.map((option) => ({
      value: option,
      label: option,
    })),
    allowCustomInput: question.allow_custom_input,
    allowSkip: question.allow_skip,
    priority: question.priority,
    recommended: [],
    answered: question.answered,
  }
}

function mapBackendSearchTask(task: BackendSearchTask, sessionId: string): SearchTask {
  return {
    id: task.task_id,
    sessionId,
    topic: task.search_topic,
    goal: task.search_goal,
    scope: task.search_scope,
    suggestedQueries: task.suggested_queries,
    requiredFields: task.required_fields,
    freshnessRequirement: task.freshness_requirement === 'high' ? 'high' : 'standard',
    status:
      task.status === 'running' || task.status === 'completed'
        ? task.status
        : 'pending',
    taskGroup: task.task_group ?? '',
    notes: task.notes ?? '',
  }
}

function mapBackendCalculationTask(
  task: BackendCalculationTask,
  sessionId: string,
  fallbackCreatedAt: string,
): CalculationTask {
  const result =
    task.result_text?.trim() ||
    (typeof task.result_value === 'number' && Number.isFinite(task.result_value)
      ? String(task.result_value)
      : task.status === 'completed'
        ? isChineseLocale()
          ? '已完成计算'
          : 'Completed'
        : task.status === 'failed'
          ? isChineseLocale()
            ? '计算失败'
            : 'Failed'
          : isChineseLocale()
            ? '等待计算'
            : 'Pending')

  return {
    id: task.task_id,
    sessionId,
    taskType: task.objective,
    formulaExpression: task.formula_hint,
    inputParams: Object.fromEntries(
      Object.entries(task.input_params ?? {}).map(([key, value]) => {
        if (typeof value === 'number') {
          return [key, value]
        }

        return [key, String(value)]
      }),
    ),
    units: task.unit ?? '',
    result,
    errorMargin: task.error_margin ?? undefined,
    notes: task.notes ?? undefined,
    status: task.status,
    validationState:
      task.validation_state === 'validated' || task.validation_state === 'rejected'
        ? task.validation_state
        : 'pending',
    failureReason: task.failure_reason ?? undefined,
    userVisible: task.user_visible ?? task.status === 'completed',
    createdAt: fallbackCreatedAt,
  }
}

function mapBackendChartTask(task: BackendChartTask, sessionId: string): ChartTask {
  return {
    id: task.task_id,
    sessionId,
    objective: task.objective,
    chartType: mapChartKind(task.chart_type),
    title: task.title,
    preferredUnit: task.preferred_unit,
    sourceTaskIds: task.source_task_ids ?? [],
    notes: task.notes ?? '',
    status:
      task.status === 'running' ||
      task.status === 'completed' ||
      task.status === 'failed'
        ? task.status
        : 'pending',
  }
}

function mapChartKind(chartType: string): ChartArtifact['kind'] {
  switch (chartType) {
    case 'line':
    case 'bar':
    case 'scatter':
    case 'radar':
    case 'heatmap':
    case 'pie':
      return chartType
    default:
      return 'bar'
  }
}

export function mapBackendChart(
  chart: BackendChartArtifact,
  sessionId: string,
): ChartArtifact {
  const isZh = isChineseLocale()
  const kind = mapChartKind(chart.chart_type)
  const fallbackValues = numberList(chart.spec.values)
  const categories = stringList(chart.spec.categories ?? chart.spec.labels)
  const resolvedCategories =
    categories.length || !fallbackValues.length
      ? categories
      : buildFallbackLabels(fallbackValues)
  const backendSeries = Array.isArray(chart.spec.series) ? chart.spec.series : []
  const normalizedSeries = backendSeries
    .map((series, index) => ({
      name:
        typeof series?.name === 'string' && series.name.trim()
          ? series.name.trim()
          : `${isZh ? '序列' : 'Series'} ${index + 1}`,
      data: numberList(series?.data),
    }))
    .filter((series) => series.data.length > 0)

  const compareSeries =
    normalizedSeries.length > 0
      ? normalizedSeries.flatMap((series) =>
          (resolvedCategories.length
            ? resolvedCategories
            : buildFallbackLabels(series.data)
          ).map((label, index) => ({
            label,
            value: Number(series.data[index] ?? 0),
            group: series.name,
            nature: 'actual' as const,
            intensity: 0.7,
          })),
        )
      : (resolvedCategories.length
          ? resolvedCategories
          : buildFallbackLabels(fallbackValues)
        ).map((label, index) => ({
          label,
          value: Number(fallbackValues[index] ?? 0),
          group: isZh ? '当前' : 'Current',
          nature: 'actual' as const,
          intensity: 0.7,
        }))

  const radarIndicators = stringList(
    chart.spec.radar_indicators ?? chart.spec.categories ?? chart.spec.labels,
  )
  const resolvedRadarIndicators =
    radarIndicators.length || !compareSeries.length
      ? radarIndicators
      : compareSeries.map((item) => item.label)

  return {
    id: chart.chart_id,
    sessionId,
    kind,
    title: chart.title,
    unit: typeof chart.spec.unit === 'string' ? chart.spec.unit : undefined,
    note: chart.notes,
    source: isZh ? '后端图表生成' : 'Backend chart generation',
    compareSeries: kind === 'bar' || kind === 'pie' ? compareSeries : undefined,
    lineSeries:
      kind === 'line'
        ? compareSeries
            .filter(
              (item) =>
                item.group ===
                (normalizedSeries[0]?.name ?? (isZh ? '当前' : 'Current')),
            )
            .map(({ label, value, group, nature, intensity }) => ({
              label,
              value,
              group,
              nature,
              intensity,
            }))
        : undefined,
    scatterSeries:
      kind === 'scatter'
        ? compareSeries.map((item, index) => ({
            ...item,
            group: String(index + 1),
          }))
        : undefined,
    radarSeries:
      kind === 'radar'
        ? (normalizedSeries.length
            ? normalizedSeries
            : [{ name: chart.title, data: fallbackValues }]
          ).map((series) => ({
            name: series.name,
            values: resolvedRadarIndicators.map((dimension, index) => ({
              dimension,
              value: Math.max(0, Math.min(10, Number(series.data[index] ?? 0))),
            })),
          }))
        : undefined,
    heatmapSeries:
      kind === 'heatmap'
        ? compareSeries.map((item, index) => ({
            x: item.label,
            y: `${isZh ? '行' : 'Row'} ${index + 1}`,
            value: item.value,
            nature: 'actual',
          }))
        : undefined,
  }
}

function mapBudgetSummary(
  summary?: BackendBudgetSummary | null,
): BudgetSummary | undefined {
  if (!summary) {
    return undefined
  }

  return {
    currency: summary.currency,
    totalCostLow: summary.total_cost_low,
    totalCostBase: summary.total_cost_base,
    totalCostHigh: summary.total_cost_high,
    totalIncomeLow: summary.total_income_low,
    totalIncomeBase: summary.total_income_base,
    totalIncomeHigh: summary.total_income_high,
    netLow: summary.net_low,
    netBase: summary.net_base,
    netHigh: summary.net_high,
    reserveNote: summary.reserve_note ?? '',
  }
}

function mapBudgetItems(items?: BackendBudgetLineItem[]): BudgetLineItem[] {
  return (items ?? []).map((item) => ({
    id: item.line_item_id,
    name: item.name,
    category: item.category,
    itemType: item.item_type,
    low: item.low,
    base: item.base,
    high: item.high,
    currency: item.currency,
    rationale: item.rationale ?? '',
    basisRefs: item.basis_refs ?? [],
    confidence: item.confidence ?? 0.6,
  }))
}

function mapOptionProfiles(items?: BackendOptionProfile[]): OptionProfile[] {
  return (items ?? []).map((item) => ({
    id: item.option_id,
    name: item.name,
    summary: item.summary ?? '',
    pros: item.pros ?? [],
    cons: item.cons ?? [],
    conditions: item.conditions ?? [],
    fitFor: item.fit_for ?? [],
    cautionFlags: item.caution_flags ?? [],
    estimatedCostLow:
      typeof item.estimated_cost_low === 'number' ? item.estimated_cost_low : undefined,
    estimatedCostBase:
      typeof item.estimated_cost_base === 'number' ? item.estimated_cost_base : undefined,
    estimatedCostHigh:
      typeof item.estimated_cost_high === 'number' ? item.estimated_cost_high : undefined,
    currency: item.currency ?? 'CNY',
    score: typeof item.score === 'number' ? item.score : undefined,
    confidence: item.confidence ?? 0.6,
    basisRefs: item.basis_refs ?? [],
  }))
}

function mapReportTables(tables?: BackendReportTable[]): ReportTable[] {
  return (tables ?? []).map((table) => ({
    id: table.table_id,
    title: table.title,
    columns: table.columns,
    rows: table.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          if (typeof value === 'number') {
            return [key, value]
          }

          if (value == null) {
            return [key, null]
          }

          return [key, String(value)]
        }),
      ),
    ),
    notes: table.notes ?? '',
  }))
}

function buildFallbackMarkdown(session: BackendSession): string {
  const isZh = isChineseLocale()
  const report = session.report

  if (!report) {
    return [
      `# ${session.problem_statement}`,
      '',
      isZh ? '报告仍在生成，请先回到分析界面查看当前状态。' : 'The report is still being prepared.',
    ].join('\n')
  }

  return [
    `# ${session.problem_statement}`,
    '',
    report.summary,
    '',
    isZh ? '## 建议' : '## Recommendations',
    ...(report.recommendations.length
      ? report.recommendations.map((item) => `- ${item}`)
      : [isZh ? '- 暂无明确建议。' : '- No recommendation available yet.']),
    '',
    isZh ? '## 假设' : '## Assumptions',
    ...(report.assumptions.length
      ? report.assumptions.map((item) => `- ${item}`)
      : [isZh ? '- 暂无明确假设。' : '- No explicit assumptions returned.']),
    '',
    isZh ? '## 待确认问题' : '## Open Questions',
    ...(report.open_questions.length
      ? report.open_questions.map((item) => `- ${item}`)
      : [isZh ? '- 当前没有额外待确认问题。' : '- No open questions remain.']),
  ].join('\n')
}

function mapLastInsight(session: BackendSession) {
  return (
    session.current_focus ||
    session.major_conclusions.at(-1)?.content ||
    session.report?.summary ||
    normalizeActivityLabel(session.activity_status)
  )
}

export function createBackendPseudoUser(): User {
  return createBrowserBoundUser()
}

export function mapBackendMode(
  mode: BackendSession['mode'] | string,
): AnalysisMode {
  return mode === 'multi_option' ? 'multi-option' : 'single-option'
}

export function mapModeDefinitions(
  bootstrap: BackendBootstrapResponse,
): ModeDefinition[] {
  const isZh = isChineseLocale()

  return bootstrap.supported_modes.map((mode) => {
    const id = mapBackendMode(mode)

    return {
      id,
      title:
        id === 'single-option'
          ? isZh
            ? '单资产尽调'
            : 'Single-asset diligence'
          : isZh
            ? '多资产配置'
            : 'Multi-asset allocation',
      subtitle:
        id === 'single-option'
          ? isZh
            ? '围绕单个 RWA / 稳定币 / 收益资产做风险拆解与可执行草案。'
            : 'Diligence one RWA, stablecoin, or yield product with risk decomposition.'
          : isZh
            ? '输出 RWA 对比矩阵、持有期模拟、推荐权重与证据链。'
            : 'Produce comparison matrix, simulations, recommended weights, and evidence links.',
      description:
        id === 'single-option'
          ? isZh
            ? '适合审查某个稳定币、MMF、贵金属或房地产类 RWA 的收益、流动性、KYC 与执行步骤。'
            : 'Best for diligencing a single stablecoin, MMF, precious-metal, or real-estate style RWA.'
          : isZh
            ? '适合做 HashKey Chain 上的多资产配置，比较收益、风险、流动性和门槛。'
            : 'Best for portfolio-style comparisons across HashKey Chain assets.',
      valueLens:
        id === 'single-option'
          ? isZh
            ? ['RiskVector', '流动性', 'KYC 门槛', '执行草案']
            : ['RiskVector', 'Liquidity', 'KYC gating', 'Execution draft']
          : isZh
            ? ['对比矩阵', '持有期模拟', '推荐权重', '证据面板']
            : ['Comparison matrix', 'Holding simulation', 'Suggested weights', 'Evidence panel'],
      icon: id === 'single-option' ? 'sparkles' : 'git-compare',
    }
  })
}

export function mapBackendSession(session: BackendSession): AnalysisSession {
  return {
    id: session.session_id,
    mode: mapBackendMode(session.mode),
    locale: session.locale,
    problemStatement: session.problem_statement,
    status: session.status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    errorMessage: session.error_message ?? undefined,
    followUpRoundLimit: session.follow_up_round_limit,
    followUpRoundsUsed: session.follow_up_rounds_used,
    followUpExtensionsUsed: session.follow_up_extensions_used,
    followUpBudgetExhausted: session.follow_up_budget_exhausted,
    deferredFollowUpQuestionCount: session.deferred_follow_up_question_count,
    activityStatus: session.activity_status,
    currentFocus: session.current_focus,
    lastStopReason: session.last_stop_reason,
    intakeContext: mapRwaIntakeContext(session.intake_context),
    lastInsight: mapLastInsight(session),
    questions: session.clarification_questions.map((question) => ({
      ...mapBackendQuestion(question),
      sessionId: session.session_id,
    })),
    answers: session.answers.map((answer) => ({
      id: `${answer.question_id}-${answer.answered_at ?? 'backend'}`,
      questionId: answer.question_id,
      answerStatus: 'answered',
      selectedOptions: [answer.value],
      numericValue: Number.isFinite(Number(answer.value))
        ? Number(answer.value)
        : undefined,
    })),
    searchTasks: session.search_tasks.map((task) =>
      mapBackendSearchTask(task, session.session_id),
    ),
    evidence: session.evidence_items.map((item) => ({
      id: item.evidence_id,
      sessionId: session.session_id,
      sourceType: item.source_type ?? 'internal',
      sourceUrl: item.source_url,
      sourceName: item.source_name,
      title: item.title,
      summary: item.summary,
      extractedFacts: item.extracted_facts,
      fetchedAt: item.fetched_at,
      confidence: item.confidence,
      sourceTag:
        item.source_tag === 'onchain_verified' ||
        item.source_tag === 'oracle_fed' ||
        item.source_tag === 'issuer_disclosed' ||
        item.source_tag === 'third_party_source' ||
        item.source_tag === 'model_inference' ||
        item.source_tag === 'user_assumption'
          ? item.source_tag
          : undefined,
    })),
    conclusions: session.major_conclusions.map((item) => ({
      id: item.conclusion_id,
      sessionId: session.session_id,
      conclusion: item.content,
      conclusionType:
        item.conclusion_type === 'fact' ||
        item.conclusion_type === 'estimate' ||
        item.conclusion_type === 'inference'
          ? item.conclusion_type
          : 'inference',
      basisRefs: item.basis_refs,
      confidence: item.confidence,
      createdAt: session.updated_at,
    })),
    calculations: session.calculation_tasks.map((task) =>
      mapBackendCalculationTask(task, session.session_id, session.updated_at),
    ),
    chartTasks: (session.chart_tasks ?? []).map((task) =>
      mapBackendChartTask(task, session.session_id),
    ),
    chartArtifacts: session.chart_artifacts.map((artifact) =>
      mapBackendChart(artifact, session.session_id),
    ),
  }
}

function buildHighlights(session: BackendSession) {
  const isZh = isChineseLocale()
  const report = session.report
  const mode = mapBackendMode(session.mode)
  const budgetSummary = mapBudgetSummary(report?.budget_summary)
  const optionProfiles = mapOptionProfiles(report?.option_profiles)
  const allocations = (report?.recommended_allocations ?? []).map(mapAllocation)
  const assetCards = (report?.asset_cards ?? []).map(mapAssetAnalysisCard)
  const bestAllocation = allocations.find((item) => item.targetWeightPct > 0)

  if (assetCards.length > 0) {
    const lowestRisk = [...assetCards].sort(
      (left, right) => left.riskVector.overall - right.riskVector.overall,
    )[0]
    return [
      {
        id: 'asset-count',
        label: isZh ? '比较资产数' : 'Assets compared',
        value: String(assetCards.length),
        detail: isZh ? '进入同口径比较与模拟的资产模板数量。' : 'Templates included in the normalized comparison.',
      },
      {
        id: 'lead-allocation',
        label: isZh ? '核心配置腿' : 'Lead allocation',
        value: bestAllocation?.assetName ?? (isZh ? '待判断' : 'Pending'),
        detail: isZh ? '在当前约束下建议承担最高权重的资产。' : 'Asset currently carrying the highest suggested weight.',
      },
      {
        id: 'lowest-risk',
        label: isZh ? '最低综合风险' : 'Lowest overall risk',
        value: lowestRisk ? `${lowestRisk.name} / ${lowestRisk.riskVector.overall.toFixed(1)}` : '—',
        detail: isZh ? '便于快速识别流动性底仓和风险缓冲资产。' : 'Useful for identifying the liquidity anchor asset.',
      },
      {
        id: 'evidence-count',
        label: isZh ? '证据条目' : 'Evidence items',
        value: String(session.evidence_items.length),
        detail: isZh ? '报告中的关键判断都应能回到这些证据卡片。' : 'Key report claims should trace back to these evidence cards.',
      },
    ]
  }

  if (mode === 'single-option' && budgetSummary) {
    return [
      {
        id: 'budget-range',
        label: isZh ? '预算范围' : 'Budget range',
        value: `${Math.round(budgetSummary.netLow)} - ${Math.round(budgetSummary.netHigh)} ${budgetSummary.currency}`,
        detail: isZh ? '净预算区间，已计入潜在收入或回收。' : 'Net range including potential offsets.',
      },
      {
        id: 'base-budget',
        label: isZh ? '基准净预算' : 'Base net budget',
        value: `${Math.round(budgetSummary.netBase)} ${budgetSummary.currency}`,
        detail: isZh ? '最适合作为决策时的默认预算线。' : 'The most useful default planning figure.',
      },
      {
        id: 'budget-items',
        label: isZh ? '预算项目数' : 'Budget items',
        value: String(report?.budget_items?.length ?? 0),
        detail: isZh ? '包含直接成本、机会成本、收入和回收项。' : 'Direct cost, opportunity cost, and revenue items.',
      },
      {
        id: 'evidence-count',
        label: isZh ? '证据条目' : 'Evidence items',
        value: String(session.evidence_items.length),
        detail: isZh ? '用于支撑预算与风险判断的外部证据。' : 'Evidence backing the estimate.',
      },
    ]
  }

  if (mode === 'multi-option' && optionProfiles.length > 0) {
    const bestOption = [...optionProfiles]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .at(0)

    return [
      {
        id: 'option-count',
        label: isZh ? '识别方案数' : 'Options identified',
        value: String(optionProfiles.length),
        detail: isZh ? '系统根据问题识别并整理出的候选路径。' : 'Paths identified and compared in parallel.',
      },
      {
        id: 'best-option',
        label: isZh ? '当前优先方案' : 'Current lead option',
        value: bestOption?.name ?? (isZh ? '待判断' : 'Pending'),
        detail: isZh ? '基于当前证据和偏好约束的领先选项。' : 'Lead option under current evidence and constraints.',
      },
      {
        id: 'best-score',
        label: isZh ? '综合评分' : 'Composite score',
        value:
          typeof bestOption?.score === 'number'
            ? `${bestOption.score.toFixed(1)}`
            : isZh
              ? '未评分'
              : 'Unscored',
        detail: isZh ? '仅用于排序辅助，不代表绝对结论。' : 'Useful for ranking, not an absolute truth.',
      },
      {
        id: 'evidence-count',
        label: isZh ? '证据条目' : 'Evidence items',
        value: String(session.evidence_items.length),
        detail: isZh ? '支撑方案比较和成本判断的证据数量。' : 'Evidence supporting the comparison.',
      },
    ]
  }

  return [
    {
      id: 'session-status',
      label: isZh ? '当前状态' : 'Current status',
      value: session.status,
      detail: normalizeActivityLabel(session.activity_status),
    },
    {
      id: 'answer-count',
      label: isZh ? '已回答问题' : 'Answered questions',
      value: String(session.answers.length),
      detail: isZh ? '本轮会话中已记录的用户回答数量。' : 'Answers recorded in the session.',
    },
  ]
}

export function mapBackendReport(session: BackendSession): AnalysisReport {
  const mappedSession = mapBackendSession(session)
  const report = session.report

  return {
    id: `report-${session.session_id}`,
    sessionId: session.session_id,
    mode: mappedSession.mode,
    summaryTitle: session.problem_statement,
    markdown: report?.markdown?.trim() || buildFallbackMarkdown(session),
    highlights: buildHighlights(session),
    calculations: mappedSession.calculations.filter((task) => task.userVisible !== false),
    charts: mappedSession.chartArtifacts ?? [],
    evidence: mappedSession.evidence,
    assumptions: report?.assumptions ?? [],
    disclaimers: [
      isChineseLocale()
        ? '预算、成本和方案评分都依赖当前输入与证据，若关键假设变化，结论也会同步变化。'
        : 'Budget estimates and option scores only hold under the current assumptions and evidence.',
      isChineseLocale()
        ? '表格和图表用于帮助比较与沟通，不应代替你对原始条件、合同和外部政策的复核。'
        : 'Tables and charts aid comparison and communication and should not replace source verification.',
    ],
    budgetSummary: mapBudgetSummary(report?.budget_summary),
    budgetItems: mapBudgetItems(report?.budget_items),
    optionProfiles: mapOptionProfiles(report?.option_profiles),
    tables: mapReportTables(report?.tables),
    confidenceBand: mapConfidenceBand(report?.confidence_band),
    stressScenarios: (report?.stress_scenarios ?? []).map(mapStressScenario),
    reserveBackingSummary: mapReserveBackingSummary(report?.reserve_backing_summary),
    sourceProvenanceRefs: (report?.source_provenance_refs ?? []).map(mapSourceProvenanceRef),
    oracleStressScore:
      typeof report?.oracle_stress_score === 'number'
        ? report.oracle_stress_score
        : undefined,
    chainConfig: report?.chain_config ? mapChainConfig(report.chain_config) : undefined,
    kycSnapshot: report?.kyc_snapshot ? mapKycSnapshot(report.kyc_snapshot) : undefined,
    marketSnapshots: (report?.market_snapshots ?? []).map(mapMarketSnapshot),
    assetCards: (report?.asset_cards ?? []).map(mapAssetAnalysisCard),
    simulations: (report?.simulations ?? []).map(mapSimulation),
    recommendedAllocations: (report?.recommended_allocations ?? []).map(mapAllocation),
    methodologyReferences: (report?.methodology_references ?? []).map(mapMethodologyReference),
    txDraft: mapTxDraft(report?.tx_draft),
    attestationDraft: mapAttestationDraft(report?.attestation_draft),
  }
}

function buildStages(mode: AnalysisMode): AnalysisProgress['stages'] {
  const isZh = isChineseLocale()

  if (mode === 'multi-option') {
    return [
      {
        id: 'clarify',
        title: isZh ? '澄清配置目标' : 'Clarify the allocation goal',
        description: isZh
          ? '补齐本金、持有期、流动性和 KYC 约束。'
          : 'Clarify principal, holding period, liquidity, and KYC constraints.',
        status: 'pending',
      },
      {
        id: 'search',
        title: isZh ? '搜集条款与证据' : 'Collect evidence and terms',
        description: isZh
          ? '对发行人、托管、申赎和官方链上资料做可追溯核对。'
          : 'Check issuer, custody, redemption, and official onchain references.',
        status: 'pending',
      },
      {
        id: 'compare',
        title: isZh ? '计算风险与模拟' : 'Run risk and simulation',
        description: isZh
          ? '统一输出 RiskVector、持有期收益分布和退出摩擦。'
          : 'Normalize RiskVector, holding distributions, and exit friction.',
        status: 'pending',
      },
      {
        id: 'visualize',
        title: isZh ? '生成对比图表' : 'Generate comparison visuals',
        description: isZh
          ? '输出收益分布、雷达图和建议权重。'
          : 'Generate return distributions, radar charts, and target weights.',
        status: 'pending',
      },
      {
        id: 'report',
        title: isZh ? '生成执行报告' : 'Draft the execution report',
        description: isZh
          ? '整理推荐权重、证据面板、交易草案与链上存证草案。'
          : 'Assemble weights, evidence, tx draft, and attestation draft.',
        status: 'pending',
      },
    ]
  }

  return [
    {
      id: 'clarify',
      title: isZh ? '澄清尽调边界' : 'Clarify diligence scope',
      description: isZh
        ? '补齐单资产尽调所需的收益目标、流动性和 KYC 约束。'
        : 'Clarify the single-asset goal, liquidity, and KYC constraints.',
      status: 'pending',
    },
    {
      id: 'search',
      title: isZh ? '搜索条款证据' : 'Research term-sheet evidence',
      description: isZh
        ? '核对发行人、托管、申赎条款与官方链上资料。'
        : 'Gather issuer, custody, redemption, and onchain evidence.',
      status: 'pending',
    },
    {
      id: 'calculate',
      title: isZh ? '运行风险与收益计算' : 'Run risk and return math',
      description: isZh
        ? '输出统一持有期下的净值、RiskVector 和压力测试。'
        : 'Compute holding value, RiskVector, and stress scenarios.',
      status: 'pending',
    },
    {
      id: 'visualize',
      title: isZh ? '生成尽调图表' : 'Generate diligence visuals',
      description: isZh
        ? '把收益分布、风险雷达和执行权重绘制成图表。'
        : 'Render distributions, radar charts, and execution weights.',
      status: 'pending',
    },
    {
      id: 'report',
      title: isZh ? '撰写资产报告' : 'Draft the asset report',
      description: isZh
        ? '输出结论、证据面板、交易草案与链上存证草案。'
        : 'Produce the final narrative, evidence, tx draft, and attestation draft.',
      status: 'pending',
    },
  ]
}

function resolveActiveStageIndex(
  status: BackendSession['status'],
  activityStatus?: string,
) {
  if (status === 'INIT' || status === 'CLARIFYING') {
    return 0
  }

  if (status === 'ANALYZING') {
    if (
      activityStatus === 'searching_web_for_evidence' ||
      activityStatus === 'searching_and_synthesizing'
    ) {
      return 1
    }

    if (activityStatus === 'running_deterministic_calculations') {
      return 2
    }

    if (activityStatus === 'preparing_visualizations') {
      return 3
    }

    return 2
  }

  return 4
}

export function mapBackendProgress(
  session: BackendSession,
  step?: BackendSessionStepResponse,
): AnalysisProgress {
  const activityStatus = step?.activity_status ?? session.activity_status
  const mode = mapBackendMode(session.mode)
  const activeStageIndex = resolveActiveStageIndex(
    step?.status ?? session.status,
    activityStatus,
  )
  const stages: AnalysisProgress['stages'] = buildStages(mode).map((stage, index) => {
    const status: AnalysisProgress['stages'][number]['status'] =
      (step?.status ?? session.status) === 'COMPLETED'
        ? 'completed'
        : index < activeStageIndex
          ? 'completed'
          : index === activeStageIndex
            ? 'active'
            : 'pending'

    return {
      ...stage,
      status,
    }
  })

  return {
    sessionId: session.session_id,
    status: step?.status ?? session.status,
    overallProgress:
      (step?.status ?? session.status) === 'COMPLETED'
        ? 100
        : Math.round(((activeStageIndex + 1) / stages.length) * 100),
    currentStepLabel:
      step?.prompt_to_user ||
      normalizeActivityLabel(activityStatus) ||
      session.current_focus ||
      mapLastInsight(session),
    errorMessage: step?.error_message ?? session.error_message ?? undefined,
    nextAction: step?.next_action,
    activityStatus,
    currentFocus: step?.current_focus ?? session.current_focus,
    lastStopReason: step?.last_stop_reason ?? session.last_stop_reason,
    stages,
    pendingQuestions: step?.pending_questions?.map((question) => ({
      ...mapBackendQuestion(question),
      sessionId: session.session_id,
    })),
    pendingSearchTasks: step?.pending_search_tasks?.map((task) =>
      mapBackendSearchTask(task, session.session_id),
    ),
    pendingCalculationTasks: (step?.pending_calculation_tasks ?? []).map((task) =>
      mapBackendCalculationTask(task, session.session_id, session.updated_at),
    ),
    pendingChartTasks: (step?.pending_chart_tasks ?? []).map((task) =>
      mapBackendChartTask(task, session.session_id),
    ),
    chartArtifacts: (step?.chart_artifacts ?? session.chart_artifacts).map(
      (artifact) => mapBackendChart(artifact, session.session_id),
    ),
  }
}

export function mapDebugSessionSummary(
  session: BackendDebugSessionSummary,
): DebugSessionSummary {
  return {
    id: session.session_id,
    ownerClientId: session.owner_client_id,
    mode: session.mode,
    problemStatement: session.problem_statement,
    status: session.status,
    eventCount: session.event_count,
    answerCount: session.answer_count,
    evidenceCount: session.evidence_count,
    searchTaskCount: session.search_task_count,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  }
}

export function mapAuditLogEntry(entry: BackendAuditLogEntry): AuditLogEntry {
  return {
    id: entry.log_id,
    action: entry.action,
    actor: entry.actor,
    target: entry.target,
    ipAddress: entry.ip_address,
    createdAt: entry.created_at,
    status: entry.status,
    summary: entry.summary,
    metadata: entry.metadata,
  }
}

export function toBackendAnswers(answers: UserAnswer[]): BackendUserAnswer[] {
  return answers.map((answer) => {
    const joinedOptions = answer.selectedOptions?.filter(Boolean).join(', ')
    const value =
      joinedOptions ||
      answer.customInput ||
      (typeof answer.numericValue === 'number' && Number.isFinite(answer.numericValue)
        ? String(answer.numericValue)
        : '') ||
      answer.answerStatus

    return {
      question_id: answer.questionId,
      value,
      source: 'frontend',
      answered_at: new Date().toISOString(),
    }
  })
}

export function backendSessionToResourceRecord(
  session: AnalysisSession,
): ResourceRecord {
  return {
    id: session.id,
    title: session.problemStatement,
    subtitle: session.mode,
    status: session.status,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
  }
}
