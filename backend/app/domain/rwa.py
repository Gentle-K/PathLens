from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AssetType(str, Enum):
    STABLECOIN = "stablecoin"
    MMF = "mmf"
    PRECIOUS_METAL = "precious_metal"
    REAL_ESTATE = "real_estate"
    STOCKS = "stocks"
    BENCHMARK = "benchmark"


class DataSourceTag(str, Enum):
    ONCHAIN_VERIFIED = "onchain_verified"
    ORACLE_FED = "oracle_fed"
    ISSUER_DISCLOSED = "issuer_disclosed"
    THIRD_PARTY_SOURCE = "third_party_source"
    MODEL_INFERENCE = "model_inference"
    USER_ASSUMPTION = "user_assumption"


class AssetStatus(str, Enum):
    PRODUCTION = "production"
    VERIFIED = "verified"
    ISSUER_DISCLOSED = "issuer_disclosed"
    BENCHMARK = "benchmark"
    DEMO = "demo"
    EXPERIMENTAL = "experimental"


class TruthLevel(str, Enum):
    ONCHAIN_VERIFIED = "onchain_verified"
    ISSUER_DISCLOSED = "issuer_disclosed"
    BENCHMARK_REFERENCE = "benchmark_reference"
    DEMO_ONLY = "demo_only"


class LiveReadiness(str, Enum):
    READY = "ready"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"
    DEMO_ONLY = "demo_only"


class ActionType(str, Enum):
    SUBSCRIBE = "subscribe"
    MINT = "mint"
    REDEEM = "redeem"
    HOLD = "hold"
    LEARN_MORE = "learn_more"
    EXTERNAL_ONLY = "external_only"


class ActionReadiness(str, Enum):
    READY = "ready"
    PARTIAL = "partial"
    UNAVAILABLE = "unavailable"


class EvidenceFactType(str, Enum):
    ONCHAIN_VERIFIED_FACT = "onchain_verified_fact"
    OFFCHAIN_DISCLOSED_FACT = "offchain_disclosed_fact"
    ORACLE_FACT = "oracle_fact"
    THIRD_PARTY_FACT = "third_party_fact"
    INFERRED_FACT = "inferred_fact"


class EvidenceFreshnessBucket(str, Enum):
    FRESH = "fresh"
    AGING = "aging"
    STALE = "stale"
    UNDATED = "undated"


class RiskTolerance(str, Enum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class LiquidityNeed(str, Enum):
    INSTANT = "instant"
    T_PLUS_3 = "t_plus_3"
    LOCKED = "locked"


class KycStatus(str, Enum):
    NONE = "none"
    APPROVED = "approved"
    REVOKED = "revoked"
    UNAVAILABLE = "unavailable"


class EligibilityStatus(str, Enum):
    ELIGIBLE = "eligible"
    CONDITIONAL = "conditional"
    BLOCKED = "blocked"


class ExecutionLifecycleStatus(str, Enum):
    NOT_READY = "NOT_READY"
    READY = "READY"
    SIMULATED = "SIMULATED"
    BUNDLE_READY = "BUNDLE_READY"
    EXECUTING = "EXECUTING"
    MONITORING = "MONITORING"
    FAILED = "FAILED"


class TransactionStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class HashKeyChainConfig(BaseModel):
    ecosystem_name: str = "HashKey Chain"
    native_token_symbol: str = "HSK"
    default_execution_network: str = "mainnet"
    testnet_chain_id: int = 133
    testnet_rpc_url: str = "https://testnet.hsk.xyz"
    testnet_explorer_url: str = "https://testnet-explorer.hsk.xyz"
    mainnet_chain_id: int = 177
    mainnet_rpc_url: str = "https://mainnet.hsk.xyz"
    mainnet_explorer_url: str = "https://hashkey.blockscout.com"
    plan_registry_address: str = ""
    kyc_sbt_address: str = ""
    testnet_plan_registry_address: str = ""
    mainnet_plan_registry_address: str = ""
    testnet_kyc_sbt_address: str = ""
    mainnet_kyc_sbt_address: str = ""
    docs_urls: list[str] = Field(default_factory=list)
    oracle_feeds: list["OracleFeedConfig"] = Field(default_factory=list)


class OracleFeedConfig(BaseModel):
    feed_id: str
    pair: str
    source_name: str = "APRO Oracle"
    docs_url: str = ""
    testnet_address: str = ""
    mainnet_address: str = ""
    decimals: int = 8


class MarketDataSnapshot(BaseModel):
    feed_id: str
    pair: str
    network: str
    source_name: str
    source_url: str
    feed_address: str
    explorer_url: str = ""
    price: float | None = None
    decimals: int = 8
    fetched_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime | None = None
    round_id: int | None = None
    note: str = ""
    status: str = "unavailable"


class RwaIntakeContext(BaseModel):
    investment_amount: float = 10000.0
    base_currency: str = "USDT"
    preferred_asset_ids: list[str] = Field(default_factory=list)
    holding_period_days: int = 30
    risk_tolerance: RiskTolerance = RiskTolerance.BALANCED
    liquidity_need: LiquidityNeed = LiquidityNeed.T_PLUS_3
    minimum_kyc_level: int = 0
    wallet_address: str = ""
    safe_address: str = ""
    wallet_network: str = ""
    wallet_kyc_level_onchain: int | None = None
    wallet_kyc_verified: bool | None = None
    kyc_level: int | None = None
    kyc_status: str = ""
    investor_type: str = ""
    jurisdiction: str = ""
    source_chain: str = ""
    source_asset: str = ""
    ticket_size: float | None = None
    liquidity_urgency: str = ""
    lockup_tolerance: str = ""
    target_yield: float | None = None
    max_drawdown_tolerance: float | None = None
    custody_preference: str = ""
    wants_onchain_attestation: bool = True
    additional_constraints: str = ""
    include_non_production_assets: bool = False
    demo_mode: bool = False
    demo_scenario_id: str = ""
    analysis_seed: int | None = None


class ActionLink(BaseModel):
    kind: str
    label: str
    url: str


class ActionBlocker(BaseModel):
    code: str
    label: str
    detail: str
    severity: str = "warning"


class ActionIntent(BaseModel):
    asset_id: str
    asset_name: str
    action_type: ActionType = ActionType.LEARN_MORE
    action_readiness: ActionReadiness = ActionReadiness.UNAVAILABLE
    summary: str = ""
    action_blockers: list[ActionBlocker] = Field(default_factory=list)
    action_links: list[ActionLink] = Field(default_factory=list)
    execution_notes: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)


class AssetTemplate(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_type: AssetType
    description: str
    issuer: str = ""
    custody: str = ""
    chain_id: int
    contract_address: str = ""
    protocol_name: str = ""
    permissioning_standard: str = ""
    required_kyc_level: int | None = None
    eligible_investor_types: list[str] = Field(default_factory=list)
    restricted_jurisdictions: list[str] = Field(default_factory=list)
    min_subscription_amount: float = 0.0
    redemption_window: str = ""
    settlement_asset: str = "USDT"
    oracle_provider: str = ""
    oracle_contract: str = ""
    last_oracle_timestamp: datetime | None = None
    nav_or_price: float | None = None
    indicative_yield: float | None = None
    reserve_summary: str = ""
    custody_summary: str = ""
    bridge_support: list[str] = Field(default_factory=list)
    proof_refs: list[str] = Field(default_factory=list)
    secondary_market_available: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    execution_style: str = "erc20"
    benchmark_apy: float = 0.0
    expected_return_low: float = 0.0
    expected_return_base: float = 0.0
    expected_return_high: float = 0.0
    price_volatility: float = 0.0
    max_drawdown_180d: float = 0.0
    avg_daily_volume_usd: float = 0.0
    redemption_days: int = 0
    lockup_days: int = 0
    management_fee_bps: int = 0
    entry_fee_bps: int = 0
    exit_fee_bps: int = 0
    slippage_bps: int = 0
    depeg_events_90d: int | None = None
    worst_depeg_bps_90d: int | None = None
    issuer_disclosure_score: float = 0.5
    custody_disclosure_score: float = 0.5
    audit_disclosure_score: float = 0.5
    contract_is_upgradeable: bool = False
    has_admin_key: bool = False
    oracle_count: int = 1
    oracle_sources: list[str] = Field(default_factory=list)
    requires_kyc_level: int | None = None
    minimum_ticket_usd: float = 0.0
    tags: list[str] = Field(default_factory=list)
    thesis: str = ""
    fit_summary: str = ""
    evidence_urls: list[str] = Field(default_factory=list)
    primary_source_url: str = ""
    onchain_verified: bool = False
    issuer_disclosed: bool = False
    featured: bool = False
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    status_explanation: str = ""
    truth_level_explanation: str = ""
    action_type: ActionType = ActionType.LEARN_MORE
    action_readiness: ActionReadiness = ActionReadiness.UNAVAILABLE
    action_links: list[ActionLink] = Field(default_factory=list)
    action_blocker_reasons: list[str] = Field(default_factory=list)
    execution_notes: list[str] = Field(default_factory=list)
    # ERC-3643 compliance reference fields (informational only)
    issuer_model: str = ""
    holder_eligibility_note: str = ""
    transfer_compliance_note: str = ""
    redemption_custody_note: str = ""

    def total_cost_bps(self, holding_period_days: int) -> int:
        annualized_management_bps = int(
            round(self.management_fee_bps * max(1, holding_period_days) / 365)
        )
        return (
            self.entry_fee_bps
            + self.exit_fee_bps
            + self.slippage_bps
            + annualized_management_bps
        )


class RiskVector(BaseModel):
    asset_id: str
    asset_name: str
    market: float
    liquidity: float
    peg_redemption: float
    issuer_custody: float
    smart_contract: float
    oracle_dependency: float
    compliance_access: float
    overall: float


class RiskBreakdownItem(BaseModel):
    dimension: str
    raw_value: float | None = None
    normalized_score: float
    weight: float
    evidence_refs: list[str] = Field(default_factory=list)
    data_status: str = "live"
    note: str = ""


class MethodologyReference(BaseModel):
    key: str
    title: str
    url: str
    summary: str = ""


class SourceProvenanceRef(BaseModel):
    ref_id: str
    title: str
    source_name: str
    source_url: str
    source_kind: str = "report"
    source_tier: str = "official"
    freshness_date: str = ""
    verified_summary: str = ""


class ConfidenceBand(BaseModel):
    label: str
    low: float
    base: float
    high: float
    unit: str = "%"
    confidence_level: float = 0.8
    note: str = ""


class StressScenario(BaseModel):
    scenario_key: str
    title: str
    severity: str = "adverse"
    narrative: str
    portfolio_impact_pct: float
    liquidity_impact_days: float = 0.0
    affected_asset_ids: list[str] = Field(default_factory=list)
    source_provenance_refs: list[str] = Field(default_factory=list)


class ReserveBackingSummary(BaseModel):
    title: str
    summary: str
    reserve_quality_score: float
    attestation_status: str
    liquidity_notice: str = ""
    asset_symbols: list[str] = Field(default_factory=list)
    source_provenance_refs: list[str] = Field(default_factory=list)


class SimulationPathPoint(BaseModel):
    day: int
    p10_value: float
    p50_value: float
    p90_value: float


class HoldingPeriodSimulation(BaseModel):
    asset_id: str
    asset_name: str
    holding_period_days: int
    ending_value_low: float
    ending_value_base: float
    ending_value_high: float
    return_pct_low: float
    return_pct_base: float
    return_pct_high: float
    var_95_pct: float
    cvar_95_pct: float
    max_drawdown_low_pct: float
    max_drawdown_base_pct: float
    max_drawdown_high_pct: float
    scenario_note: str = ""
    path: list[SimulationPathPoint] = Field(default_factory=list)


class PortfolioAllocation(BaseModel):
    asset_id: str
    asset_name: str
    target_weight_pct: float
    suggested_amount: float
    rationale: str
    blocked_reason: str = ""


class ComparisonMatrixMetric(BaseModel):
    key: str
    label: str
    description: str = ""
    unit: str = ""


class ComparisonMatrixCell(BaseModel):
    metric_key: str
    label: str
    display_value: str
    raw_value: float | str | bool | None = None
    tone: str = "neutral"
    badges: list[str] = Field(default_factory=list)
    rationale: str = ""
    tooltip: str = ""
    is_blocked: bool = False


class ComparisonMatrixRow(BaseModel):
    asset_id: str
    asset_name: str
    asset_symbol: str
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    cells: list[ComparisonMatrixCell] = Field(default_factory=list)


class ComparisonMatrix(BaseModel):
    title: str
    metrics: list[ComparisonMatrixMetric] = Field(default_factory=list)
    rows: list[ComparisonMatrixRow] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class RecommendationDriver(BaseModel):
    title: str
    detail: str
    impact: str = "medium"
    asset_id: str = ""


class ExcludedAssetReason(BaseModel):
    asset_id: str
    asset_name: str
    category: str = ""
    reason: str


class ConstraintImpact(BaseModel):
    constraint_key: str
    label: str
    impact_level: str = "medium"
    detail: str


class SensitivitySummary(BaseModel):
    scenario_key: str
    label: str
    impact_summary: str
    changed_assets: list[str] = Field(default_factory=list)
    recommended_shift: str = ""


class RecommendationReason(BaseModel):
    summary: str = ""
    top_drivers: list[RecommendationDriver] = Field(default_factory=list)
    excluded_reasons: list[ExcludedAssetReason] = Field(default_factory=list)
    constraint_impacts: list[ConstraintImpact] = Field(default_factory=list)
    sensitivity_summary: list[SensitivitySummary] = Field(default_factory=list)


class ExecutionApproval(BaseModel):
    approval_type: str
    token_symbol: str = ""
    spender: str = ""
    amount: float | None = None
    note: str = ""


class ExecutionQuote(BaseModel):
    source_asset: str
    target_asset: str
    amount_in: float
    expected_amount_out: float
    fee_amount: float
    fee_bps: float
    gas_estimate: int
    gas_estimate_usd: float
    eta_seconds: int
    route_type: str = "erc20"
    warnings: list[str] = Field(default_factory=list)


class EligibilityDecision(BaseModel):
    decision_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str
    asset_name: str
    chain_id: int
    contract_address: str = ""
    status: EligibilityStatus = EligibilityStatus.BLOCKED
    reasons: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=utcnow)


class PositionSnapshot(BaseModel):
    snapshot_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str
    asset_name: str
    chain_id: int
    contract_address: str = ""
    wallet_address: str = ""
    safe_address: str = ""
    current_balance: float = 0.0
    latest_nav_or_price: float = 0.0
    current_value: float = 0.0
    cost_basis: float = 0.0
    unrealized_pnl: float = 0.0
    accrued_yield: float = 0.0
    next_redemption_window: str = ""
    oracle_staleness_flag: bool = False
    kyc_change_flag: bool = False
    as_of: datetime = Field(default_factory=utcnow)


class ExecutionStep(BaseModel):
    execution_step_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    step_index: int = 1
    title: str
    description: str
    step_type: str
    route_kind: str = "erc20"
    asset_id: str = ""
    target_contract: str = ""
    explorer_url: str = ""
    chain_id: int | None = None
    estimated_fee_usd: float = 0.0
    expected_amount: float | None = None
    requires_signature: bool = True
    requires_wallet: bool = True
    requires_safe: bool = False
    compliance_blockers: list[str] = Field(default_factory=list)
    required_approvals: list[ExecutionApproval] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    tx_request: dict[str, Any] = Field(default_factory=dict)
    offchain_actions: list[str] = Field(default_factory=list)
    status: str = "pending"


class ExecutionPlan(BaseModel):
    execution_plan_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    session_id: str = ""
    generated_at: datetime = Field(default_factory=utcnow)
    wallet_address: str = ""
    safe_address: str = ""
    source_chain: str = ""
    source_asset: str = ""
    target_asset: str = ""
    ticket_size: float = 0.0
    status: ExecutionLifecycleStatus = ExecutionLifecycleStatus.NOT_READY
    quote: ExecutionQuote | None = None
    warnings: list[str] = Field(default_factory=list)
    simulation_warnings: list[str] = Field(default_factory=list)
    possible_failure_reasons: list[str] = Field(default_factory=list)
    compliance_blockers: list[str] = Field(default_factory=list)
    required_approvals: list[ExecutionApproval] = Field(default_factory=list)
    steps: list[ExecutionStep] = Field(default_factory=list)
    tx_bundle: list[dict[str, Any]] = Field(default_factory=list)
    eligibility: list[EligibilityDecision] = Field(default_factory=list)
    can_execute_onchain: bool = False
    plan_hash: str = ""


class TxDraftStep(BaseModel):
    step: int
    title: str
    description: str
    action_type: str
    target_contract: str = ""
    explorer_url: str = ""
    estimated_fee_usd: float = 0.0
    caution: str = ""


class TxDraft(BaseModel):
    title: str
    chain_id: int
    chain_name: str
    funding_asset: str
    total_estimated_fee_usd: float
    steps: list[TxDraftStep] = Field(default_factory=list)
    risk_warnings: list[str] = Field(default_factory=list)
    can_execute_onchain: bool = False


class AttestationDraft(BaseModel):
    chain_id: int
    report_hash: str
    portfolio_hash: str
    attestation_hash: str
    evidence_hash: str = ""
    execution_plan_hash: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    network: str = ""
    contract_address: str = ""
    explorer_url: str = ""
    event_name: str = "PlanRegistered"
    ready: bool = False
    transaction_hash: str = ""
    transaction_url: str = ""
    submitted_by: str = ""
    submitted_at: datetime | None = None
    block_number: int | None = None


class TransactionReceiptRecord(BaseModel):
    receipt_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    tx_hash: str
    tx_status: TransactionStatus = TransactionStatus.SUBMITTED
    block_number: int | None = None
    chain_id: int | None = None
    executed_at: datetime = Field(default_factory=utcnow)
    wallet_address: str = ""
    safe_address: str = ""
    related_execution_step_id: str = ""
    explorer_url: str = ""
    receipt_payload: dict[str, Any] = Field(default_factory=dict)
    failure_reason: str = ""
    retry_hint: str = ""


class ReportAnchorRecord(BaseModel):
    anchor_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    report_hash: str
    evidence_hash: str
    execution_plan_hash: str
    attestation_hash: str
    status: str = "draft"
    chain_id: int | None = None
    contract_address: str = ""
    transaction_hash: str = ""
    block_number: int | None = None
    explorer_url: str = ""
    anchored_at: datetime | None = None
    note: str = ""


class AssetAnalysisCard(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_type: AssetType
    issuer: str = ""
    custody: str = ""
    chain_id: int
    contract_address: str = ""
    protocol_name: str = ""
    permissioning_standard: str = ""
    required_kyc_level: int | None = None
    eligible_investor_types: list[str] = Field(default_factory=list)
    restricted_jurisdictions: list[str] = Field(default_factory=list)
    min_subscription_amount: float = 0.0
    redemption_window: str = ""
    settlement_asset: str = "USDT"
    oracle_provider: str = ""
    oracle_contract: str = ""
    last_oracle_timestamp: datetime | None = None
    nav_or_price: float | None = None
    indicative_yield: float | None = None
    reserve_summary: str = ""
    custody_summary: str = ""
    bridge_support: list[str] = Field(default_factory=list)
    proof_refs: list[str] = Field(default_factory=list)
    secondary_market_available: bool = False
    risk_flags: list[str] = Field(default_factory=list)
    expected_return_low: float
    expected_return_base: float
    expected_return_high: float
    exit_days: int
    total_cost_bps: int
    kyc_required_level: int | None = None
    thesis: str = ""
    fit_summary: str = ""
    tags: list[str] = Field(default_factory=list)
    primary_source_url: str = ""
    onchain_verified: bool = False
    issuer_disclosed: bool = False
    statuses: list[AssetStatus] = Field(default_factory=list)
    truth_level: TruthLevel = TruthLevel.ISSUER_DISCLOSED
    live_readiness: LiveReadiness = LiveReadiness.PARTIAL
    default_rank_eligible: bool = True
    status_explanation: str = ""
    truth_level_explanation: str = ""
    risk_vector: RiskVector
    risk_breakdown: list[RiskBreakdownItem] = Field(default_factory=list)
    risk_data_quality: float = 1.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)


class EvidenceFreshness(BaseModel):
    bucket: EvidenceFreshnessBucket = EvidenceFreshnessBucket.UNDATED
    label: str = ""
    age_hours: float | None = None
    stale_warning: str = ""


class EvidenceConflict(BaseModel):
    asset_id: str = ""
    field_key: str
    severity: str = "warning"
    summary: str
    evidence_ids: list[str] = Field(default_factory=list)


class EvidenceCoverage(BaseModel):
    asset_id: str
    asset_name: str = ""
    coverage_score: float = 0.0
    completeness_score: float = 0.0
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class EvidenceGovernance(BaseModel):
    overall_score: float = 0.0
    weak_evidence_warning: str = ""
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    coverage: list[EvidenceCoverage] = Field(default_factory=list)


class DemoScenarioDefinition(BaseModel):
    scenario_id: str
    title: str
    description: str
    problem_statement: str
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)
    featured_asset_ids: list[str] = Field(default_factory=list)
    analysis_seed: int
    demo_label: str = "Official Demo"
    notes: list[str] = Field(default_factory=list)


class ComparableAllocationSnapshot(BaseModel):
    asset_id: str
    asset_name: str
    target_weight_pct: float


class ComparableAssetSnapshot(BaseModel):
    asset_id: str
    asset_name: str
    overall_risk: float
    data_quality: float


class ComparableReportSnapshot(BaseModel):
    snapshot_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    created_at: datetime = Field(default_factory=utcnow)
    summary: str = ""
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)
    recommended_allocations: list[ComparableAllocationSnapshot] = Field(default_factory=list)
    asset_snapshots: list[ComparableAssetSnapshot] = Field(default_factory=list)
    evidence_count: int = 0
    evidence_conflict_count: int = 0
    coverage_score: float = 0.0
    warnings: list[str] = Field(default_factory=list)


class DiffFieldChange(BaseModel):
    label: str
    before: str
    after: str
    detail: str = ""


class AllocationDiffItem(BaseModel):
    asset_id: str
    asset_name: str
    before_weight_pct: float
    after_weight_pct: float
    delta_weight_pct: float
    reason: str = ""


class RiskDiffItem(BaseModel):
    asset_id: str
    asset_name: str
    before_overall: float
    after_overall: float
    delta_overall: float


class EvidenceDiffItem(BaseModel):
    asset_id: str = ""
    asset_name: str = ""
    before_coverage_score: float = 0.0
    after_coverage_score: float = 0.0
    before_conflict_count: int = 0
    after_conflict_count: int = 0
    summary: str = ""


class ReanalysisDiff(BaseModel):
    previous_snapshot_at: datetime | None = None
    current_generated_at: datetime = Field(default_factory=utcnow)
    summary: str = ""
    changed_constraints: list[DiffFieldChange] = Field(default_factory=list)
    changed_weights: list[AllocationDiffItem] = Field(default_factory=list)
    changed_risk: list[RiskDiffItem] = Field(default_factory=list)
    changed_evidence: list[EvidenceDiffItem] = Field(default_factory=list)
    previous_recommendation: list[str] = Field(default_factory=list)
    current_recommendation: list[str] = Field(default_factory=list)
    why_changed: list[str] = Field(default_factory=list)


class OracleSnapshot(BaseModel):
    feed_id: str
    pair: str
    network: str
    source_name: str
    source_url: str
    feed_address: str
    explorer_url: str = ""
    price: float | None = None
    decimals: int = 8
    fetched_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime | None = None
    round_id: int | None = None
    note: str = ""
    status: str = "unavailable"


class KycOnchainResult(BaseModel):
    wallet_address: str
    network: str
    contract_address: str = ""
    status: KycStatus = KycStatus.NONE
    is_human: bool = False
    level: int = 0
    source_url: str = ""
    explorer_url: str = ""
    fetched_at: datetime = Field(default_factory=utcnow)
    note: str = ""


class WalletBalance(BaseModel):
    symbol: str
    amount: float
    chain_id: int
    contract_address: str = ""
    usd_value: float = 0.0
    price: float = 0.0


class EvidencePanelItem(BaseModel):
    evidence_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    asset_id: str = ""
    title: str
    source_url: str
    source_name: str
    source_tag: DataSourceTag = DataSourceTag.ISSUER_DISCLOSED
    fetched_at: datetime = Field(default_factory=utcnow)
    summary: str
    extracted_facts: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    fact_type: EvidenceFactType = EvidenceFactType.OFFCHAIN_DISCLOSED_FACT
    freshness: EvidenceFreshness = Field(default_factory=EvidenceFreshness)
    conflict_keys: list[str] = Field(default_factory=list)
