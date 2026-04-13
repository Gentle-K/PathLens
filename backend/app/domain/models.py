from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from app.domain.rwa import (
    ActionIntent,
    AssetAnalysisCard,
    AttestationDraft,
    ConfidenceBand,
    ComparableReportSnapshot,
    ComparisonMatrix,
    EvidenceFactType,
    EvidenceFreshness,
    EvidenceGovernance,
    ExecutionLifecycleStatus,
    ExecutionPlan,
    EligibilityDecision,
    HashKeyChainConfig,
    HoldingPeriodSimulation,
    KycOnchainResult,
    MarketDataSnapshot,
    MethodologyReference,
    PortfolioAllocation,
    PositionSnapshot,
    ReportAnchorRecord,
    ReserveBackingSummary,
    RecommendationReason,
    ReanalysisDiff,
    RwaIntakeContext,
    SourceProvenanceRef,
    StressScenario,
    TransactionReceiptRecord,
    TxDraft,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnalysisMode(str, Enum):
    SINGLE_ASSET_ALLOCATION = "single_asset_allocation"
    STRATEGY_COMPARE = "strategy_compare"
    SINGLE_DECISION = SINGLE_ASSET_ALLOCATION
    MULTI_OPTION = STRATEGY_COMPARE

    @classmethod
    def _missing_(cls, value: object) -> "AnalysisMode" | None:
        aliases = {
            "single_decision": cls.SINGLE_ASSET_ALLOCATION,
            "single-option": cls.SINGLE_ASSET_ALLOCATION,
            "single_asset_allocation": cls.SINGLE_ASSET_ALLOCATION,
            "multi_option": cls.STRATEGY_COMPARE,
            "multi-option": cls.STRATEGY_COMPARE,
            "strategy_compare": cls.STRATEGY_COMPARE,
        }
        if isinstance(value, str):
            return aliases.get(value.strip().lower())
        return None


class SessionStatus(str, Enum):
    INIT = "INIT"
    CLARIFYING = "CLARIFYING"
    ANALYZING = "ANALYZING"
    READY_FOR_REPORT = "READY_FOR_REPORT"
    REPORTING = "REPORTING"
    READY_FOR_EXECUTION = "READY_FOR_EXECUTION"
    EXECUTING = "EXECUTING"
    MONITORING = "MONITORING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class NextAction(str, Enum):
    ASK_USER = "ask_user"
    RUN_MCP = "run_mcp"
    PREVIEW_REPORT = "preview_report"
    COMPLETE = "complete"


class ClarificationQuestion(BaseModel):
    question_id: str = Field(default_factory=lambda: str(uuid4()))
    question_text: str
    purpose: str
    options: list[str] = Field(default_factory=list)
    allow_custom_input: bool = True
    allow_skip: bool = True
    priority: int = 1
    answered: bool = False
    question_group: str = ""
    input_hint: str = ""
    example_answer: str = ""


class UserAnswer(BaseModel):
    question_id: str
    value: str
    source: str = "frontend"
    answered_at: datetime = Field(default_factory=utcnow)


class SearchTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()))
    search_topic: str
    search_goal: str
    search_scope: str
    suggested_queries: list[str] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)
    freshness_requirement: str = "medium"
    status: str = "pending"
    task_group: str = ""
    notes: str = ""


class CalculationTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()))
    objective: str
    formula_hint: str
    input_params: dict[str, Any] = Field(default_factory=dict)
    unit: str = ""
    result_value: float | None = None
    result_text: str = ""
    result_payload: dict[str, Any] = Field(default_factory=dict)
    error_margin: str = ""
    notes: str = ""
    status: str = "pending"
    validation_state: str = "pending"
    failure_reason: str = ""
    user_visible: bool = True
    semantic_signature: str = ""
    report_section_keys: list[str] = Field(default_factory=list)
    execution_step_ids: list[str] = Field(default_factory=list)


class ChartTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()))
    objective: str
    chart_type: str
    title: str
    preferred_unit: str = ""
    source_task_ids: list[str] = Field(default_factory=list)
    notes: str = ""
    status: str = "pending"


class EvidenceItem(BaseModel):
    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    asset_id: str = ""
    title: str
    source_url: str
    source_name: str
    source_type: str = "internal"
    source_tag: str = ""
    fetched_at: datetime = Field(default_factory=utcnow)
    summary: str
    extracted_facts: list[str] = Field(default_factory=list)
    confidence: float = 0.5
    fact_type: EvidenceFactType = EvidenceFactType.OFFCHAIN_DISCLOSED_FACT
    freshness: EvidenceFreshness = Field(default_factory=EvidenceFreshness)
    conflict_keys: list[str] = Field(default_factory=list)
    contract_address: str = ""
    chain_id: int | None = None
    oracle_provider: str = ""
    proof_type: str = ""
    last_verified_at: datetime | None = None
    included_in_execution_plan: bool = False
    report_section_keys: list[str] = Field(default_factory=list)
    execution_step_ids: list[str] = Field(default_factory=list)


class ChartArtifact(BaseModel):
    chart_id: str = Field(default_factory=lambda: str(uuid4()))
    chart_type: str
    title: str
    spec: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class MajorConclusionItem(BaseModel):
    conclusion_id: str = Field(default_factory=lambda: str(uuid4()))
    content: str
    conclusion_type: str
    basis_refs: list[str] = Field(default_factory=list)
    confidence: float = 0.5


class BudgetLineItem(BaseModel):
    line_item_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    category: str
    item_type: str = "cost"
    low: float = 0.0
    base: float = 0.0
    high: float = 0.0
    currency: str = "CNY"
    rationale: str = ""
    basis_refs: list[str] = Field(default_factory=list)
    confidence: float = 0.5


class BudgetSummary(BaseModel):
    currency: str = "CNY"
    total_cost_low: float = 0.0
    total_cost_base: float = 0.0
    total_cost_high: float = 0.0
    total_income_low: float = 0.0
    total_income_base: float = 0.0
    total_income_high: float = 0.0
    net_low: float = 0.0
    net_base: float = 0.0
    net_high: float = 0.0
    reserve_note: str = ""


class OptionProfile(BaseModel):
    option_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    summary: str = ""
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    fit_for: list[str] = Field(default_factory=list)
    caution_flags: list[str] = Field(default_factory=list)
    estimated_cost_low: float | None = None
    estimated_cost_base: float | None = None
    estimated_cost_high: float | None = None
    currency: str = "CNY"
    score: float | None = None
    confidence: float = 0.5
    basis_refs: list[str] = Field(default_factory=list)


class ReportTable(BaseModel):
    table_id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    columns: list[str] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    notes: str = ""


class AnalysisLoopPlan(BaseModel):
    clarification_questions: list[ClarificationQuestion] = Field(default_factory=list)
    search_tasks: list[SearchTask] = Field(default_factory=list)
    calculation_tasks: list[CalculationTask] = Field(default_factory=list)
    chart_tasks: list[ChartTask] = Field(default_factory=list)
    major_conclusions: list[MajorConclusionItem] = Field(default_factory=list)
    ready_for_report: bool = False
    reasoning_focus: str = ""
    stop_reason: str = ""


class AnalysisReport(BaseModel):
    summary: str
    assumptions: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    chart_refs: list[str] = Field(default_factory=list)
    markdown: str = ""
    confidence_band: ConfidenceBand | None = None
    stress_scenarios: list[StressScenario] = Field(default_factory=list)
    reserve_backing_summary: ReserveBackingSummary | None = None
    source_provenance_refs: list[SourceProvenanceRef] = Field(default_factory=list)
    oracle_stress_score: float | None = None
    budget_summary: BudgetSummary | None = None
    budget_items: list[BudgetLineItem] = Field(default_factory=list)
    option_profiles: list[OptionProfile] = Field(default_factory=list)
    tables: list[ReportTable] = Field(default_factory=list)
    chain_config: HashKeyChainConfig | None = None
    kyc_snapshot: KycOnchainResult | None = None
    market_snapshots: list[MarketDataSnapshot] = Field(default_factory=list)
    asset_cards: list[AssetAnalysisCard] = Field(default_factory=list)
    simulations: list[HoldingPeriodSimulation] = Field(default_factory=list)
    recommended_allocations: list[PortfolioAllocation] = Field(default_factory=list)
    comparison_matrix: ComparisonMatrix | None = None
    recommendation_reason: RecommendationReason | None = None
    action_intents: list[ActionIntent] = Field(default_factory=list)
    evidence_governance: EvidenceGovernance | None = None
    reanalysis_diff: ReanalysisDiff | None = None
    methodology_references: list[MethodologyReference] = Field(default_factory=list)
    tx_draft: TxDraft | None = None
    attestation_draft: AttestationDraft | None = None
    eligibility_summary: list[EligibilityDecision] = Field(default_factory=list)
    execution_plan: ExecutionPlan | None = None
    transaction_receipts: list[TransactionReceiptRecord] = Field(default_factory=list)
    report_anchor_records: list[ReportAnchorRecord] = Field(default_factory=list)
    position_snapshots: list[PositionSnapshot] = Field(default_factory=list)


class SessionEvent(BaseModel):
    timestamp: datetime = Field(default_factory=utcnow)
    kind: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AuditLogEntry(BaseModel):
    log_id: str = Field(default_factory=lambda: str(uuid4()))
    action: str
    actor: str
    target: str
    ip_address: str
    created_at: datetime = Field(default_factory=utcnow)
    status: str = "success"
    summary: str
    metadata: dict[str, str] = Field(default_factory=dict)


class AnalysisSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    owner_client_id: str
    mode: AnalysisMode
    locale: str = "zh"
    problem_statement: str
    intake_context: RwaIntakeContext = Field(default_factory=RwaIntakeContext)
    status: SessionStatus = SessionStatus.INIT
    wallet_address: str = ""
    safe_address: str = ""
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
    execution_status: ExecutionLifecycleStatus = ExecutionLifecycleStatus.PREPARED
    last_onchain_sync_at: datetime | None = None
    clarification_questions: list[ClarificationQuestion] = Field(default_factory=list)
    answers: list[UserAnswer] = Field(default_factory=list)
    search_tasks: list[SearchTask] = Field(default_factory=list)
    calculation_tasks: list[CalculationTask] = Field(default_factory=list)
    chart_tasks: list[ChartTask] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    chart_artifacts: list[ChartArtifact] = Field(default_factory=list)
    major_conclusions: list[MajorConclusionItem] = Field(default_factory=list)
    eligibility_decisions: list[EligibilityDecision] = Field(default_factory=list)
    execution_plan: ExecutionPlan | None = None
    transaction_receipts: list[TransactionReceiptRecord] = Field(default_factory=list)
    report_anchor_records: list[ReportAnchorRecord] = Field(default_factory=list)
    position_snapshots: list[PositionSnapshot] = Field(default_factory=list)
    report: AnalysisReport | None = None
    report_snapshots: list[ComparableReportSnapshot] = Field(default_factory=list)
    analysis_rounds_completed: int = 0
    follow_up_round_limit: int = 10
    follow_up_rounds_used: int = 0
    follow_up_extensions_used: int = 0
    follow_up_budget_exhausted: bool = False
    deferred_follow_up_question_count: int = 0
    activity_status: str = "idle"
    current_focus: str = ""
    last_stop_reason: str = ""
    error_message: str | None = None
    events: list[SessionEvent] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def touch(self) -> None:
        if self.wallet_address:
            self.intake_context.wallet_address = self.wallet_address
        elif self.intake_context.wallet_address:
            self.wallet_address = self.intake_context.wallet_address

        if self.safe_address:
            self.intake_context.safe_address = self.safe_address
        elif self.intake_context.safe_address:
            self.safe_address = self.intake_context.safe_address

        if self.ticket_size is None and self.intake_context.ticket_size is not None:
            self.ticket_size = self.intake_context.ticket_size
        elif self.ticket_size is not None:
            self.intake_context.ticket_size = self.ticket_size

        if self.source_chain:
            self.intake_context.source_chain = self.source_chain
        elif self.intake_context.source_chain:
            self.source_chain = self.intake_context.source_chain

        if self.source_asset:
            self.intake_context.source_asset = self.source_asset
        elif self.intake_context.source_asset:
            self.source_asset = self.intake_context.source_asset

        self.updated_at = utcnow()
