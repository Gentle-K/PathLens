"""Dedicated RWA API routes.

These endpoints provide direct access to the RWA analysis pipeline without
going through the generic session orchestrator.  They are additive — they
do NOT replace or modify the existing session-based routes in ``routes.py``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Response

from app.api.routes import assert_session_owner, ensure_client_cookie
from app.bootstrap import get_app_services
from app.config import Settings
from app.domain.models import AnalysisMode, EvidenceItem
from app.domain.rwa import (
    ExecutionReadiness,
    LiquidityNeed,
    RiskTolerance,
    RwaIntakeContext,
    TransactionReceiptRecord,
    TransactionStatus,
)
from app.domain.schemas import (
    DebugOperationReceiptResponse,
    RwaAssetProofResponse,
    RwaAssetProofAnchorHistoryResponse,
    RwaAssetProofHistoryResponse,
    RwaAssetPlanHistoryResponse,
    RwaAssetReadinessResponse,
    EligibleCatalogBucketItem,
    EligibleCatalogResponse,
    RwaExecutionReceiptListResponse,
    RwaExecutionReceiptResponse,
    RwaExecuteSubmitRequest,
    RwaExecuteSubmitResponse,
    RwaExecuteRequest,
    RwaExecuteResponse,
    RwaAnalyzeResponse,
    RwaCatalogResponse,
    RwaClarifyRequest,
    RwaClarifyResponse,
    RwaComparisonRequest,
    RwaMonitorResponse,
    RwaIndexerStatusResponse,
    RwaOpsJobsResponse,
    RwaOpsSummaryResponse,
    RwaPortfolioAlertStateResponse,
    RwaPortfolioAlertsResponse,
    RwaPortfolioResponse,
    RwaQuoteRequest,
    RwaQuoteResponse,
    RwaSimulateRequest,
    RwaSimulateResponse,
    SessionResponse,
)
from app.i18n import normalize_locale
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.demo import build_demo_scenarios
from app.rwa.engine import (
    build_rwa_report,
    estimate_net_return_after_fees,
    simulate_multi_horizon,
)
from app.rwa.explorer_service import chain_id_for, tx_url

logger = logging.getLogger(__name__)

rwa_router = APIRouter(prefix="/api/rwa", tags=["rwa"])


def _resolve_locale(request: Request) -> str:
    return normalize_locale(
        request.headers.get("x-app-locale")
        or request.headers.get("accept-language")
        or "zh"
    )


def _tolerance_enum(value: str) -> RiskTolerance:
    try:
        return RiskTolerance(value)
    except ValueError:
        return RiskTolerance.BALANCED


def _liquidity_enum(value: str) -> LiquidityNeed:
    try:
        return LiquidityNeed(value)
    except ValueError:
        return LiquidityNeed.T_PLUS_3


def _load_owned_session(session_id: str, request: Request, response: Response):
    services = get_app_services()
    client_id = ensure_client_cookie(request, response)
    session = services.session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    assert_session_owner(SessionResponse.model_validate(session), client_id)
    return services, session


def _resolved_network(network: str, chain_config) -> str:
    normalized = (network or chain_config.default_execution_network or "testnet").strip().lower()
    return "mainnet" if normalized == "mainnet" else "testnet"


@rwa_router.get("/catalog", response_model=RwaCatalogResponse)
def get_rwa_catalog(request: Request) -> RwaCatalogResponse:
    """Return the full RWA asset library and chain config."""
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    demo_scenarios = build_demo_scenarios(locale=locale)
    return RwaCatalogResponse(
        assets=assets,
        asset_types=sorted({a.asset_type.value for a in assets}),
        chain_config=chain_config,
        demo_scenarios=demo_scenarios,
    )


def _find_asset_or_404(services, assets, asset_id: str):
    asset = services.execution_service.resolve_asset(assets, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return asset


@rwa_router.get("/assets/{asset_id}/proof", response_model=RwaAssetProofResponse)
def get_asset_proof(
    asset_id: str,
    request: Request,
    network: str = "",
) -> RwaAssetProofResponse:
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    asset = _find_asset_or_404(services, assets, asset_id)
    resolved_network = _resolved_network(network, chain_config)
    latest_proof, proof_timeline_preview = services.proof_service.latest_with_timeline(
        asset,
        chain_config,
        network=resolved_network,
    )
    indexed_history = services.chain_indexer_service.list_asset_proof_history(
        asset_id=asset_id,
        network=resolved_network,
    )
    indexed_by_hash = {item.snapshot_hash: item for item in indexed_history}
    latest_proof = services.chain_indexer_service.attach_indexed_anchor(
        snapshot=latest_proof,
        chain_config=chain_config,
    )
    for item in proof_timeline_preview:
        indexed_event = indexed_by_hash.get(item.snapshot_hash)
        if indexed_event is None:
            continue
        item.onchain_indexed = True
        item.indexed_at = indexed_event.indexed_at
        item.onchain_anchor_status = latest_proof.indexed_anchor_status or latest_proof.anchor_status
    return RwaAssetProofResponse(
        asset=asset,
        proof=latest_proof,
        latest_proof=latest_proof,
        onchain_anchor_status=latest_proof.indexed_anchor_status or latest_proof.anchor_status,
        proof_timeline_preview=proof_timeline_preview,
    )


@rwa_router.get("/assets/{asset_id}/proof/history", response_model=RwaAssetProofHistoryResponse)
def get_asset_proof_history(
    asset_id: str,
    request: Request,
    network: str = "",
) -> RwaAssetProofHistoryResponse:
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    _find_asset_or_404(services, assets, asset_id)
    resolved_network = _resolved_network(network, chain_config)
    history = services.proof_service.list_proof_history(
        asset_id=asset_id,
        network=resolved_network,
    )
    indexed_history = services.chain_indexer_service.list_asset_proof_history(
        asset_id=asset_id,
        network=resolved_network,
    )
    indexed_by_hash = {item.snapshot_hash: item for item in indexed_history}
    latest_indexed = services.chain_indexer_service.latest_asset_proof(
        asset_id=asset_id,
        network=resolved_network,
    )
    for item in history:
        indexed_event = indexed_by_hash.get(item.snapshot_hash)
        if indexed_event is None:
            continue
        item.onchain_indexed = True
        item.indexed_at = indexed_event.indexed_at
        item.onchain_anchor_status.proof_key = indexed_event.proof_key
        item.onchain_anchor_status.transaction_hash = indexed_event.transaction_hash
        item.onchain_anchor_status.block_number = indexed_event.block_number
        item.onchain_anchor_status.attester = indexed_event.attester
        item.onchain_anchor_status.registry_address = indexed_event.contract_address
        item.onchain_anchor_status.status = "indexed"
    return RwaAssetProofHistoryResponse(
        asset_id=asset_id,
        network=resolved_network,
        history=history,
        history_source="indexer" if latest_indexed is not None else "repository",
    )


@rwa_router.get(
    "/assets/{asset_id}/proof/anchor-history",
    response_model=RwaAssetProofAnchorHistoryResponse,
)
def get_asset_proof_anchor_history(
    asset_id: str,
    request: Request,
    network: str = "",
) -> RwaAssetProofAnchorHistoryResponse:
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    _find_asset_or_404(services, assets, asset_id)
    resolved_network = _resolved_network(network, chain_config)
    history = services.chain_indexer_service.list_asset_proof_history(
        asset_id=asset_id,
        network=resolved_network,
    )
    return RwaAssetProofAnchorHistoryResponse(
        asset_id=asset_id,
        network=resolved_network,
        history=history,
    )


@rwa_router.get("/assets/{asset_id}/plan-history", response_model=RwaAssetPlanHistoryResponse)
def get_asset_plan_history(
    asset_id: str,
    request: Request,
    network: str = "",
) -> RwaAssetPlanHistoryResponse:
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    _find_asset_or_404(services, assets, asset_id)
    resolved_network = _resolved_network(network, chain_config)
    history = services.chain_indexer_service.list_plan_history(
        asset_id=asset_id,
        network=resolved_network,
    )
    return RwaAssetPlanHistoryResponse(
        asset_id=asset_id,
        network=resolved_network,
        history=history,
    )


@rwa_router.get("/indexer/status", response_model=RwaIndexerStatusResponse)
def get_rwa_indexer_status(request: Request) -> RwaIndexerStatusResponse:
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    return RwaIndexerStatusResponse(
        status=services.chain_indexer_service.status_snapshot(chain_config=chain_config)
    )


@rwa_router.get("/assets/{asset_id}/readiness", response_model=RwaAssetReadinessResponse)
def get_asset_readiness(
    asset_id: str,
    request: Request,
    response: Response,
    address: str = "",
    session_id: str = "",
    network: str = "",
    amount: float = 0.0,
    source_asset: str = "",
    source_chain: str = "",
) -> RwaAssetReadinessResponse:
    services = get_app_services()
    ensure_client_cookie(request, response)
    session = None
    if session_id:
        services, session = _load_owned_session(session_id, request, response)

    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    asset = _find_asset_or_404(services, assets, asset_id)
    resolved_network = _resolved_network(network, chain_config)
    wallet_kyc_level = None

    if address:
        resolved_network, _balances, kyc, _safe_detected, _synced_at = services.wallet_service.build_wallet_summary(
            address=address,
            chain_config=chain_config,
            assets=assets,
            network=resolved_network,
        )
        wallet_kyc_level = kyc.level

    ticket_size = (
        amount
        or (session.ticket_size if session and session.ticket_size is not None else 0.0)
        or (session.intake_context.ticket_size if session else 0.0)
        or asset.minimum_ticket_usd
        or 0.0
    )
    decision = services.eligibility_service.evaluate_asset(
        asset,
        kyc_level=wallet_kyc_level or (session.kyc_level if session else None),
        investor_type=(session.investor_type if session else ""),
        jurisdiction=(session.jurisdiction if session else ""),
        ticket_size=ticket_size,
        source_asset=source_asset or (session.source_asset if session else ""),
        source_chain=source_chain or (session.source_chain if session else resolved_network),
    )
    proof = services.proof_service.build_asset_proof(
        asset,
        chain_config,
        network=resolved_network,
    )

    quote = None
    required_approvals = []
    possible_failure_reasons: list[str] = []
    compliance_blockers = list(decision.reasons + decision.missing_requirements) if decision.status.value == "blocked" else []
    warnings = list(asset.action_blocker_reasons)

    if ticket_size > 0 and proof.execution_readiness != ExecutionReadiness.VIEW_ONLY:
        quote = services.execution_service.build_quote(
            assets=assets,
            source_asset=source_asset or asset.settlement_asset,
            target_asset=asset.asset_id,
            amount=ticket_size,
            source_chain=source_chain or resolved_network,
        )
        required_approvals, possible_failure_reasons, extra_blockers, warnings = services.execution_service.simulate_execution(
            target=asset,
            quote=quote,
            decision=decision,
        )
        compliance_blockers.extend(extra_blockers)

    route_summary = (
        "Direct onchain contract route is available."
        if proof.execution_readiness == ExecutionReadiness.READY
        else (
            "Wallet and KYC checks pass, but settlement still depends on issuer workflow."
            if proof.execution_readiness == ExecutionReadiness.REQUIRES_ISSUER
            else (
                "Asset is visible for verification but blocked from live execution."
                if proof.execution_readiness == ExecutionReadiness.VIEW_ONLY
                else "Current eligibility or asset state blocks execution."
            )
        )
    )

    return RwaAssetReadinessResponse(
        asset=asset,
        proof=proof,
        decision=decision,
        execution_adapter_kind=proof.execution_adapter_kind,
        execution_readiness=proof.execution_readiness,
        route_summary=route_summary,
        quote=quote,
        required_approvals=required_approvals,
        possible_failure_reasons=possible_failure_reasons,
        compliance_blockers=compliance_blockers,
        warnings=warnings,
    )


@rwa_router.post("/analyze", response_model=RwaAnalyzeResponse)
def analyze_rwa(
    payload: RwaComparisonRequest,
    request: Request,
) -> RwaAnalyzeResponse:
    """Run the full RWA comparison and allocation pipeline.

    This endpoint performs scoring, simulation, allocation, evidence
    collection, and report generation in a single call.
    """
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = payload.locale or _resolve_locale(request)
    asset_library = build_asset_library(chain_config, locale=locale)

    context = RwaIntakeContext(
        investment_amount=payload.investment_amount,
        base_currency=payload.base_currency,
        preferred_asset_ids=payload.preferred_asset_ids,
        holding_period_days=payload.holding_period_days,
        risk_tolerance=_tolerance_enum(payload.risk_tolerance),
        liquidity_need=_liquidity_enum(payload.liquidity_need),
        minimum_kyc_level=payload.minimum_kyc_level,
        wallet_address=payload.wallet_address,
        wallet_network=payload.wallet_network,
        include_non_production_assets=payload.include_non_production_assets,
        demo_mode=payload.demo_mode,
        demo_scenario_id=payload.demo_scenario_id,
        analysis_seed=payload.analysis_seed,
    )

    report, evidence = build_rwa_report(
        mode=AnalysisMode.MULTI_OPTION,
        problem_statement=payload.problem_statement,
        context=context,
        chain_config=chain_config,
        asset_library=asset_library,
        locale=locale,
    )

    # Collect additional external evidence if requested
    evidence_items = [
        EvidenceItem(
            asset_id=e.asset_id,
            title=e.title,
            source_url=e.source_url,
            source_name=e.source_name,
            source_tag=e.source_tag if hasattr(e, "source_tag") else "",
            fetched_at=e.fetched_at,
            summary=e.summary,
            extracted_facts=e.extracted_facts,
            confidence=e.confidence,
            fact_type=e.fact_type,
            freshness=e.freshness,
            conflict_keys=e.conflict_keys,
        )
        for e in evidence
    ]

    if payload.include_defi_llama_evidence:
        try:
            from app.rwa.evidence import fetch_defi_llama_evidence
            llama_evidence = fetch_defi_llama_evidence(chain="HashKey", limit=5)
            for item in llama_evidence:
                evidence_items.append(
                    EvidenceItem(
                        title=item.title,
                        source_url=item.source_url,
                        source_name=item.source_name,
                        source_tag=item.source_tag.value if item.source_tag else "",
                        fetched_at=item.fetched_at,
                        summary=item.summary,
                        extracted_facts=item.extracted_facts,
                        confidence=item.confidence,
                    )
                )
        except Exception as exc:
            logger.warning("DeFi Llama evidence fetch failed: %s", exc)

    # Multi-horizon simulations
    multi_horizon: dict[str, list] = {}
    if payload.include_multi_horizon and report.asset_cards:
        asset_lookup = {a.asset_id: a for a in asset_library}
        for card in report.asset_cards:
            asset = asset_lookup.get(card.asset_id)
            if asset:
                sims = simulate_multi_horizon(
                    asset,
                    payload.investment_amount,
                    locale=locale,
                    analysis_seed=payload.analysis_seed,
                )
                multi_horizon[card.asset_id] = [
                    sim.model_dump(mode="json") for sim in sims
                ]

    return RwaAnalyzeResponse(
        report=report,
        evidence=evidence_items,
        multi_horizon_simulations=multi_horizon,
    )


@rwa_router.post("/clarify", response_model=RwaClarifyResponse)
def clarify_rwa(
    payload: RwaClarifyRequest,
    request: Request,
) -> RwaClarifyResponse:
    """Return structured clarification questions for an RWA query.

    This helps the frontend ask the right follow-up questions before
    running the full analysis pipeline.
    """
    from app.domain.models import ClarificationQuestion
    from app.i18n import text_for_locale

    locale = payload.locale or _resolve_locale(request)

    # Generate standard clarification questions based on the problem statement
    questions = [
        ClarificationQuestion(
            question_text=text_for_locale(
                locale,
                "你的投资本金大约是多少？",
                "What is your approximate investment amount?",
            ),
            purpose="Determine investment scale for allocation sizing",
            options=["$1,000", "$10,000", "$50,000", "$100,000+"],
            question_group="intake",
        ),
        ClarificationQuestion(
            question_text=text_for_locale(
                locale,
                "你的预期持有周期是多久？",
                "What is your expected holding period?",
            ),
            purpose="Determine holding horizon for simulation and fee calculation",
            options=[
                text_for_locale(locale, "1-3 个月", "1-3 months"),
                text_for_locale(locale, "3-6 个月", "3-6 months"),
                text_for_locale(locale, "6-12 个月", "6-12 months"),
                text_for_locale(locale, "12 个月以上", "12+ months"),
            ],
            question_group="intake",
        ),
        ClarificationQuestion(
            question_text=text_for_locale(
                locale,
                "你的风险偏好是什么？",
                "What is your risk tolerance?",
            ),
            purpose="Determine risk filtering threshold and allocation bias",
            options=[
                text_for_locale(locale, "保守 — 优先保本", "Conservative — capital preservation first"),
                text_for_locale(locale, "均衡 — 平衡收益与风险", "Balanced — balance return and risk"),
                text_for_locale(locale, "进取 — 追求更高收益", "Aggressive — seeking higher returns"),
            ],
            question_group="risk",
        ),
        ClarificationQuestion(
            question_text=text_for_locale(
                locale,
                "你对流动性的需求是什么？",
                "What is your liquidity requirement?",
            ),
            purpose="Determine liquidity penalty for illiquid assets",
            options=[
                text_for_locale(locale, "随时可退出 (T+0)", "Instant exit (T+0)"),
                text_for_locale(locale, "几天内可退出 (T+3)", "Exit within days (T+3)"),
                text_for_locale(locale, "可以接受锁定期", "Accept lockup periods"),
            ],
            question_group="liquidity",
        ),
        ClarificationQuestion(
            question_text=text_for_locale(
                locale,
                "你目前的 KYC 认证等级是？",
                "What is your current KYC verification level?",
            ),
            purpose="Determine which assets are accessible given KYC gating",
            options=[
                text_for_locale(locale, "无 KYC (L0)", "No KYC (L0)"),
                text_for_locale(locale, "基础 KYC (L1)", "Basic KYC (L1)"),
                text_for_locale(locale, "专业投资者 (L2+)", "Professional investor (L2+)"),
            ],
            question_group="access",
        ),
    ]

    return RwaClarifyResponse(questions=questions)


@rwa_router.get("/eligible-catalog", response_model=EligibleCatalogResponse)
def get_eligible_catalog(
    address: str,
    request: Request,
    response: Response,
    session_id: str = "",
    network: str = "",
) -> EligibleCatalogResponse:
    services = get_app_services()
    ensure_client_cookie(request, response)
    session = None
    if session_id:
        services, session = _load_owned_session(session_id, request, response)

    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    resolved_network, _balances, kyc, _safe_detected, synced_at = services.wallet_service.build_wallet_summary(
        address=address,
        chain_config=chain_config,
        assets=assets,
        network=network,
    )

    evaluated = services.eligibility_service.evaluate_catalog(
        assets,
        kyc_snapshot=kyc,
        kyc_level=(session.kyc_level if session else None),
        investor_type=(session.investor_type if session else ""),
        jurisdiction=(session.jurisdiction if session else ""),
        ticket_size=(
            session.ticket_size
            if session and session.ticket_size is not None
            else (session.intake_context.ticket_size if session else 0.0) or 0.0
        ),
        source_asset=(session.source_asset if session else ""),
        source_chain=(session.source_chain if session else resolved_network),
    )
    eligible: list[EligibleCatalogBucketItem] = []
    conditional: list[EligibleCatalogBucketItem] = []
    blocked: list[EligibleCatalogBucketItem] = []
    decisions = []

    for asset, decision in evaluated:
        decisions.append(decision)
        item = EligibleCatalogBucketItem(asset=asset, decision=decision)
        if decision.status.value == "eligible":
            eligible.append(item)
        elif decision.status.value == "conditional":
            conditional.append(item)
        else:
            blocked.append(item)

    if session is not None:
        session.wallet_address = address
        session.kyc_level = kyc.level
        session.kyc_status = kyc.status.value
        session.source_chain = session.source_chain or resolved_network
        session.eligibility_decisions = decisions
        session.last_onchain_sync_at = synced_at
        services.session_service.repository.save(session)

    return EligibleCatalogResponse(
        address=address,
        session_id=session_id,
        eligible=eligible,
        conditional=conditional,
        blocked=blocked,
    )


@rwa_router.post("/quote", response_model=RwaQuoteResponse)
def quote_rwa(
    payload: RwaQuoteRequest,
    request: Request,
    response: Response,
) -> RwaQuoteResponse:
    services = get_app_services()
    ensure_client_cookie(request, response)
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    quote = services.execution_service.build_quote(
        assets=assets,
        source_asset=payload.source_asset,
        target_asset=payload.target_asset,
        amount=payload.amount,
        source_chain=payload.source_chain,
    )
    return RwaQuoteResponse(quote=quote)


@rwa_router.post("/simulate", response_model=RwaSimulateResponse)
def simulate_rwa(
    payload: RwaSimulateRequest,
    request: Request,
    response: Response,
) -> RwaSimulateResponse:
    services = get_app_services()
    ensure_client_cookie(request, response)
    session = None
    if payload.session_id:
        services, session = _load_owned_session(payload.session_id, request, response)

    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    target = services.execution_service.resolve_asset(assets, payload.target_asset)
    if target is None:
        raise HTTPException(status_code=404, detail="Target asset not found.")
    quote = services.execution_service.build_quote(
        assets=assets,
        source_asset=payload.source_asset,
        target_asset=payload.target_asset,
        amount=payload.amount,
        source_chain=payload.source_chain,
    )
    decision = services.eligibility_service.evaluate_asset(
        target,
        kyc_level=(session.kyc_level if session else None),
        investor_type=(session.investor_type if session else ""),
        jurisdiction=(session.jurisdiction if session else ""),
        ticket_size=payload.amount,
        source_asset=payload.source_asset,
        source_chain=payload.source_chain,
    )
    approvals, possible_failure_reasons, compliance_blockers, warnings = services.execution_service.simulate_execution(
        target=target,
        quote=quote,
        decision=decision,
    )
    return RwaSimulateResponse(
        quote=quote,
        required_approvals=[approval.model_dump(mode="json") for approval in approvals],
        possible_failure_reasons=possible_failure_reasons,
        compliance_blockers=compliance_blockers,
        warnings=warnings,
    )


@rwa_router.post("/execute", response_model=RwaExecuteResponse)
def execute_rwa(
    payload: RwaExecuteRequest,
    request: Request,
    response: Response,
) -> RwaExecuteResponse:
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for execution writeback.")

    services, session = _load_owned_session(payload.session_id, request, response)
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    plan = services.execution_service.prepare_execution(
        session=session,
        chain_config=chain_config,
        assets=assets,
        target_asset_key=payload.target_asset,
        amount=payload.amount,
        source_asset=payload.source_asset,
        source_chain=payload.source_chain,
        include_attestation=payload.include_attestation,
    )

    if session.report and session.report.attestation_draft is not None:
        session.report.attestation_draft.evidence_hash = services.execution_service.compute_evidence_hash(session)
        session.report.attestation_draft.execution_plan_hash = plan.plan_hash
        services.session_service.repository.save(session)

    updated = services.session_service.record_execution_plan(payload.session_id, plan)
    if updated is None:
        raise HTTPException(status_code=400, detail="Unable to store execution plan.")
    return RwaExecuteResponse(
        execution_plan=plan,
        prepare_summary=plan.readiness_reason,
        checklist=list(plan.checklist),
        blockers=list(plan.compliance_blockers),
        tx_receipts=updated.transaction_receipts,
        report_anchor_records=updated.report_anchor_records,
    )


@rwa_router.post("/execute/prepare", response_model=RwaExecuteResponse)
def prepare_rwa_execution(
    payload: RwaExecuteRequest,
    request: Request,
    response: Response,
) -> RwaExecuteResponse:
    return execute_rwa(payload, request, response)


@rwa_router.post("/execute/submit", response_model=RwaExecuteSubmitResponse)
def submit_rwa_execution(
    payload: RwaExecuteSubmitRequest,
    request: Request,
    response: Response,
) -> RwaExecuteSubmitResponse:
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for execution submission.")

    services, session = _load_owned_session(payload.session_id, request, response)
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    try:
        plan, receipt, issuer_request = services.execution_service.submit_execution(
            session=session,
            chain_config=chain_config,
            assets=assets,
            target_asset_key=payload.target_asset,
            amount=payload.amount,
            source_asset=payload.source_asset,
            source_chain=payload.source_chain,
            include_attestation=payload.include_attestation,
            network=payload.network,
            transaction_hash=payload.transaction_hash,
            submitted_by=payload.submitted_by,
            block_number=payload.block_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    updated = services.session_service.record_execution_plan(payload.session_id, plan)
    if updated is None:
        raise HTTPException(status_code=400, detail="Unable to store execution plan.")

    resolved_network = _resolved_network(payload.network, chain_config)
    if payload.transaction_hash:
        asset_step = next(
            (step for step in plan.steps if step.step_type == "asset_execution"),
            None,
        )
        tx_receipt = TransactionReceiptRecord(
            tx_hash=payload.transaction_hash,
            tx_status=(
                TransactionStatus.CONFIRMED
                if payload.block_number is not None
                else TransactionStatus.SUBMITTED
            ),
            block_number=payload.block_number,
            chain_id=chain_id_for(chain_config, resolved_network),
            executed_at=session.updated_at,
            wallet_address=payload.submitted_by or session.wallet_address,
            safe_address=session.safe_address,
            related_execution_step_id=asset_step.execution_step_id if asset_step else "",
            explorer_url=tx_url(chain_config, resolved_network, payload.transaction_hash),
            receipt_payload={"note": payload.note or "Recorded via /api/rwa/execute/submit."},
        )
        updated = services.session_service.record_transaction_receipt(payload.session_id, tx_receipt)

    submission_status = receipt.status.value
    submission_message = (
        "Direct contract tx request is ready for wallet submission."
        if receipt.status.value == "prepared" and receipt.adapter_kind.value == "direct_contract"
        else (
            "Issuer workflow has been created and needs external completion."
            if receipt.status.value == "redirect_required"
            else (
                "Execution was submitted and receipt tracking is active."
                if receipt.status.value == "submitted"
                else (
                    "Execution completed and settlement state was updated."
                    if receipt.status.value == "completed"
                    else "Execution receipt was updated."
                )
            )
        )
    )

    return RwaExecuteSubmitResponse(
        execution_plan=plan,
        receipt=receipt,
        allowance_steps=list(plan.required_approvals),
        issuer_request_id=issuer_request.request_id if issuer_request is not None else "",
        redirect_url=receipt.redirect_url,
        tx_receipts=updated.transaction_receipts if updated is not None else [],
        report_anchor_records=updated.report_anchor_records if updated is not None else [],
        submission_status=submission_status,
        submission_message=submission_message,
        external_action_url=plan.external_action_url,
    )


@rwa_router.get("/execution/receipts/{receipt_id}", response_model=RwaExecutionReceiptResponse)
def get_execution_receipt(receipt_id: str) -> RwaExecutionReceiptResponse:
    services = get_app_services()
    receipt = services.execution_receipts_service.get_receipt(receipt_id)
    if receipt is None:
        raise HTTPException(status_code=404, detail="Execution receipt not found.")
    return RwaExecutionReceiptResponse(receipt=receipt)


@rwa_router.get("/execution/receipts", response_model=RwaExecutionReceiptListResponse)
def list_execution_receipts(session_id: str = "", asset_id: str = "") -> RwaExecutionReceiptListResponse:
    services = get_app_services()
    return RwaExecutionReceiptListResponse(
        receipts=services.execution_receipts_service.list_receipts(
            session_id=session_id,
            asset_id=asset_id,
        )
    )


@rwa_router.get("/monitor", response_model=RwaMonitorResponse)
def monitor_rwa(
    session_id: str,
    request: Request,
    response: Response,
) -> RwaMonitorResponse:
    services, session = _load_owned_session(session_id, request, response)
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    snapshots, metrics = services.monitoring_service.build_monitoring_snapshot(
        session=session,
        chain_config=chain_config,
        assets=assets,
    )
    receipt_records = services.execution_receipts_service.list_receipts(session_id=session_id)
    proof_snapshots = [
        services.proof_service.build_asset_proof(
            asset,
            chain_config,
            network=_resolved_network(session.source_chain or session.intake_context.source_chain, chain_config),
        )
        for asset in assets
        if any(snapshot.asset_id == asset.asset_id for snapshot in snapshots)
    ]
    portfolio_alerts = services.monitoring_scheduler_service.run_for_session(
        session_id=session_id,
        address=session.safe_address or session.wallet_address,
        proof_snapshots=proof_snapshots,
        positions=snapshots,
        receipts=receipt_records,
        kyc_change_flag=bool(metrics["kyc_change_flag"]),
    )
    services.session_service.sync_position_snapshots(session_id, snapshots)
    proof_staleness_flag = any(alert.alert_type == "proof_expired" for alert in portfolio_alerts)
    issuer_disclosure_update_flag = any(
        alert.alert_type == "issuer_disclosure_updated" for alert in portfolio_alerts
    )
    alert_flags = list(metrics["alert_flags"])
    if proof_staleness_flag:
        alert_flags.append("proof_expired")
    if issuer_disclosure_update_flag:
        alert_flags.append("issuer_disclosure_updated")
    return RwaMonitorResponse(
        session_id=session_id,
        position_snapshots=snapshots,
        current_balance=float(metrics["current_balance"]),
        latest_nav_or_price=float(metrics["latest_nav_or_price"]),
        cost_basis=float(metrics["cost_basis"]),
        unrealized_pnl=float(metrics["unrealized_pnl"]),
        realized_income=float(metrics["realized_income"]),
        accrued_yield=float(metrics["accrued_yield"]),
        redemption_forecast=float(metrics["redemption_forecast"]),
        allocation_mix=dict(metrics["allocation_mix"]),
        next_redemption_window=str(metrics["next_redemption_window"]),
        oracle_staleness_flag=bool(metrics["oracle_staleness_flag"]),
        kyc_change_flag=bool(metrics["kyc_change_flag"]),
        proof_staleness_flag=proof_staleness_flag,
        issuer_disclosure_update_flag=issuer_disclosure_update_flag,
        alert_flags=alert_flags,
        portfolio_alerts=portfolio_alerts,
    )


@rwa_router.get("/portfolio/{address}", response_model=RwaPortfolioResponse)
def get_portfolio(
    address: str,
    request: Request,
    response: Response,
    network: str = "",
) -> RwaPortfolioResponse:
    services = get_app_services()
    ensure_client_cookie(request, response)
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    resolved_network, positions, synced_at = services.wallet_service.build_wallet_positions(
        address=address,
        chain_config=chain_config,
        assets=assets,
        network=network,
    )
    proof_snapshots = [
        services.chain_indexer_service.attach_indexed_anchor(
            snapshot=services.proof_service.build_asset_proof(asset, chain_config, network=resolved_network),
            chain_config=chain_config,
        )
        for asset in assets
        if any(position.asset_id == asset.asset_id for position in positions)
    ]
    receipt_records = [
        receipt
        for receipt in services.execution_receipts_service.list_receipts()
        if address in {receipt.wallet_address, receipt.safe_address}
    ]
    alerts = services.monitoring_scheduler_service.run_for_portfolio(
        address=address,
        proof_snapshots=proof_snapshots,
        positions=positions,
        receipts=receipt_records,
    )
    ops_summary = services.rwa_ops_service.build_summary(
        assets=assets,
        chain_config=chain_config,
        network=resolved_network,
    )
    position_asset_ids = {position.asset_id for position in positions}
    return RwaPortfolioResponse(
        address=address,
        network=resolved_network,
        positions=positions,
        proof_snapshots=proof_snapshots,
        alerts=alerts,
        indexer_health=ops_summary.indexer_health,
        latest_anchor_summary=[
            item for item in ops_summary.contract_anchors if item.asset_id in position_asset_ids
        ],
        total_value_usd=round(sum(position.current_value for position in positions), 6),
        total_cost_basis=round(sum(position.cost_basis for position in positions), 6),
        total_unrealized_pnl=round(sum(position.unrealized_pnl for position in positions), 6),
        total_realized_income=round(sum(position.realized_income for position in positions), 6),
        total_accrued_yield=round(sum(position.accrued_yield for position in positions), 6),
        total_redemption_forecast=round(sum(position.redemption_forecast for position in positions), 6),
        allocation_mix={position.asset_id: position.allocation_weight_pct for position in positions},
        last_sync_at=synced_at.isoformat(),
    )


@rwa_router.get("/portfolio/{address}/alerts", response_model=RwaPortfolioAlertsResponse)
def get_portfolio_alerts(
    address: str,
    request: Request,
    response: Response,
    network: str = "",
) -> RwaPortfolioAlertsResponse:
    portfolio = get_portfolio(address=address, request=request, response=response, network=network)
    return RwaPortfolioAlertsResponse(
        address=portfolio.address,
        network=portfolio.network,
        alerts=portfolio.alerts,
    )


@rwa_router.post("/portfolio/{address}/alerts/{alert_id}/ack", response_model=RwaPortfolioAlertStateResponse)
def ack_portfolio_alert(address: str, alert_id: str) -> RwaPortfolioAlertStateResponse:
    services = get_app_services()
    state = services.portfolio_alerts_service.ack_alert(address=address, alert_id=alert_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return RwaPortfolioAlertStateResponse(state=state)


@rwa_router.post("/portfolio/{address}/alerts/{alert_id}/read", response_model=RwaPortfolioAlertStateResponse)
def read_portfolio_alert(address: str, alert_id: str) -> RwaPortfolioAlertStateResponse:
    services = get_app_services()
    state = services.portfolio_alerts_service.read_alert(address=address, alert_id=alert_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return RwaPortfolioAlertStateResponse(state=state)
