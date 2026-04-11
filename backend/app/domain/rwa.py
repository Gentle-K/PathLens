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
    wallet_network: str = ""
    wallet_kyc_level_onchain: int | None = None
    wallet_kyc_verified: bool | None = None
    wants_onchain_attestation: bool = True
    additional_constraints: str = ""


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
    settlement_asset: str = "USDT"
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


class AssetAnalysisCard(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_type: AssetType
    issuer: str = ""
    custody: str = ""
    chain_id: int
    contract_address: str = ""
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
    risk_vector: RiskVector
    risk_breakdown: list[RiskBreakdownItem] = Field(default_factory=list)
    risk_data_quality: float = 1.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    evidence_refs: list[str] = Field(default_factory=list)


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
