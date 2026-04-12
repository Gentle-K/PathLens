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
    HashKeyChainConfig,
    HoldingPeriodSimulation,
    KycOnchainResult,
    MarketDataSnapshot,
    MethodologyReference,
    PortfolioAllocation,
    ReserveBackingSummary,
    RecommendationReason,
    ReanalysisDiff,
    RwaIntakeContext,
    SourceProvenanceRef,
    StressScenario,
    TxDraft,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnalysisMode(str, Enum):
    SINGLE_DECISION = "single_decision"
    MULTI_OPTION = "multi_option"


class SessionStatus(str, Enum):
    INIT = "INIT"
    CLARIFYING = "CLARIFYING"
    ANALYZING = "ANALYZING"
    READY_FOR_REPORT = "READY_FOR_REPORT"
    REPORTING = "REPORTING"
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
    clarification_questions: list[ClarificationQuestion] = Field(default_factory=list)
    answers: list[UserAnswer] = Field(default_factory=list)
    search_tasks: list[SearchTask] = Field(default_factory=list)
    calculation_tasks: list[CalculationTask] = Field(default_factory=list)
    chart_tasks: list[ChartTask] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    chart_artifacts: list[ChartArtifact] = Field(default_factory=list)
    major_conclusions: list[MajorConclusionItem] = Field(default_factory=list)
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
        self.updated_at = utcnow()
