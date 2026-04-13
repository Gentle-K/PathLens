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
    LiquidityNeed,
    RiskTolerance,
    RwaIntakeContext,
)
from app.domain.schemas import (
    EligibleCatalogBucketItem,
    EligibleCatalogResponse,
    RwaExecuteRequest,
    RwaExecuteResponse,
    RwaAnalyzeResponse,
    RwaCatalogResponse,
    RwaClarifyRequest,
    RwaClarifyResponse,
    RwaComparisonRequest,
    RwaMonitorResponse,
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
    plan = services.execution_service.build_execution_plan(
        session=session,
        chain_config=chain_config,
        assets=assets,
        target_asset_key=payload.target_asset,
        amount=payload.amount,
        source_asset=payload.source_asset,
        source_chain=payload.source_chain,
        include_attestation=payload.include_attestation,
        generate_only=payload.generate_only,
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
        tx_receipts=updated.transaction_receipts,
        report_anchor_records=updated.report_anchor_records,
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
    services.session_service.sync_position_snapshots(session_id, snapshots)
    return RwaMonitorResponse(
        session_id=session_id,
        position_snapshots=snapshots,
        current_balance=float(metrics["current_balance"]),
        latest_nav_or_price=float(metrics["latest_nav_or_price"]),
        cost_basis=float(metrics["cost_basis"]),
        unrealized_pnl=float(metrics["unrealized_pnl"]),
        accrued_yield=float(metrics["accrued_yield"]),
        next_redemption_window=str(metrics["next_redemption_window"]),
        oracle_staleness_flag=bool(metrics["oracle_staleness_flag"]),
        kyc_change_flag=bool(metrics["kyc_change_flag"]),
        alert_flags=list(metrics["alert_flags"]),
    )
