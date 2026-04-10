"""Dedicated RWA API routes.

These endpoints provide direct access to the RWA analysis pipeline without
going through the generic session orchestrator.  They are additive — they
do NOT replace or modify the existing session-based routes in ``routes.py``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.config import Settings
from app.domain.models import AnalysisMode, EvidenceItem
from app.domain.rwa import (
    LiquidityNeed,
    RiskTolerance,
    RwaIntakeContext,
)
from app.domain.schemas import (
    RwaAnalyzeResponse,
    RwaCatalogResponse,
    RwaClarifyRequest,
    RwaClarifyResponse,
    RwaComparisonRequest,
)
from app.i18n import normalize_locale
from app.rwa.catalog import build_asset_library, build_chain_config
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


@rwa_router.get("/catalog", response_model=RwaCatalogResponse)
def get_rwa_catalog(request: Request) -> RwaCatalogResponse:
    """Return the full RWA asset library and chain config."""
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    locale = _resolve_locale(request)
    assets = build_asset_library(chain_config, locale=locale)
    return RwaCatalogResponse(
        assets=assets,
        asset_types=sorted({a.asset_type.value for a in assets}),
        chain_config=chain_config,
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
            title=e.title,
            source_url=e.source_url,
            source_name=e.source_name,
            source_tag=e.source_tag if hasattr(e, "source_tag") else "",
            summary=e.summary,
            extracted_facts=e.extracted_facts,
            confidence=e.confidence,
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
