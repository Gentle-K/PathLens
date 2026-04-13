from __future__ import annotations

import hashlib
import json
import math
import random
from datetime import datetime, timezone
from statistics import mean
from typing import Iterable
from urllib.parse import urlparse

import logging

from app.domain.models import AnalysisMode, AnalysisReport, EvidenceItem, OptionProfile, ReportTable
from app.domain.rwa import (
    ActionBlocker,
    ActionIntent,
    ActionReadiness,
    ActionType,
    AssetAnalysisCard,
    AssetStatus,
    AssetTemplate,
    AssetType,
    AttestationDraft,
    ComparisonMatrix,
    ComparisonMatrixCell,
    ComparisonMatrixMetric,
    ComparisonMatrixRow,
    ConstraintImpact,
    DataSourceTag,
    EvidenceFactType,
    ExcludedAssetReason,
    HashKeyChainConfig,
    HoldingPeriodSimulation,
    EligibilityDecision,
    ExecutionLifecycleStatus,
    ExecutionPlan,
    ExecutionQuote,
    ExecutionStep,
    KycOnchainResult,
    LiquidityNeed,
    LiveReadiness,
    MarketDataSnapshot,
    OracleSnapshot,
    PortfolioAllocation,
    RecommendationDriver,
    RecommendationReason,
    RiskTolerance,
    RiskVector,
    RwaIntakeContext,
    SensitivitySummary,
    SimulationPathPoint,
    TruthLevel,
    TxDraft,
    TxDraftStep,
)
from app.i18n import text_for_locale
from app.rwa.explorer_service import address_url, chain_id_for, oracle_docs_url
from app.rwa.actuary_signals import (
    build_confidence_band,
    build_oracle_stress_score,
    build_reserve_backing_summary,
    build_stress_scenarios,
)
from app.rwa.actuary_source_registry import build_source_provenance_refs
from app.rwa.demo import (
    DEMO_REFERENCE_TIME,
    build_demo_kyc_snapshot,
    build_demo_oracle_snapshots,
    get_demo_scenario,
)
from app.rwa.evidence import build_evidence_governance, enrich_report_evidence
from app.rwa.risk_model import allocation_reason, build_risk_profiles, methodology_references
from app.services.eligibility import EligibilityService

logger = logging.getLogger(__name__)


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def sigmoid01(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * pct
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[int(index)]
    lower_value = ordered[lower]
    upper_value = ordered[upper]
    fraction = index - lower
    return lower_value + (upper_value - lower_value) * fraction


def _asset_type_label(asset_type: AssetType, locale: str) -> str:
    labels = {
        AssetType.STABLECOIN: ("稳定币", "Stablecoin"),
        AssetType.MMF: ("货币基金", "MMF"),
        AssetType.PRECIOUS_METAL: ("贵金属", "Precious metal"),
        AssetType.REAL_ESTATE: ("房地产", "Real estate"),
        AssetType.STOCKS: ("股票", "Stocks"),
        AssetType.BENCHMARK: ("基准", "Benchmark"),
    }
    zh, en = labels.get(asset_type, (asset_type.value, asset_type.value))
    return text_for_locale(locale, zh, en)


def _effective_kyc_level(context: RwaIntakeContext) -> int:
    if context.wallet_address and context.wallet_kyc_level_onchain is not None:
        if context.wallet_kyc_verified is False:
            return 0
        return max(0, context.wallet_kyc_level_onchain)
    return max(0, context.minimum_kyc_level)


def _normalize_network(value: str | None, default: str = "testnet") -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"mainnet", "testnet"}:
        return normalized
    return default


def _network_label(network: str, *, locale: str = "zh") -> str:
    if network == "mainnet":
        return text_for_locale(locale, "HashKey Chain 主网", "HashKey Chain Mainnet")
    return text_for_locale(locale, "HashKey Chain 测试网", "HashKey Chain Testnet")


def _report_network(context: RwaIntakeContext, chain_config: HashKeyChainConfig) -> str:
    return _normalize_network(
        context.wallet_network or chain_config.default_execution_network,
        default="testnet",
    )


def _resolve_attestation_network(
    chain_config: HashKeyChainConfig,
) -> tuple[str, int, str, str]:
    if chain_config.testnet_plan_registry_address:
        return (
            "testnet",
            chain_config.testnet_chain_id,
            chain_config.testnet_plan_registry_address,
            chain_config.testnet_explorer_url,
        )
    if chain_config.mainnet_plan_registry_address:
        return (
            "mainnet",
            chain_config.mainnet_chain_id,
            chain_config.mainnet_plan_registry_address,
            chain_config.mainnet_explorer_url,
        )
    if chain_config.default_execution_network.strip().lower() == "testnet":
        return (
            "testnet",
            chain_config.testnet_chain_id,
            chain_config.testnet_plan_registry_address or chain_config.plan_registry_address,
            chain_config.testnet_explorer_url,
        )
    return (
        "mainnet",
        chain_config.mainnet_chain_id,
        chain_config.mainnet_plan_registry_address or chain_config.plan_registry_address,
        chain_config.mainnet_explorer_url,
    )


def score_risk(asset: AssetTemplate) -> RiskVector:
    fallback_context = RwaIntakeContext(
        investment_amount=max(asset.minimum_ticket_usd, 10_000.0),
        holding_period_days=max(asset.redemption_days or 30, 30),
        risk_tolerance=RiskTolerance.BALANCED,
        liquidity_need=LiquidityNeed.T_PLUS_3,
        minimum_kyc_level=0,
    )
    simulation = simulate_holding(
        asset,
        fallback_context.investment_amount,
        fallback_context.holding_period_days,
        locale="en",
    )
    profile = build_risk_profiles([asset], [simulation], fallback_context)[asset.asset_id]
    return profile.risk_vector


def _checkpoint_days(holding_period_days: int) -> list[int]:
    points = {1, max(1, holding_period_days // 5), max(1, holding_period_days // 2), holding_period_days}
    return sorted(points)


def simulate_holding(
    asset: AssetTemplate,
    investment_amount: float,
    holding_period_days: int,
    *,
    locale: str = "zh",
    analysis_seed: int | None = None,
) -> HoldingPeriodSimulation:
    seed_suffix = f":{analysis_seed}" if analysis_seed is not None else ""
    seed_source = f"{asset.asset_id}:{investment_amount:.2f}:{holding_period_days}{seed_suffix}"
    seed = int(hashlib.sha256(seed_source.encode("utf-8")).hexdigest()[:12], 16)
    rng = random.Random(seed)
    checkpoints = _checkpoint_days(holding_period_days)
    path_snapshots = {day: [] for day in checkpoints}
    ending_values: list[float] = []
    return_series: list[float] = []
    drawdowns: list[float] = []

    for _ in range(280):
        value = investment_amount
        peak = investment_amount
        max_drawdown = 0.0

        for day in range(1, holding_period_days + 1):
            drift = asset.expected_return_base / 365
            volatility = asset.price_volatility / math.sqrt(365)
            daily_return = rng.gauss(drift, volatility)

            if asset.asset_type == AssetType.STABLECOIN:
                daily_return = rng.gauss(drift, max(volatility * 0.12, 0.00025))
                if asset.depeg_events_90d and rng.random() < asset.depeg_events_90d / 1500:
                    daily_return -= rng.uniform(0.002, max((asset.worst_depeg_bps_90d or 30) / 10000, 0.004))
            elif asset.asset_type == AssetType.MMF:
                daily_return = rng.gauss(drift, max(volatility * 0.2, 0.0004))
            elif asset.asset_type == AssetType.REAL_ESTATE:
                daily_return = rng.gauss(drift, max(volatility * 0.55, 0.002))
            elif asset.asset_type == AssetType.PRECIOUS_METAL:
                daily_return = rng.gauss(drift, max(volatility * 0.8, 0.004))

            daily_return -= asset.management_fee_bps / 10000 / 365
            value *= max(0.55, 1 + daily_return)
            peak = max(peak, value)
            max_drawdown = max(max_drawdown, 1 - value / peak)

            if day in path_snapshots:
                path_snapshots[day].append(value)

        value *= max(0.55, 1 - asset.total_cost_bps(holding_period_days) / 10000)
        ending_values.append(value)
        return_series.append(value / investment_amount - 1)
        drawdowns.append(max_drawdown)

    path = [
        SimulationPathPoint(
            day=day,
            p10_value=round(percentile(path_snapshots[day], 0.1), 2),
            p50_value=round(percentile(path_snapshots[day], 0.5), 2),
            p90_value=round(percentile(path_snapshots[day], 0.9), 2),
        )
        for day in checkpoints
    ]

    return HoldingPeriodSimulation(
        asset_id=asset.asset_id,
        asset_name=asset.name,
        holding_period_days=holding_period_days,
        ending_value_low=round(percentile(ending_values, 0.1), 2),
        ending_value_base=round(percentile(ending_values, 0.5), 2),
        ending_value_high=round(percentile(ending_values, 0.9), 2),
        return_pct_low=round(percentile(return_series, 0.1) * 100, 2),
        return_pct_base=round(percentile(return_series, 0.5) * 100, 2),
        return_pct_high=round(percentile(return_series, 0.9) * 100, 2),
        var_95_pct=round(percentile(return_series, 0.05) * 100, 2),
        cvar_95_pct=round(mean(sorted(return_series)[:14]) * 100, 2),
        max_drawdown_low_pct=round(percentile(drawdowns, 0.1) * 100, 2),
        max_drawdown_base_pct=round(percentile(drawdowns, 0.5) * 100, 2),
        max_drawdown_high_pct=round(percentile(drawdowns, 0.9) * 100, 2),
        scenario_note=_simulation_note(asset, locale=locale),
        path=path,
    )


def _simulation_note(asset: AssetTemplate, *, locale: str = "zh") -> str:
    if asset.asset_type == AssetType.STABLECOIN:
        return text_for_locale(
            locale,
            "稳定币场景包含低波动 carry 与小概率脱锚跳变压力测试，不代表价格预测。",
            "The stablecoin scenario includes low-volatility carry and rare depeg-jump stress events and is not a price forecast.",
        )
    if asset.asset_type == AssetType.MMF:
        return text_for_locale(
            locale,
            "MMF 场景强调稳态收益、管理费和申赎摩擦，不把日内交易深度视为核心来源。",
            "The MMF scenario emphasizes steady carry, management fees, and redemption friction rather than intraday trading depth.",
        )
    if asset.asset_type == AssetType.REAL_ESTATE:
        return text_for_locale(
            locale,
            "房地产类场景强调锁定期与退出摩擦，收益分布更依赖结构和条款。",
            "The real-estate scenario emphasizes lockups and exit friction, so return dispersion depends more heavily on structure and terms.",
        )
    return text_for_locale(
        locale,
        "场景基于历史波动级别近似，不代替对具体发行条款和链下资产质量的复核。",
        "The scenario is an engineering approximation based on historical volatility bands and does not replace diligence on issuer terms or offchain asset quality.",
    )


DEFAULT_HORIZONS = [90, 180, 365]


def simulate_multi_horizon(
    asset: AssetTemplate,
    investment_amount: float,
    horizons: list[int] | None = None,
    *,
    locale: str = "zh",
    analysis_seed: int | None = None,
) -> list[HoldingPeriodSimulation]:
    """Run ``simulate_holding`` for multiple holding horizons.

    Parameters
    ----------
    horizons
        List of holding periods in days.  Defaults to [90, 180, 365].

    Returns
    -------
    list[HoldingPeriodSimulation]
        One simulation result per horizon, in the order given.
    """
    if horizons is None:
        horizons = list(DEFAULT_HORIZONS)
    return [
        simulate_holding(asset, investment_amount, days, locale=locale, analysis_seed=analysis_seed)
        for days in horizons
    ]


def estimate_net_return_after_fees(
    asset: AssetTemplate,
    investment_amount: float,
    holding_period_days: int,
) -> dict[str, float]:
    """Estimate net return after all fees for a given holding period.

    Returns a dict with ``gross_return_pct``, ``total_fee_pct``,
    ``net_return_pct``, and ``net_value``.
    """
    gross_return_pct = asset.expected_return_base * (holding_period_days / 365)
    total_cost_bps = asset.total_cost_bps(holding_period_days)
    total_fee_pct = total_cost_bps / 10000
    net_return_pct = gross_return_pct - total_fee_pct
    net_value = investment_amount * (1 + net_return_pct)
    return {
        "gross_return_pct": round(gross_return_pct * 100, 4),
        "total_fee_pct": round(total_fee_pct * 100, 4),
        "net_return_pct": round(net_return_pct * 100, 4),
        "net_value": round(net_value, 2),
    }


KEYWORD_ASSET_MAP = {
    "usdt": "hsk-usdt",
    "stablecoin": "hsk-usdc",
    "稳定币": "hsk-usdc",
    "usdc": "hsk-usdc",
    "mmf": "cpic-estable-mmf",
    "货币基金": "cpic-estable-mmf",
    "白银": "hk-regulated-silver",
    "silver": "hk-regulated-silver",
    "real estate": "tokenized-real-estate-demo",
    "地产": "tokenized-real-estate-demo",
    "房产": "tokenized-real-estate-demo",
    "btc": "hsk-wbtc-benchmark",
    "wbtc": "hsk-wbtc-benchmark",
}


def resolve_selected_assets(
    mode: AnalysisMode,
    problem_statement: str,
    context: RwaIntakeContext,
    asset_library: list[AssetTemplate],
) -> list[AssetTemplate]:
    asset_map = {asset.asset_id: asset for asset in asset_library}
    resolved_ids: list[str] = []

    for asset_id in context.preferred_asset_ids:
        if asset_id in asset_map and asset_id not in resolved_ids:
            resolved_ids.append(asset_id)

    normalized_problem = problem_statement.lower()
    for keyword, asset_id in KEYWORD_ASSET_MAP.items():
        if keyword in normalized_problem and asset_id in asset_map and asset_id not in resolved_ids:
            resolved_ids.append(asset_id)

    if not resolved_ids:
        resolved_ids = ["hsk-usdc", "cpic-estable-mmf", "hk-regulated-silver"]

    if mode == AnalysisMode.SINGLE_DECISION and len(resolved_ids) == 1:
        for fallback_id in ("hsk-usdc", "cpic-estable-mmf"):
            if fallback_id in asset_map and fallback_id not in resolved_ids:
                resolved_ids.append(fallback_id)

    return [asset_map[asset_id] for asset_id in resolved_ids if asset_id in asset_map][:5]


def _liquidity_gate_penalty(asset: AssetTemplate, liquidity_need: LiquidityNeed) -> float:
    if liquidity_need == LiquidityNeed.INSTANT and asset.redemption_days > 0:
        return 16.0 + asset.redemption_days * 2.5
    if liquidity_need == LiquidityNeed.T_PLUS_3 and asset.redemption_days > 3:
        return 9.0 + asset.redemption_days
    if liquidity_need == LiquidityNeed.LOCKED:
        return 0.0
    return 0.0


TYPE_TARGET_WEIGHTS: dict[RiskTolerance, dict[AssetType, float]] = {
    RiskTolerance.CONSERVATIVE: {
        AssetType.STABLECOIN: 0.42,
        AssetType.MMF: 0.28,
        AssetType.PRECIOUS_METAL: 0.15,
        AssetType.REAL_ESTATE: 0.08,
        AssetType.BENCHMARK: 0.07,
        AssetType.STOCKS: 0.0,
    },
    RiskTolerance.BALANCED: {
        AssetType.STABLECOIN: 0.28,
        AssetType.MMF: 0.25,
        AssetType.PRECIOUS_METAL: 0.18,
        AssetType.REAL_ESTATE: 0.16,
        AssetType.BENCHMARK: 0.13,
        AssetType.STOCKS: 0.0,
    },
    RiskTolerance.AGGRESSIVE: {
        AssetType.STABLECOIN: 0.18,
        AssetType.MMF: 0.19,
        AssetType.PRECIOUS_METAL: 0.2,
        AssetType.REAL_ESTATE: 0.2,
        AssetType.BENCHMARK: 0.23,
        AssetType.STOCKS: 0.0,
    },
}


def recommend_allocations(
    context: RwaIntakeContext,
    asset_cards: list[AssetAnalysisCard],
    *,
    locale: str = "zh",
) -> list[PortfolioAllocation]:
    by_type = TYPE_TARGET_WEIGHTS[context.risk_tolerance]
    scored_cards: list[tuple[AssetAnalysisCard, float, str]] = []
    effective_kyc_level = _effective_kyc_level(context)

    for card in asset_cards:
        penalty = _liquidity_gate_penalty(
            AssetTemplate(
                asset_id=card.asset_id,
                symbol=card.symbol,
                name=card.name,
                asset_type=card.asset_type,
                description=card.thesis or card.fit_summary,
                issuer=card.issuer,
                custody=card.custody,
                chain_id=card.chain_id,
                contract_address=card.contract_address,
                expected_return_low=card.expected_return_low,
                expected_return_base=card.expected_return_base,
                expected_return_high=card.expected_return_high,
                redemption_days=card.exit_days,
                requires_kyc_level=card.kyc_required_level,
            ),
            context.liquidity_need,
        )
        blocked_reason = ""
        if card.kyc_required_level and effective_kyc_level < card.kyc_required_level:
            blocked_reason = text_for_locale(
                locale,
                f"需要至少 KYC 等级 {card.kyc_required_level}",
                f"Requires at least KYC level {card.kyc_required_level}",
            )

        score = (
            by_type.get(card.asset_type, 0.05) * 100
            + card.expected_return_base * 90
            - card.risk_vector.overall * 0.32
            - card.total_cost_bps / 30
            - penalty
        )
        scored_cards.append((card, score, blocked_reason))

    usable_scores = [max(score, 0.0) for _, score, blocked in scored_cards if not blocked]
    score_sum = sum(usable_scores) or 1.0
    allocations: list[PortfolioAllocation] = []

    for card, score, blocked_reason in scored_cards:
        usable_score = max(score, 0.0) if not blocked_reason else 0.0
        target_weight = 0.0 if blocked_reason else usable_score / score_sum * 100
        suggested_amount = context.investment_amount * target_weight / 100
        rationale = (
            text_for_locale(
                locale,
                "兼顾收益与风险分散。",
                "Balances carry with diversification across risk sources.",
            )
            if target_weight >= 25
            else text_for_locale(
                locale,
                "作为卫星仓位，用于增加分散性或收益弹性。",
                "Acts as a satellite sleeve that adds diversification or upside elasticity.",
            )
        )
        if card.asset_type == AssetType.STABLECOIN and target_weight >= 20:
            rationale = text_for_locale(
                locale,
                "承担流动性缓冲与待命资金池角色。",
                "Serves as the liquidity buffer and ready-cash sleeve.",
            )
        if card.asset_type == AssetType.MMF:
            rationale = text_for_locale(
                locale,
                "承担稳定收益腿，同时保持较短的可退出时间。",
                "Provides the steady-income sleeve while preserving a relatively short exit timeline.",
            )
        if card.asset_type == AssetType.PRECIOUS_METAL:
            rationale = text_for_locale(
                locale,
                "作为通胀与宏观不确定性的对冲腿。",
                "Acts as the inflation and macro-uncertainty hedge sleeve.",
            )
        allocations.append(
            PortfolioAllocation(
                asset_id=card.asset_id,
                asset_name=card.name,
                target_weight_pct=round(target_weight, 1),
                suggested_amount=round(suggested_amount, 2),
                rationale=rationale,
                blocked_reason=blocked_reason,
            )
        )

    allocations.sort(key=lambda item: item.target_weight_pct, reverse=True)
    return allocations


def recommend_allocations(
    context: RwaIntakeContext,
    asset_cards: list[AssetAnalysisCard],
    *,
    locale: str = "zh",
) -> list[PortfolioAllocation]:
    scored_cards: list[tuple[AssetAnalysisCard, float, str]] = []

    for card in asset_cards:
        utility_score = float(card.metadata.get("utility_score", 0.0) or 0.0)
        blocked_reason = _allocation_block_reason(context, card, locale=locale)
        scored_cards.append((card, utility_score, blocked_reason))

    eligible_scores = [(card, score) for card, score, blocked_reason in scored_cards if not blocked_reason]
    baseline = max((score for _, score in eligible_scores), default=0.0)
    scaled_scores = {card.asset_id: math.exp((score - baseline) / 8) for card, score in eligible_scores}
    score_sum = sum(scaled_scores.values()) or 1.0
    allocations: list[PortfolioAllocation] = []

    for card, _, blocked_reason in scored_cards:
        usable_score = scaled_scores.get(card.asset_id, 0.0) if not blocked_reason else 0.0
        target_weight = 0.0 if blocked_reason else usable_score / score_sum * 100
        rationale = _allocation_rationale(card, locale=locale)
        allocations.append(
            PortfolioAllocation(
                asset_id=card.asset_id,
                asset_name=card.name,
                target_weight_pct=round(target_weight, 1),
                suggested_amount=round(context.investment_amount * target_weight / 100, 2),
                rationale=rationale,
                blocked_reason=blocked_reason,
            )
        )

    allocations.sort(key=lambda item: item.target_weight_pct, reverse=True)
    return allocations


def _allocation_block_reason(
    context: RwaIntakeContext,
    card: AssetAnalysisCard,
    *,
    locale: str = "zh",
) -> str:
    effective_kyc_level = _effective_kyc_level(context)
    if (
        not context.include_non_production_assets
        and not card.default_rank_eligible
    ):
        if AssetStatus.DEMO in card.statuses:
            return text_for_locale(
                locale,
                "Demo 资产默认不参与正式推荐排名，除非你显式纳入非生产资产。",
                "Demo assets are excluded from the default ranking unless you explicitly include non-production assets.",
            )
        if AssetStatus.BENCHMARK in card.statuses:
            return text_for_locale(
                locale,
                "Benchmark 资产默认只作机会成本比较，不参与正式推荐排名。",
                "Benchmark assets stay in the comparison set by default but do not compete in the formal recommendation ranking.",
            )
    if card.kyc_required_level and effective_kyc_level < card.kyc_required_level:
        return text_for_locale(
            locale,
            f"需要至少 KYC 等级 {card.kyc_required_level}",
            f"Requires at least KYC level {card.kyc_required_level}",
        )
    minimum_ticket_usd = float(card.metadata.get("minimum_ticket_usd", 0) or 0)
    if minimum_ticket_usd > context.investment_amount:
        return text_for_locale(
            locale,
            f"最低认购门槛是 {minimum_ticket_usd:.0f} USD",
            f"Minimum ticket is {minimum_ticket_usd:.0f} USD",
        )
    if context.liquidity_need == LiquidityNeed.INSTANT and card.exit_days > 0:
        return text_for_locale(
            locale,
            "当前流动性要求为 T+0，该资产的退出节奏不匹配。",
            "Your current liquidity requirement is T+0, which this asset cannot satisfy.",
        )
    return ""


def _allocation_rationale(card: AssetAnalysisCard, *, locale: str = "zh") -> str:
    if card.asset_type == AssetType.STABLECOIN:
        return text_for_locale(
            locale,
            "承担流动性核心仓位，优先保证退出速度和回撤控制。",
            "Provides the liquidity anchor while keeping tail risk comparatively contained.",
        )
    if card.asset_type == AssetType.MMF:
        return text_for_locale(
            locale,
            "兼顾稳态收益与较短赎回节奏，适合作为低波动收益腿。",
            "Combines modest carry with shorter redemption friction than longer-lockup RWAs.",
        )
    if card.asset_type == AssetType.PRECIOUS_METAL:
        return text_for_locale(
            locale,
            "提供通胀与宏观分散化，但仓位应受流动性和波动约束。",
            "Adds macro and inflation diversification, but sizing should stay below the liquidity core.",
        )
    return text_for_locale(
        locale,
        "保留投资价值，但需要明确管理流动性、条款和准入风险。",
        allocation_reason(card, card.metadata.get("utility_components", {})),
    )


def _source_name(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return hostname.replace("www.", "") or "source"


def build_catalog_evidence(
    asset: AssetTemplate,
    *,
    locale: str = "zh",
    fetched_at: datetime | None = None,
) -> list[EvidenceItem]:
    evidence_items: list[EvidenceItem] = []
    for index, url in enumerate(asset.evidence_urls[:2], start=1):
        facts = [
            text_for_locale(
                locale,
                f"资产类型: {_asset_type_label(asset.asset_type, locale)}",
                f"Asset type: {_asset_type_label(asset.asset_type, locale)}",
            ),
            text_for_locale(
                locale,
                f"最短退出时间: T+{asset.redemption_days}" if asset.redemption_days else "最短退出时间: T+0",
                f"Earliest exit: T+{asset.redemption_days}" if asset.redemption_days else "Earliest exit: T+0",
            ),
            text_for_locale(
                locale,
                f"总成本估算: {asset.total_cost_bps(30)} bps / 30d 持有期",
                f"Estimated all-in cost: {asset.total_cost_bps(30)} bps over a 30d hold",
            ),
            text_for_locale(
                locale,
                f"KYC 门槛: {asset.requires_kyc_level or 0}",
                f"KYC requirement: {asset.requires_kyc_level or 0}",
            ),
            text_for_locale(
                locale,
                f"链上验证: {'是' if asset.onchain_verified else '否'}",
                f"Onchain verified: {'yes' if asset.onchain_verified else 'no'}",
            ),
            text_for_locale(
                locale,
                f"发行方披露: {'是' if asset.issuer_disclosed else '否'}",
                f"Issuer disclosed: {'yes' if asset.issuer_disclosed else 'no'}",
            ),
        ]
        evidence_items.append(
            EvidenceItem(
                asset_id=asset.asset_id,
                title=text_for_locale(
                    locale,
                    f"{asset.name} 依据 {index}",
                    f"{asset.name} reference {index}",
                ),
                source_url=url,
                source_name=_source_name(url),
                fetched_at=fetched_at or datetime.now(timezone.utc),
                summary=text_for_locale(
                    locale,
                    f"{asset.name} 的模板基于官方网络文档、Token Contracts、KYC 说明或发行方披露构建。",
                    f"The {asset.name} template is grounded in official network docs, token-contract references, KYC materials, or issuer disclosures.",
                ),
                extracted_facts=facts,
                confidence=0.82,
                contract_address=asset.contract_address,
                chain_id=asset.chain_id,
                oracle_provider=asset.oracle_provider,
                proof_type=(
                    "onchain_contract"
                    if asset.onchain_verified and index == 1
                    else ("issuer_disclosure" if asset.issuer_disclosed else "reference")
                ),
                last_verified_at=asset.last_oracle_timestamp or fetched_at or datetime.now(timezone.utc),
                included_in_execution_plan=False,
                report_section_keys=[
                    "eligibility-summary",
                    "asset-facts",
                    "oracle-and-proof-sources",
                ],
                fact_type=(
                    asset.onchain_verified and index == 1
                    and EvidenceFactType.ONCHAIN_VERIFIED_FACT
                    or asset.issuer_disclosed
                    and EvidenceFactType.OFFCHAIN_DISCLOSED_FACT
                    or EvidenceFactType.INFERRED_FACT
                ),
            )
        )
    return evidence_items


def build_asset_cards(
    assets: list[AssetTemplate],
    context: RwaIntakeContext,
    simulations: list[HoldingPeriodSimulation] | None = None,
    *,
    locale: str = "zh",
) -> list[AssetAnalysisCard]:
    if simulations is None:
        simulations = [
            simulate_holding(
                asset,
                context.investment_amount,
                context.holding_period_days,
                locale=locale,
                analysis_seed=context.analysis_seed,
            )
            for asset in assets
        ]
    profiles = build_risk_profiles(assets, simulations, context)
    cards: list[AssetAnalysisCard] = []
    for asset in assets:
        profile = profiles[asset.asset_id]
        cards.append(
            AssetAnalysisCard(
                asset_id=asset.asset_id,
                symbol=asset.symbol,
                name=asset.name,
                asset_type=asset.asset_type,
                issuer=asset.issuer,
                custody=asset.custody,
                chain_id=asset.chain_id,
                contract_address=asset.contract_address,
                protocol_name=asset.protocol_name,
                permissioning_standard=asset.permissioning_standard,
                required_kyc_level=asset.required_kyc_level,
                eligible_investor_types=list(asset.eligible_investor_types),
                restricted_jurisdictions=list(asset.restricted_jurisdictions),
                min_subscription_amount=asset.min_subscription_amount,
                redemption_window=asset.redemption_window,
                settlement_asset=asset.settlement_asset,
                oracle_provider=asset.oracle_provider,
                oracle_contract=asset.oracle_contract,
                last_oracle_timestamp=asset.last_oracle_timestamp,
                nav_or_price=asset.nav_or_price,
                indicative_yield=asset.indicative_yield,
                reserve_summary=asset.reserve_summary,
                custody_summary=asset.custody_summary,
                bridge_support=list(asset.bridge_support),
                proof_refs=list(asset.proof_refs),
                secondary_market_available=asset.secondary_market_available,
                risk_flags=list(asset.risk_flags),
                expected_return_low=asset.expected_return_low,
                expected_return_base=asset.expected_return_base,
                expected_return_high=asset.expected_return_high,
                exit_days=asset.redemption_days,
                total_cost_bps=asset.total_cost_bps(context.holding_period_days),
                kyc_required_level=asset.requires_kyc_level,
                thesis=asset.thesis,
                fit_summary=asset.fit_summary,
                tags=asset.tags,
                primary_source_url=asset.primary_source_url or (asset.evidence_urls[0] if asset.evidence_urls else ""),
                onchain_verified=asset.onchain_verified,
                issuer_disclosed=asset.issuer_disclosed,
                statuses=list(asset.statuses),
                truth_level=asset.truth_level,
                live_readiness=asset.live_readiness,
                default_rank_eligible=asset.default_rank_eligible,
                status_explanation=asset.status_explanation,
                truth_level_explanation=asset.truth_level_explanation,
                risk_vector=profile.risk_vector,
                risk_breakdown=profile.risk_breakdown,
                risk_data_quality=profile.risk_data_quality,
                metadata={
                    "minimum_ticket_usd": asset.minimum_ticket_usd,
                    "oracle_count": asset.oracle_count,
                    "lockup_days": asset.lockup_days,
                    "oracle_sources": asset.oracle_sources,
                    "pricing_source_label": "APRO Oracle" if asset.oracle_count else "Issuer / disclosure",
                    "source_url": asset.primary_source_url or (asset.evidence_urls[0] if asset.evidence_urls else ""),
                    "utility_score": profile.utility_score,
                    "utility_components": profile.utility_components,
                    "action_type": asset.action_type.value,
                    "action_readiness": asset.action_readiness.value,
                    "action_links": [link.model_dump(mode="json") for link in asset.action_links],
                    "action_blocker_reasons": list(asset.action_blocker_reasons),
                    "execution_notes": list(asset.execution_notes),
                },
                evidence_refs=list(asset.evidence_urls),
            )
        )
    return cards


def build_comparison_tables(
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[ReportTable]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}

    comparison_rows = []
    risk_rows = []
    for card in asset_cards:
        simulation = simulation_map[card.asset_id]
        comparison_rows.append(
            {
                text_for_locale(locale, "资产", "Asset"): card.name,
                text_for_locale(locale, "类型", "Type"): _asset_type_label(card.asset_type, locale),
                text_for_locale(locale, "预期年化", "Expected annualized"): f"{card.expected_return_base * 100:.1f}%",
                text_for_locale(locale, "持有期基准收益", "Base holding return"): f"{simulation.return_pct_base:.2f}%",
                text_for_locale(locale, "最短退出", "Earliest exit"): f"T+{card.exit_days}" if card.exit_days else "T+0",
                "Total cost (bps)": card.total_cost_bps,
                "KYC": card.kyc_required_level or 0,
            }
        )
        risk_rows.append(
            {
                text_for_locale(locale, "资产", "Asset"): card.name,
                "Market": card.risk_vector.market,
                "Liquidity": card.risk_vector.liquidity,
                "Peg/Redemption": card.risk_vector.peg_redemption,
                "Issuer/Custody": card.risk_vector.issuer_custody,
                "Smart Contract": card.risk_vector.smart_contract,
                "Oracle": card.risk_vector.oracle_dependency,
                "Compliance": card.risk_vector.compliance_access,
                "Overall": card.risk_vector.overall,
            }
        )

    return [
        ReportTable(
            title=text_for_locale(locale, "RWA 对比矩阵", "RWA comparison matrix"),
            columns=[
                text_for_locale(locale, "资产", "Asset"),
                text_for_locale(locale, "类型", "Type"),
                text_for_locale(locale, "预期年化", "Expected annualized"),
                text_for_locale(locale, "持有期基准收益", "Base holding return"),
                text_for_locale(locale, "最短退出", "Earliest exit"),
                "Total cost (bps)",
                "KYC",
            ],
            rows=comparison_rows,
            notes=text_for_locale(
                locale,
                "收益区间与退出速度按统一口径比较，便于快速筛掉不符合约束的方案。",
                "Returns and exit speed are normalized on the same basis so non-viable candidates can be screened quickly.",
            ),
        ),
        ReportTable(
            title=text_for_locale(locale, "RiskVector 细分", "RiskVector breakdown"),
            columns=[text_for_locale(locale, "资产", "Asset"), "Market", "Liquidity", "Peg/Redemption", "Issuer/Custody", "Smart Contract", "Oracle", "Compliance", "Overall"],
            rows=risk_rows,
            notes=text_for_locale(
                locale,
                "0-100 分越高越危险；这是用于同口径比较的工程化评分，不是法律或投资意见。",
                "Higher scores are riskier on a 0-100 scale; this is an engineering score for apples-to-apples comparison, not legal or investment advice.",
            ),
        ),
    ]


def build_option_profiles(
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[OptionProfile]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    profiles: list[OptionProfile] = []
    for card in asset_cards:
        simulation = simulation_map[card.asset_id]
        profiles.append(
            OptionProfile(
                name=card.name,
                summary=card.fit_summary,
                pros=[
                    text_for_locale(
                        locale,
                        f"基准持有期收益约 {simulation.return_pct_base:.2f}%",
                        f"Base holding-period return is about {simulation.return_pct_base:.2f}%",
                    ),
                    text_for_locale(
                        locale,
                        f"退出节奏 {('T+0' if card.exit_days == 0 else f'T+{card.exit_days}')}",
                        f"Exit cadence {('T+0' if card.exit_days == 0 else f'T+{card.exit_days}')}",
                    ),
                ],
                cons=[
                    text_for_locale(
                        locale,
                        f"综合风险 {card.risk_vector.overall:.1f}/100",
                        f"Overall risk {card.risk_vector.overall:.1f}/100",
                    ),
                    text_for_locale(
                        locale,
                        f"总成本 {card.total_cost_bps} bps",
                        f"Total cost {card.total_cost_bps} bps",
                    ),
                ],
                conditions=[
                    text_for_locale(
                        locale,
                        f"KYC 等级要求: {card.kyc_required_level or 0}",
                        f"KYC requirement: {card.kyc_required_level or 0}",
                    ),
                ],
                fit_for=[card.fit_summary],
                caution_flags=[
                    text_for_locale(
                        locale,
                        f"Issuer/Custody 风险 {card.risk_vector.issuer_custody:.1f}",
                        f"Issuer/Custody risk {card.risk_vector.issuer_custody:.1f}",
                    ),
                    text_for_locale(
                        locale,
                        f"Liquidity 风险 {card.risk_vector.liquidity:.1f}",
                        f"Liquidity risk {card.risk_vector.liquidity:.1f}",
                    ),
                ],
                estimated_cost_low=card.total_cost_bps * 0.8,
                estimated_cost_base=float(card.total_cost_bps),
                estimated_cost_high=card.total_cost_bps * 1.2,
                currency="bps",
                score=round(max(0, 100 - card.risk_vector.overall + simulation.return_pct_base), 1),
                confidence=0.79,
                basis_refs=card.evidence_refs,
            )
        )
    return profiles


def build_comparison_matrix(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> ComparisonMatrix:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    asset_map = {asset.asset_id: asset for asset in assets}
    metrics = [
        ComparisonMatrixMetric(key="expected_return", label=text_for_locale(locale, "预期收益", "Expected return"), unit="%"),
        ComparisonMatrixMetric(key="net_return_after_fees", label=text_for_locale(locale, "费后净收益", "Net return after fees"), unit="%"),
        ComparisonMatrixMetric(key="liquidity", label=text_for_locale(locale, "流动性", "Liquidity")),
        ComparisonMatrixMetric(key="earliest_exit", label=text_for_locale(locale, "最早退出", "Earliest exit")),
        ComparisonMatrixMetric(key="lockup_burden", label=text_for_locale(locale, "锁定负担", "Lockup burden")),
        ComparisonMatrixMetric(key="issuer_backing_risk", label=text_for_locale(locale, "发行人 / backing 风险", "Issuer / backing risk")),
        ComparisonMatrixMetric(key="redemption_friction", label=text_for_locale(locale, "赎回摩擦", "Redemption friction")),
        ComparisonMatrixMetric(key="volatility_drawdown", label=text_for_locale(locale, "波动 / 回撤", "Volatility / drawdown")),
        ComparisonMatrixMetric(key="data_quality", label=text_for_locale(locale, "数据质量", "Data quality")),
        ComparisonMatrixMetric(key="kyc_fit", label=text_for_locale(locale, "KYC 适配", "KYC fit")),
        ComparisonMatrixMetric(key="suitability", label=text_for_locale(locale, "当前画像适配度", "Profile suitability")),
    ]
    rows: list[ComparisonMatrixRow] = []
    for card in asset_cards:
        asset = asset_map[card.asset_id]
        simulation = simulation_map[card.asset_id]
        fee_estimate = estimate_net_return_after_fees(asset, context.investment_amount, context.holding_period_days)
        blocked_reason = _allocation_block_reason(context, card, locale=locale)
        badges = _matrix_badges(card, blocked_reason)
        cells = [
            ComparisonMatrixCell(
                metric_key="expected_return",
                label=text_for_locale(locale, "预期收益", "Expected return"),
                display_value=f"{card.expected_return_base * 100:.2f}%",
                raw_value=round(card.expected_return_base * 100, 2),
                tone=_higher_is_better_tone(card.expected_return_base * 100),
                badges=badges,
                rationale=text_for_locale(locale, "模板的基准年化收益假设。", "Base annualized return assumption from the template."),
                tooltip=text_for_locale(locale, "统一口径的基准收益，不是承诺收益。", "Normalized base return, not a promised yield."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="net_return_after_fees",
                label=text_for_locale(locale, "费后净收益", "Net return after fees"),
                display_value=f"{fee_estimate['net_return_pct']:.2f}%",
                raw_value=fee_estimate["net_return_pct"],
                tone=_higher_is_better_tone(fee_estimate["net_return_pct"]),
                badges=[],
                rationale=text_for_locale(locale, "已扣除管理费、进出费用和滑点估算。", "Includes management fees, entry/exit fees, and slippage."),
                tooltip=text_for_locale(locale, "更适合拿来做跨资产比较。", "A better apples-to-apples value for comparing assets."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="liquidity",
                label=text_for_locale(locale, "流动性", "Liquidity"),
                display_value=_liquidity_display(asset, locale=locale),
                raw_value=asset.redemption_days,
                tone=_lower_is_better_tone(asset.redemption_days * 8 + asset.lockup_days),
                badges=[],
                rationale=text_for_locale(locale, "综合退出天数、锁定期和可交易深度。", "Combines exit days, lockups, and tradability."),
                tooltip=text_for_locale(locale, "越快退出、锁定越短，流动性越高。", "Higher liquidity means faster exits and lighter lockups."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="earliest_exit",
                label=text_for_locale(locale, "最早退出", "Earliest exit"),
                display_value="T+0" if asset.redemption_days == 0 else f"T+{asset.redemption_days}",
                raw_value=asset.redemption_days,
                tone=_lower_is_better_tone(asset.redemption_days * 10),
                rationale=text_for_locale(locale, "按模板条款下的最短退出节奏。", "Earliest modeled redemption cadence under the asset terms."),
                tooltip=text_for_locale(locale, "这是最短退出节奏，不等于保证成交。", "This is the earliest exit cadence, not a liquidity guarantee."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="lockup_burden",
                label=text_for_locale(locale, "锁定负担", "Lockup burden"),
                display_value=text_for_locale(
                    locale,
                    f"{asset.lockup_days} 天" if asset.lockup_days else "无锁定",
                    f"{asset.lockup_days} days" if asset.lockup_days else "No lockup",
                ),
                raw_value=asset.lockup_days,
                tone=_lower_is_better_tone(asset.lockup_days),
                rationale=text_for_locale(locale, "锁定期越长，对流动性约束越重。", "Longer lockups create a heavier liquidity burden."),
                tooltip=text_for_locale(locale, "锁定期会显著影响再平衡能力。", "Lockups materially affect rebalancing flexibility."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="issuer_backing_risk",
                label=text_for_locale(locale, "发行人 / backing 风险", "Issuer / backing risk"),
                display_value=f"{card.risk_vector.issuer_custody:.1f}/100",
                raw_value=card.risk_vector.issuer_custody,
                tone=_lower_is_better_tone(card.risk_vector.issuer_custody),
                badges=_truth_badges(card),
                rationale=card.truth_level_explanation or card.status_explanation,
                tooltip=text_for_locale(locale, "越低代表发行人和托管披露越强。", "Lower scores mean stronger issuer and custody transparency."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="redemption_friction",
                label=text_for_locale(locale, "赎回摩擦", "Redemption friction"),
                display_value=f"{asset.entry_fee_bps + asset.exit_fee_bps + asset.slippage_bps} bps",
                raw_value=asset.entry_fee_bps + asset.exit_fee_bps + asset.slippage_bps,
                tone=_lower_is_better_tone(asset.entry_fee_bps + asset.exit_fee_bps + asset.slippage_bps),
                rationale=text_for_locale(locale, "反映申赎费率、滑点和流程摩擦。", "Reflects fees, slippage, and process friction around entry and exit."),
                tooltip=text_for_locale(locale, "同样收益下，摩擦越高越不利。", "With the same yield, higher friction is less attractive."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="volatility_drawdown",
                label=text_for_locale(locale, "波动 / 回撤", "Volatility / drawdown"),
                display_value=f"{simulation.max_drawdown_base_pct:.1f}% / {asset.price_volatility * 100:.1f}%",
                raw_value=simulation.max_drawdown_base_pct,
                tone=_lower_is_better_tone(simulation.max_drawdown_base_pct),
                rationale=text_for_locale(locale, "同时看基础波动和模拟中的中位回撤。", "Combines base volatility with median simulated drawdown."),
                tooltip=text_for_locale(locale, "用于识别收益背后的尾部风险。", "Helps expose tail risk behind the return number."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="data_quality",
                label=text_for_locale(locale, "数据质量", "Data quality"),
                display_value=f"{card.risk_data_quality:.2f}",
                raw_value=card.risk_data_quality,
                tone=_higher_is_better_tone(card.risk_data_quality * 100),
                rationale=text_for_locale(locale, "越高代表关键输入更完整。", "Higher values indicate more complete core inputs."),
                tooltip=text_for_locale(locale, "低数据质量会直接影响推荐可信度。", "Lower data quality directly weakens recommendation confidence."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="kyc_fit",
                label=text_for_locale(locale, "KYC 适配", "KYC fit"),
                display_value=_kyc_fit_display(context, card, locale=locale),
                raw_value=card.kyc_required_level or 0,
                tone="success" if not blocked_reason or "KYC" not in blocked_reason else "warning",
                rationale=text_for_locale(locale, "按当前有效 KYC 约束判断是否可进入正式候选集。", "Whether the current effective KYC level keeps the asset investable."),
                tooltip=text_for_locale(locale, "链上 KYC 快照存在时会覆盖手动输入。", "An onchain KYC snapshot overrides the manual constraint when available."),
                is_blocked=bool(blocked_reason),
            ),
            ComparisonMatrixCell(
                metric_key="suitability",
                label=text_for_locale(locale, "当前画像适配度", "Profile suitability"),
                display_value=_suitability_display(card, blocked_reason, locale=locale),
                raw_value=float(card.metadata.get("utility_score", 0.0) or 0.0),
                tone=_utility_tone(float(card.metadata.get("utility_score", 0.0) or 0.0), blocked_reason=blocked_reason),
                rationale=blocked_reason or card.fit_summary,
                tooltip=text_for_locale(locale, "综合收益、风险、流动性、准入和数据质量后的结果。", "Blends return, risk, liquidity, access, and data quality."),
                is_blocked=bool(blocked_reason),
            ),
        ]
        rows.append(
            ComparisonMatrixRow(
                asset_id=card.asset_id,
                asset_name=card.name,
                asset_symbol=card.symbol,
                statuses=list(card.statuses),
                truth_level=card.truth_level,
                live_readiness=card.live_readiness,
                default_rank_eligible=card.default_rank_eligible,
                cells=cells,
            )
        )
    return ComparisonMatrix(
        title=text_for_locale(locale, "标准化比较矩阵", "Standardized comparison matrix"),
        metrics=metrics,
        rows=rows,
        notes=[
            text_for_locale(
                locale,
                "Demo 和 benchmark 资产会展示在矩阵中，但默认不进入正式推荐排名。",
                "Demo and benchmark assets stay visible in the matrix, but are excluded from the default recommendation ranking.",
            ),
            text_for_locale(
                locale,
                "所有数值按当前持有期、KYC、流动性和费用假设统一口径比较。",
                "All values are normalized to the current holding period, KYC, liquidity, and fee assumptions.",
            ),
        ],
    )


def build_action_intents(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    allocations: list[PortfolioAllocation],
    *,
    locale: str = "zh",
) -> list[ActionIntent]:
    allocation_map = {allocation.asset_id: allocation for allocation in allocations}
    intents: list[ActionIntent] = []
    for asset in assets:
        allocation = allocation_map.get(asset.asset_id)
        blocked_reason = allocation.blocked_reason if allocation else ""
        blockers: list[ActionBlocker] = []
        if blocked_reason:
            blockers.append(
                ActionBlocker(
                    code="recommendation_blocked",
                    label=text_for_locale(locale, "当前阻塞项", "Current blocker"),
                    detail=blocked_reason,
                    severity="warning",
                )
            )
        blockers.extend(
            ActionBlocker(
                code=f"catalog_{index}",
                label=text_for_locale(locale, "资产限制", "Asset constraint"),
                detail=reason,
                severity="warning",
            )
            for index, reason in enumerate(asset.action_blocker_reasons, start=1)
        )
        readiness = asset.action_readiness
        if blocked_reason and readiness == ActionReadiness.READY:
            readiness = ActionReadiness.PARTIAL
        if AssetStatus.DEMO in asset.statuses:
            readiness = ActionReadiness.UNAVAILABLE
        if AssetStatus.BENCHMARK in asset.statuses and not context.include_non_production_assets:
            readiness = ActionReadiness.PARTIAL
        intents.append(
            ActionIntent(
                asset_id=asset.asset_id,
                asset_name=asset.name,
                action_type=asset.action_type,
                action_readiness=readiness,
                summary=_action_summary(asset, allocation, blocked_reason, locale=locale),
                action_blockers=blockers,
                action_links=list(asset.action_links),
                execution_notes=list(asset.execution_notes),
                checklist=_action_checklist(asset, blocked_reason, locale=locale),
            )
        )
    return intents


def build_recommendation_reason(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    asset_cards: list[AssetAnalysisCard],
    allocations: list[PortfolioAllocation],
    *,
    locale: str = "zh",
) -> RecommendationReason:
    top_allocation = next((item for item in allocations if item.target_weight_pct > 0), None)
    card_map = {card.asset_id: card for card in asset_cards}
    top_drivers: list[RecommendationDriver] = []
    if top_allocation:
        top_card = card_map[top_allocation.asset_id]
        utility = top_card.metadata.get("utility_components", {})
        top_drivers = [
            RecommendationDriver(
                title=text_for_locale(locale, "核心胜出原因", "Primary edge"),
                detail=text_for_locale(
                    locale,
                    f"{top_card.name} 的风险调整后适配度最高，当前建议权重 {top_allocation.target_weight_pct:.1f}%。",
                    f"{top_card.name} ranks highest on risk-adjusted fit, with a suggested weight of {top_allocation.target_weight_pct:.1f}%.",
                ),
                impact="high",
                asset_id=top_card.asset_id,
            ),
            RecommendationDriver(
                title=text_for_locale(locale, "流动性与持有期匹配", "Liquidity and horizon fit"),
                detail=text_for_locale(
                    locale,
                    f"该资产在 {context.holding_period_days} 天持有期下的流动性惩罚为 {utility.get('liquidity_penalty', 0):.1f}，更适合当前约束。",
                    f"Its liquidity penalty is {utility.get('liquidity_penalty', 0):.1f} over the current {context.holding_period_days}-day horizon.",
                ),
                impact="high" if utility.get("liquidity_penalty", 0) < 8 else "medium",
                asset_id=top_card.asset_id,
            ),
            RecommendationDriver(
                title=text_for_locale(locale, "费后效用", "After-fee utility"),
                detail=text_for_locale(
                    locale,
                    f"基准费后收益与风险、数据质量综合后仍保持可投资。数据质量 {top_card.risk_data_quality:.2f}。",
                    f"After fees, risk, and data quality adjustments, the asset remains investable. Data quality is {top_card.risk_data_quality:.2f}.",
                ),
                impact="medium",
                asset_id=top_card.asset_id,
            ),
        ]
    excluded_reasons = [
        ExcludedAssetReason(
            asset_id=allocation.asset_id,
            asset_name=allocation.asset_name,
            category="blocked",
            reason=allocation.blocked_reason,
        )
        for allocation in allocations
        if allocation.blocked_reason
    ]
    constraint_impacts = _build_constraint_impacts(context, assets, allocations, locale=locale)
    sensitivity_summary = _build_sensitivity_summary(context, assets, locale=locale)
    summary = text_for_locale(
        locale,
        "推荐结果优先考虑风险调整后效用、当前流动性要求、KYC 准入和默认排名资格。",
        "The recommendation prioritizes risk-adjusted utility, current liquidity needs, KYC access, and default ranking eligibility.",
    )
    return RecommendationReason(
        summary=summary,
        top_drivers=top_drivers,
        excluded_reasons=excluded_reasons,
        constraint_impacts=constraint_impacts,
        sensitivity_summary=sensitivity_summary,
    )


def build_report_warnings(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    allocations: list[PortfolioAllocation],
    *,
    evidence_warning: str = "",
    locale: str = "zh",
) -> list[str]:
    warnings: list[str] = [
        text_for_locale(
            locale,
            "这不是金融建议，也不是法律、税务或合规意见。",
            "This is not financial advice and not legal, tax, or compliance advice.",
        ),
        text_for_locale(
            locale,
            "KYC / eligibility 结论具有指示性；只有链上快照或发行方确认才可视为最终结果。",
            "KYC and eligibility conclusions are indicative; only an onchain snapshot or issuer confirmation should be treated as final.",
        ),
    ]
    if evidence_warning:
        warnings.append(evidence_warning)
    if any(AssetStatus.DEMO in asset.statuses for asset in assets):
        warnings.append(
            text_for_locale(
                locale,
                "报告中包含 demo 资产；demo 资产不代表真实可投产品。",
                "This report includes demo assets; demo assets do not represent live investable products.",
            )
        )
    if any(allocation.blocked_reason for allocation in allocations):
        warnings.append(
            text_for_locale(
                locale,
                "部分资产已因 KYC、最小门槛或默认排名规则被排除或降为观察项。",
                "Some assets were excluded or downgraded because of KYC, minimum-ticket, or default-ranking rules.",
            )
        )
    return warnings


def build_report_unknowns(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    *,
    locale: str = "zh",
) -> list[str]:
    unknowns = [
        text_for_locale(
            locale,
            "发行人条款、白名单流程和真实申赎容量可能在报告生成后变化。",
            "Issuer terms, whitelist workflows, and real redemption capacity can change after the report is generated.",
        ),
        text_for_locale(
            locale,
            "对 offchain backing、托管和法律结构的判断仍依赖发行人披露与外部文件。",
            "Judgments on offchain backing, custody, and legal structure still rely on issuer disclosure and external documents.",
        ),
    ]
    if not context.wallet_address:
        unknowns.append(
            text_for_locale(
                locale,
                "当前没有连接钱包，无法把链上准入状态与执行路径验证到具体地址。",
                "No wallet is connected, so the system cannot verify access status or execution paths against a specific address.",
            )
        )
    if any(asset.truth_level == TruthLevel.DEMO_ONLY for asset in assets):
        unknowns.append(
            text_for_locale(
                locale,
                "Demo 模板仅用于演示结构化比较，不代表真实发行和真实容量。",
                "Demo templates exist to demonstrate structured comparisons, not real issuance or real capacity.",
            )
        )
    return unknowns


def _build_constraint_impacts(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    allocations: list[PortfolioAllocation],
    *,
    locale: str = "zh",
) -> list[ConstraintImpact]:
    impacts = [
        ConstraintImpact(
            constraint_key="holding_period_days",
            label=text_for_locale(locale, "持有期", "Holding period"),
            impact_level="high",
            detail=text_for_locale(
                locale,
                f"当前以 {context.holding_period_days} 天为统一比较口径，直接影响费后收益和退出摩擦。",
                f"The {context.holding_period_days}-day horizon directly affects after-fee return and exit friction.",
            ),
        ),
        ConstraintImpact(
            constraint_key="liquidity_need",
            label=text_for_locale(locale, "流动性要求", "Liquidity requirement"),
            impact_level="high",
            detail=text_for_locale(
                locale,
                "流动性要求是最硬的筛选条件之一，先决定哪些资产可以进入正式候选。",
                "Liquidity need is one of the hardest filters and determines which assets can enter the formal candidate set.",
            ),
        ),
        ConstraintImpact(
            constraint_key="minimum_kyc_level",
            label=text_for_locale(locale, "KYC / 准入", "KYC / access"),
            impact_level="high",
            detail=text_for_locale(
                locale,
                "KYC 约束会直接改变可投资产集合，而不只是调整权重。",
                "KYC changes the investable universe itself rather than only tweaking weights.",
            ),
        ),
    ]
    if not context.include_non_production_assets and any(not asset.default_rank_eligible for asset in assets):
        impacts.append(
            ConstraintImpact(
                constraint_key="include_non_production_assets",
                label=text_for_locale(locale, "非生产资产默认排除", "Default non-production exclusion"),
                impact_level="medium",
                detail=text_for_locale(
                    locale,
                    "Demo 和 benchmark 会保留展示，但默认不会与生产型资产同权竞争。",
                    "Demo and benchmark assets remain visible, but do not compete on equal footing with production-style assets by default.",
                ),
            )
        )
    if any(allocation.blocked_reason for allocation in allocations):
        impacts.append(
            ConstraintImpact(
                constraint_key="hard_constraints",
                label=text_for_locale(locale, "硬约束", "Hard constraints"),
                impact_level="high",
                detail=text_for_locale(
                    locale,
                    "至少有一个候选因最低门槛或准入约束被直接排除。",
                    "At least one candidate was removed outright by access or minimum-ticket constraints.",
                ),
            )
        )
    return impacts


def _build_sensitivity_summary(
    context: RwaIntakeContext,
    assets: list[AssetTemplate],
    *,
    locale: str = "zh",
) -> list[SensitivitySummary]:
    scenarios = [
        ("horizon_shift", text_for_locale(locale, "持有期变化", "Changed horizon"), _counterfactual_context(context, scenario_key="horizon_shift")),
        ("stricter_liquidity", text_for_locale(locale, "更严格流动性", "Stricter liquidity"), _counterfactual_context(context, scenario_key="stricter_liquidity")),
        ("changed_kyc", text_for_locale(locale, "KYC 变化", "Changed KYC"), _counterfactual_context(context, scenario_key="changed_kyc")),
    ]
    summaries: list[SensitivitySummary] = []
    for scenario_key, label, scenario_context in scenarios:
        simulations = [
            simulate_holding(
                asset,
                scenario_context.investment_amount,
                scenario_context.holding_period_days,
                locale=locale,
                analysis_seed=(scenario_context.analysis_seed or 0) + 17,
            )
            for asset in assets
        ]
        cards = build_asset_cards(assets, scenario_context, simulations, locale=locale)
        allocations = recommend_allocations(scenario_context, cards, locale=locale)
        winners = [item for item in allocations if item.target_weight_pct > 0][:2]
        changed_assets = [item.asset_name for item in winners]
        shift = changed_assets[0] if changed_assets else text_for_locale(locale, "无可投资产", "No investable asset")
        summaries.append(
            SensitivitySummary(
                scenario_key=scenario_key,
                label=label,
                impact_summary=text_for_locale(
                    locale,
                    f"{label} 下的首选变为 {shift}。" if winners else f"{label} 下可投空间显著收缩。",
                    f"Under {label.lower()}, the lead candidate becomes {shift}." if winners else f"Under {label.lower()}, the investable set shrinks materially.",
                ),
                changed_assets=changed_assets,
                recommended_shift=text_for_locale(
                    locale,
                    "重新检查权重和硬约束，而不是沿用当前方案。",
                    "Re-check both weights and hard constraints instead of carrying the current plan over unchanged.",
                ),
            )
        )
    return summaries


def _counterfactual_context(context: RwaIntakeContext, *, scenario_key: str) -> RwaIntakeContext:
    cloned = context.model_copy(deep=True)
    if scenario_key == "horizon_shift":
        cloned.holding_period_days = 180 if context.holding_period_days < 180 else 60
        cloned.analysis_seed = (context.analysis_seed or 0) + 1
    elif scenario_key == "stricter_liquidity":
        cloned.liquidity_need = LiquidityNeed.INSTANT
        cloned.analysis_seed = (context.analysis_seed or 0) + 2
    elif scenario_key == "changed_kyc":
        cloned.minimum_kyc_level = 2 if context.minimum_kyc_level < 2 else 0
        cloned.wallet_kyc_level_onchain = None
        cloned.wallet_kyc_verified = None
        cloned.analysis_seed = (context.analysis_seed or 0) + 3
    return cloned


def _matrix_badges(card: AssetAnalysisCard, blocked_reason: str) -> list[str]:
    badges: list[str] = []
    if AssetStatus.VERIFIED in card.statuses:
        badges.append("Verified")
    if AssetStatus.ISSUER_DISCLOSED in card.statuses:
        badges.append("Issuer disclosed")
    if AssetStatus.DEMO in card.statuses:
        badges.append("Demo")
    if AssetStatus.BENCHMARK in card.statuses:
        badges.append("Benchmark")
    if blocked_reason:
        badges.append("Blocked")
    return badges


def _truth_badges(card: AssetAnalysisCard) -> list[str]:
    if card.truth_level == TruthLevel.ONCHAIN_VERIFIED:
        return ["Onchain verified"]
    if card.truth_level == TruthLevel.BENCHMARK_REFERENCE:
        return ["Benchmark reference"]
    if card.truth_level == TruthLevel.DEMO_ONLY:
        return ["Demo only"]
    return ["Issuer disclosed"]


def _liquidity_display(asset: AssetTemplate, *, locale: str = "zh") -> str:
    if asset.redemption_days == 0 and asset.lockup_days == 0:
        return text_for_locale(locale, "高 / T+0", "High / T+0")
    if asset.redemption_days <= 3 and asset.lockup_days == 0:
        return text_for_locale(locale, f"中 / T+{asset.redemption_days}", f"Medium / T+{asset.redemption_days}")
    return text_for_locale(locale, f"低 / T+{asset.redemption_days}", f"Low / T+{asset.redemption_days}")


def _kyc_fit_display(context: RwaIntakeContext, card: AssetAnalysisCard, *, locale: str = "zh") -> str:
    effective = _effective_kyc_level(context)
    required = card.kyc_required_level or 0
    if required <= effective:
        return text_for_locale(locale, f"可投 (L{effective})", f"Eligible (L{effective})")
    return text_for_locale(locale, f"不足 (需 L{required})", f"Insufficient (needs L{required})")


def _suitability_display(card: AssetAnalysisCard, blocked_reason: str, *, locale: str = "zh") -> str:
    if blocked_reason:
        return text_for_locale(locale, "受限", "Constrained")
    utility = float(card.metadata.get("utility_score", 0.0) or 0.0)
    if utility >= 0:
        return text_for_locale(locale, "高", "High")
    if utility >= -10:
        return text_for_locale(locale, "中", "Medium")
    return text_for_locale(locale, "低", "Low")


def _action_summary(
    asset: AssetTemplate,
    allocation: PortfolioAllocation | None,
    blocked_reason: str,
    *,
    locale: str = "zh",
) -> str:
    if blocked_reason:
        return text_for_locale(
            locale,
            f"当前不建议执行：{blocked_reason}",
            f"Not execution-ready yet: {blocked_reason}",
        )
    if allocation and allocation.target_weight_pct > 0:
        return text_for_locale(
            locale,
            f"建议作为下一步候选执行 {allocation.target_weight_pct:.1f}% 目标权重。",
            f"Execution-ready as a next-step candidate at {allocation.target_weight_pct:.1f}% target weight.",
        )
    return text_for_locale(
        locale,
        "保留为观察项或备用路径，不是当前首选执行资产。",
        "Keep as a watchlist or alternate path rather than the current primary execution asset.",
    )


def _action_checklist(asset: AssetTemplate, blocked_reason: str, *, locale: str = "zh") -> list[str]:
    if blocked_reason:
        return [
            text_for_locale(locale, "先解决当前阻塞项。", "Resolve the current blocker first."),
            text_for_locale(locale, "重新确认资格、最小门槛和退出条款。", "Re-check eligibility, minimum ticket, and exit terms."),
        ]
    if asset.action_type in {ActionType.HOLD, ActionType.MINT, ActionType.REDEEM}:
        return [
            text_for_locale(locale, "连接钱包并确认网络。", "Connect the wallet and confirm the network."),
            text_for_locale(locale, "核对合约地址、路由和授权额度。", "Verify the contract address, route, and allowance scope."),
            text_for_locale(locale, "按目标仓位执行并保存交易凭证。", "Execute to the target size and retain the transaction receipt."),
        ]
    if asset.action_type == ActionType.SUBSCRIBE:
        return [
            text_for_locale(locale, "确认 KYC / 白名单状态。", "Confirm KYC / whitelist status."),
            text_for_locale(locale, "核对申购门槛、结算币种和赎回窗口。", "Verify the minimum ticket, settlement currency, and redemption window."),
            text_for_locale(locale, "通过发行方入口提交认购。", "Submit the subscription through the issuer workflow."),
        ]
    return [
        text_for_locale(locale, "查看发行方或协议文档。", "Review the issuer or protocol documentation."),
        text_for_locale(locale, "确认是否存在真实可执行入口。", "Confirm whether a real execution path exists."),
    ]


def _higher_is_better_tone(value: float) -> str:
    if value >= 8:
        return "success"
    if value >= 3:
        return "gold"
    if value >= 0:
        return "neutral"
    return "warning"


def _lower_is_better_tone(value: float) -> str:
    if value <= 5:
        return "success"
    if value <= 20:
        return "gold"
    if value <= 45:
        return "warning"
    return "danger"


def _utility_tone(value: float, *, blocked_reason: str = "") -> str:
    if blocked_reason:
        return "warning"
    if value >= 0:
        return "success"
    if value >= -10:
        return "gold"
    return "warning"

"""
def build_comparison_tables(
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[ReportTable]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    comparison_rows = []
    risk_rows = []
    for card in asset_cards:
        simulation = simulation_map[card.asset_id]
        utility_score = float(card.metadata.get("utility_score", 0.0) or 0.0)
        comparison_rows.append(
            {
                text_for_locale(locale, "璧勪骇", "Asset"): card.name,
                text_for_locale(locale, "绫诲瀷", "Type"): _asset_type_label(card.asset_type, locale),
                text_for_locale(locale, "鍩哄噯鎸佹湁鏈熸敹鐩?, "Base holding return"): f"{simulation.return_pct_base:.2f}%",
                "CVaR95": f"{simulation.cvar_95_pct:.2f}%",
                text_for_locale(locale, "鏈€鐭€€鍑?, "Earliest exit"): "T+0" if card.exit_days == 0 else f"T+{card.exit_days}",
                "Risk-adjusted utility": round(utility_score, 2),
                "Risk score": card.risk_vector.overall,
                "Data quality": round(card.risk_data_quality, 2),
            }
        )
        risk_rows.append(
            {
                text_for_locale(locale, "璧勪骇", "Asset"): card.name,
                text_for_locale(locale, "甯傚満", "Market"): card.risk_vector.market,
                text_for_locale(locale, "娴佸姩鎬?, "Liquidity"): card.risk_vector.liquidity,
                text_for_locale(locale, "灏鹃儴鎹熷け", "Tail / redemption"): card.risk_vector.peg_redemption,
                text_for_locale(locale, "鍙戣涓庢墭绠?, "Issuer / custody"): card.risk_vector.issuer_custody,
                text_for_locale(locale, "鍚堢害娌荤悊", "Contract governance"): card.risk_vector.smart_contract,
                text_for_locale(locale, "棰勮█鏈轰緷璧?, "Oracle dependency"): card.risk_vector.oracle_dependency,
                text_for_locale(locale, "鍑嗗叆绾︽潫", "Compliance access"): card.risk_vector.compliance_access,
                "Overall": card.risk_vector.overall,
            }
        )

    return [
        ReportTable(
            title=text_for_locale(locale, "RWA 瀵规瘮鐭╅樀", "RWA comparison matrix"),
            columns=list(comparison_rows[0].keys()) if comparison_rows else [],
            rows=comparison_rows,
            notes=text_for_locale(
                locale,
                "鏀剁泭銆丆VaR銆侀€€鍑洪€熷害鍜岄闄╄皟鏁存晥鐢ㄦ寜鍚屼竴鍙ｅ緞瀵规瘮锛岄伩鍏嶅彧鐪?APY 銆?",
                "Returns, CVaR, exit speed, and risk-adjusted utility are shown on one basis so the ranking is not driven by APY alone.",
            ),
        ),
        ReportTable(
            title=text_for_locale(locale, "RiskVector 缁嗗垎", "RiskVector breakdown"),
            columns=list(risk_rows[0].keys()) if risk_rows else [],
            rows=risk_rows,
            notes=text_for_locale(
                locale,
                "鍚勭淮搴﹀垎鏁板厛鍋?winsorize 鍐嶆牴鎹綋鍓嶈祫浜ч泦鍚堝拰 CRITIC/AHP 鏉冮噸缁勫悎锛?0-100 鍒嗚秺楂樿秺鍗遍櫓銆?",
                "Each dimension is winsorized first and then blended with AHP/CRITIC weights across the current asset set; higher scores are riskier on a 0-100 scale.",
            ),
        ),
    ]

"""

def build_comparison_tables(
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[ReportTable]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    comparison_rows = []
    risk_rows = []
    for card in asset_cards:
        simulation = simulation_map[card.asset_id]
        utility_score = float(card.metadata.get("utility_score", 0.0) or 0.0)
        comparison_rows.append(
            {
                text_for_locale(locale, "资产", "Asset"): card.name,
                text_for_locale(locale, "类型", "Type"): _asset_type_label(card.asset_type, locale),
                text_for_locale(locale, "基准持有期收益", "Base holding return"): f"{simulation.return_pct_base:.2f}%",
                "CVaR95": f"{simulation.cvar_95_pct:.2f}%",
                text_for_locale(locale, "最早退出", "Earliest exit"): "T+0" if card.exit_days == 0 else f"T+{card.exit_days}",
                "Risk-adjusted utility": round(utility_score, 2),
                "Risk score": card.risk_vector.overall,
                "Data quality": round(card.risk_data_quality, 2),
            }
        )
        risk_rows.append(
            {
                text_for_locale(locale, "资产", "Asset"): card.name,
                text_for_locale(locale, "市场", "Market"): card.risk_vector.market,
                text_for_locale(locale, "流动性", "Liquidity"): card.risk_vector.liquidity,
                text_for_locale(locale, "尾部损失", "Tail / redemption"): card.risk_vector.peg_redemption,
                text_for_locale(locale, "发行人 / 托管", "Issuer / custody"): card.risk_vector.issuer_custody,
                text_for_locale(locale, "合约治理", "Contract governance"): card.risk_vector.smart_contract,
                text_for_locale(locale, "预言机依赖", "Oracle dependency"): card.risk_vector.oracle_dependency,
                text_for_locale(locale, "准入约束", "Compliance access"): card.risk_vector.compliance_access,
                "Overall": card.risk_vector.overall,
            }
        )

    return [
        ReportTable(
            title=text_for_locale(locale, "RWA 对比矩阵", "RWA comparison matrix"),
            columns=list(comparison_rows[0].keys()) if comparison_rows else [],
            rows=comparison_rows,
            notes=text_for_locale(
                locale,
                "收益、CVaR、退出速度和风险调整效用放在同一口径下比较，避免只看 APY。",
                "Returns, CVaR, exit speed, and risk-adjusted utility are shown on one basis so the ranking is not driven by APY alone.",
            ),
        ),
        ReportTable(
            title=text_for_locale(locale, "RiskVector 细分", "RiskVector breakdown"),
            columns=list(risk_rows[0].keys()) if risk_rows else [],
            rows=risk_rows,
            notes=text_for_locale(
                locale,
                "各维度先做 winsorize，再结合当前资产集的 AHP / CRITIC 权重；0-100 分越高越危险。",
                "Each dimension is winsorized first and then blended with AHP/CRITIC weights across the current asset set; higher scores are riskier on a 0-100 scale.",
            ),
        ),
    ]

def build_option_profiles(
    asset_cards: list[AssetAnalysisCard],
    simulations: list[HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[OptionProfile]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    raw_utility_scores = [float(card.metadata.get("utility_score", 0.0) or 0.0) for card in asset_cards]
    utility_low = min(raw_utility_scores) if raw_utility_scores else 0.0
    utility_high = max(raw_utility_scores) if raw_utility_scores else 1.0
    utility_span = max(utility_high - utility_low, 1.0)

    profiles: list[OptionProfile] = []
    for card in asset_cards:
        simulation = simulation_map[card.asset_id]
        utility_score = float(card.metadata.get("utility_score", 0.0) or 0.0)
        score = 20 + ((utility_score - utility_low) / utility_span) * 70
        top_risks = sorted(card.risk_breakdown, key=lambda item: item.normalized_score * item.weight, reverse=True)[:2]
        profiles.append(
            OptionProfile(
                name=card.name,
                summary=card.fit_summary,
                pros=[
                    text_for_locale(
                        locale,
                        f"鍩哄噯鎸佹湁鏈熸敹鐩婄害 {simulation.return_pct_base:.2f}%锛孋VaR95 {simulation.cvar_95_pct:.2f}%",
                        f"Base holding return is about {simulation.return_pct_base:.2f}% with CVaR95 at {simulation.cvar_95_pct:.2f}%.",
                    ),
                    text_for_locale(
                        locale,
                        f"鏁版嵁璐ㄩ噺 {card.risk_data_quality:.2f}锛岄€€鍑鸿妭濂?{'T+0' if card.exit_days == 0 else f'T+{card.exit_days}'}",
                        f"Data quality is {card.risk_data_quality:.2f} and exit cadence is {'T+0' if card.exit_days == 0 else f'T+{card.exit_days}'}.",
                    ),
                ],
                cons=[
                    text_for_locale(
                        locale,
                        f"缁煎悎椋庨櫓 {card.risk_vector.overall:.1f}/100",
                        f"Overall risk is {card.risk_vector.overall:.1f}/100.",
                    ),
                    text_for_locale(
                        locale,
                        f"鎬绘垚鏈?{card.total_cost_bps} bps",
                        f"All-in cost is {card.total_cost_bps} bps over the modeled hold.",
                    ),
                ],
                conditions=[
                    text_for_locale(
                        locale,
                        f"KYC 绛夌骇瑕佹眰: {card.kyc_required_level or 0}",
                        f"KYC requirement: {card.kyc_required_level or 0}",
                    ),
                ],
                fit_for=[card.fit_summary],
                caution_flags=[
                    text_for_locale(
                        locale,
                        f"閲嶇偣椋庨櫓: {item.dimension} {item.normalized_score:.1f}/100"
                        if locale == "zh"
                        else f"Primary risk: {item.dimension} {item.normalized_score:.1f}/100",
                        f"Primary risk: {item.dimension} {item.normalized_score:.1f}/100",
                    )
                    for item in top_risks
                ],
                estimated_cost_low=card.total_cost_bps * 0.85,
                estimated_cost_base=float(card.total_cost_bps),
                estimated_cost_high=card.total_cost_bps * 1.15,
                currency="bps",
                score=round(max(0.0, min(100.0, score)), 1),
                confidence=round(max(0.55, min(0.95, 0.6 + card.risk_data_quality * 0.3)), 2),
                basis_refs=card.evidence_refs,
            )
        )
    return profiles


def build_tx_draft(
    context: RwaIntakeContext,
    allocations: list[PortfolioAllocation],
    asset_lookup: dict[str, AssetTemplate],
    chain_config: HashKeyChainConfig,
    *,
    locale: str = "zh",
) -> TxDraft:
    attestation_network, _, attestation_contract, attestation_explorer = _resolve_attestation_network(chain_config)
    executable_allocations = [
        allocation
        for allocation in allocations
        if allocation.target_weight_pct > 0 and asset_lookup[allocation.asset_id].execution_style == "erc20"
    ]
    has_mainnet_asset_steps = any(
        asset_lookup[allocation.asset_id].chain_id == chain_config.mainnet_chain_id
        for allocation in executable_allocations
    )
    has_testnet_asset_steps = any(
        asset_lookup[allocation.asset_id].chain_id == chain_config.testnet_chain_id
        for allocation in executable_allocations
    )
    asset_execution_network = (
        "mainnet"
        if has_mainnet_asset_steps
        else "testnet"
        if has_testnet_asset_steps
        else _report_network(context, chain_config)
    )
    primary_network = asset_execution_network if executable_allocations else attestation_network
    primary_explorer = (
        chain_config.mainnet_explorer_url
        if primary_network == "mainnet"
        else chain_config.testnet_explorer_url
    )

    steps: list[TxDraftStep] = [
        TxDraftStep(
            step=1,
            title=text_for_locale(locale, "切换到 HashKey Chain", "Switch to HashKey Chain"),
            description=text_for_locale(
                locale,
                f"将钱包网络切换到{_network_label(primary_network, locale=locale)}，确认 RPC 与 Explorer 参数正确。",
                f"Switch the wallet network to {_network_label(primary_network, locale=locale)} and verify the RPC plus explorer settings.",
            ),
            action_type="switch_network",
            explorer_url=primary_explorer,
            estimated_fee_usd=0.0,
        )
    ]

    step_index = 2
    total_fee = 0.0

    for allocation in allocations:
        if allocation.target_weight_pct <= 0:
            continue
        asset = asset_lookup[allocation.asset_id]
        if asset.execution_style == "erc20":
            steps.append(
                TxDraftStep(
                    step=step_index,
                    title=text_for_locale(
                        locale,
                        f"准备 {asset.symbol} 头寸",
                        f"Prepare the {asset.symbol} position",
                    ),
                    description=text_for_locale(
                        locale,
                        f"确保钱包内有约 {allocation.suggested_amount:.2f} {context.base_currency}，并检查目标合约 {asset.contract_address} 的交易路径与授权额度。",
                        f"Ensure the wallet holds about {allocation.suggested_amount:.2f} {context.base_currency} and verify routing plus allowance settings for {asset.contract_address}.",
                    ),
                    action_type="approve_or_swap",
                    target_contract=asset.contract_address,
                    explorer_url=address_url(chain_config, asset_execution_network, asset.contract_address),
                    estimated_fee_usd=0.42,
                    caution=text_for_locale(
                        locale,
                        "检查滑点和桥接路径，不要一次性放大授权额度。",
                        "Review slippage and bridge routing and avoid over-approving allowances in one shot.",
                    ),
                )
            )
            total_fee += 0.42
        else:
            steps.append(
                TxDraftStep(
                    step=step_index,
                    title=text_for_locale(
                        locale,
                        f"完成 {asset.name} 的申购流程",
                        f"Complete the {asset.name} subscription flow",
                    ),
                    description=text_for_locale(
                        locale,
                        "该资产更接近 permissioned RWA，先完成 KYC/白名单校验，再经发行方入口发起申购或认购。",
                        "This asset behaves more like a permissioned RWA, so complete KYC or whitelist checks first and then subscribe through the issuer portal.",
                    ),
                    action_type="issuer_portal",
                    estimated_fee_usd=0.15,
                    caution=text_for_locale(
                        locale,
                        "必须核对申赎条款、投资者类型限制与结算币种。",
                        "Verify redemption terms, investor-type restrictions, and settlement currency before proceeding.",
                    ),
                )
            )
            total_fee += 0.15
        step_index += 1

    if context.wants_onchain_attestation:
        if steps and attestation_network != primary_network:
            steps.append(
                TxDraftStep(
                    step=step_index,
                    title=text_for_locale(
                        locale,
                        f"切换到{_network_label(attestation_network, locale=locale)}",
                        f"Switch to {_network_label(attestation_network, locale=locale)}",
                    ),
                    description=text_for_locale(
                        locale,
                        "资产准备完成后，切换到 attestation 目标网络以写入 Plan Registry。",
                        "After preparing the asset positions, switch to the attestation target network before writing to Plan Registry.",
                    ),
                    action_type="switch_network",
                    explorer_url=attestation_explorer,
                    estimated_fee_usd=0.0,
                )
            )
            step_index += 1
        steps.append(
            TxDraftStep(
                step=step_index,
                title=text_for_locale(locale, "记录报告存证", "Record the report attestation"),
                description=text_for_locale(
                    locale,
                    f"在确认方案前，将报告哈希和组合哈希写入 HashKey Chain {attestation_network.title()} Plan Registry，保留可审计决策痕迹。",
                    f"Before executing, write the report hash and portfolio hash into the HashKey Chain {attestation_network.title()} Plan Registry to preserve an auditable decision trail.",
                ),
                action_type="attest_plan",
                target_contract=attestation_contract,
                explorer_url=(
                    address_url(chain_config, attestation_network, attestation_contract)
                    if attestation_contract
                    else attestation_explorer
                ),
                estimated_fee_usd=0.28 if attestation_contract else 0.0,
                caution=text_for_locale(
                    locale,
                    "存证记录的是哈希摘要，不应包含原始敏感信息。",
                    "Only the hash digest should be recorded onchain; raw sensitive data should never be included.",
                ),
            )
        )
        total_fee += 0.28 if attestation_contract else 0.0

    return TxDraft(
        title=text_for_locale(locale, "HashKey Chain 执行草案", "HashKey Chain execution draft"),
        chain_id=chain_id_for(chain_config, primary_network),
        chain_name=_network_label(primary_network, locale="en"),
        funding_asset=context.base_currency,
        total_estimated_fee_usd=round(total_fee, 2),
        steps=steps,
        risk_warnings=[
            text_for_locale(
                locale,
                "先核对 KYC 门槛和投资者类型要求，再看收益数字。",
                "Validate KYC and investor-type gating before looking at yield figures.",
            ),
            text_for_locale(
                locale,
                "RWA 资产的退出速度通常不如 ERC20 稳定币，T+N 应视作硬约束。",
                "RWA exits are usually slower than ERC20 stablecoins, so T+N should be treated as a hard constraint.",
            ),
            text_for_locale(
                locale,
                "报告中的模拟是压力测试，不是未来收益承诺。",
                "The simulations in this report are stress scenarios, not return promises.",
            ),
        ],
        can_execute_onchain=any(
            asset_lookup[item.asset_id].execution_style == "erc20"
            for item in allocations
            if item.target_weight_pct > 0
        ),
    )


def build_attestation_draft(
    report_markdown: str,
    allocations: list[PortfolioAllocation],
    chain_config: HashKeyChainConfig,
) -> AttestationDraft:
    network, chain_id, contract_address, explorer_url = _resolve_attestation_network(chain_config)
    report_hash = hashlib.sha256(report_markdown.encode("utf-8")).hexdigest()
    portfolio_payload = json.dumps(
        [allocation.model_dump(mode="json") for allocation in allocations],
        ensure_ascii=False,
        sort_keys=True,
    )
    portfolio_hash = hashlib.sha256(portfolio_payload.encode("utf-8")).hexdigest()
    attestation_hash = hashlib.sha256(
        f"{report_hash}:{portfolio_hash}:{chain_id}".encode("utf-8")
    ).hexdigest()
    return AttestationDraft(
        chain_id=chain_id,
        report_hash=report_hash,
        portfolio_hash=portfolio_hash,
        attestation_hash=attestation_hash,
        network=network,
        contract_address=contract_address,
        explorer_url=(
            address_url(chain_config, network, contract_address)
            if contract_address
            else explorer_url
        ),
        ready=bool(contract_address),
    )


def _compute_evidence_hash(evidence: list[EvidenceItem]) -> str:
    payload = [
        {
            "asset_id": item.asset_id,
            "source_url": item.source_url,
            "summary": item.summary,
            "contract_address": item.contract_address,
            "proof_type": item.proof_type,
        }
        for item in evidence
    ]
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


def _build_provisional_execution_plan(
    *,
    working_context: RwaIntakeContext,
    tx_draft: TxDraft,
    warnings: list[str],
    eligibility: list[EligibilityDecision],
    attestation_draft: AttestationDraft,
) -> ExecutionPlan:
    steps = [
        ExecutionStep(
            step_index=index,
            title=step.title,
            description=step.description,
            step_type=step.action_type,
            route_kind="erc20" if tx_draft.can_execute_onchain else "issuer_portal",
            target_contract=step.target_contract,
            explorer_url=step.explorer_url,
            chain_id=tx_draft.chain_id,
            estimated_fee_usd=step.estimated_fee_usd,
            warnings=[step.caution] if step.caution else [],
            status="planned",
        )
        for index, step in enumerate(tx_draft.steps, start=1)
    ]
    blocked = [
        reason
        for decision in eligibility
        if decision.status == decision.status.BLOCKED
        for reason in (decision.reasons + decision.missing_requirements)
    ]
    if attestation_draft.contract_address:
        steps.append(
            ExecutionStep(
                step_index=len(steps) + 1,
                title="Anchor report onchain",
                description="Write the report and execution plan integrity hashes into the Plan Registry flow.",
                step_type="attestation",
                route_kind="erc20",
                target_contract=attestation_draft.contract_address,
                explorer_url=attestation_draft.explorer_url,
                chain_id=attestation_draft.chain_id,
                estimated_fee_usd=1.1,
                warnings=["Attestation confirms integrity and provenance, not settlement finality."],
                status="planned",
            )
        )

    plan = ExecutionPlan(
        wallet_address=working_context.wallet_address,
        safe_address=working_context.safe_address,
        source_chain=working_context.source_chain or working_context.wallet_network or "hashkey",
        source_asset=working_context.source_asset or working_context.base_currency,
        target_asset=next((decision.asset_id for decision in eligibility if decision.status != decision.status.BLOCKED), ""),
        ticket_size=working_context.ticket_size or working_context.investment_amount,
        status=ExecutionLifecycleStatus.PREPARED,
        quote=ExecutionQuote(
            source_asset=working_context.source_asset or working_context.base_currency,
            target_asset=next((decision.asset_id for decision in eligibility if decision.status != decision.status.BLOCKED), ""),
            amount_in=working_context.ticket_size or working_context.investment_amount,
            expected_amount_out=working_context.ticket_size or working_context.investment_amount,
            fee_amount=round(tx_draft.total_estimated_fee_usd, 6),
            fee_bps=0,
            gas_estimate=0,
            gas_estimate_usd=round(tx_draft.total_estimated_fee_usd, 6),
            eta_seconds=90,
            route_type="erc20" if tx_draft.can_execute_onchain else "issuer_portal",
            warnings=list(tx_draft.risk_warnings),
        ),
        warnings=list(warnings),
        simulation_warnings=list(tx_draft.risk_warnings),
        compliance_blockers=blocked,
        steps=steps,
        eligibility=eligibility,
        can_execute_onchain=tx_draft.can_execute_onchain,
    )
    plan.plan_hash = hashlib.sha256(
        json.dumps(plan.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return plan


def _recommendation_lines(
    context: RwaIntakeContext,
    allocations: list[PortfolioAllocation],
    *,
    locale: str = "zh",
) -> list[str]:
    top_allocations = [allocation for allocation in allocations if allocation.target_weight_pct > 0][:3]
    recommendations = [
        text_for_locale(
            locale,
            f"先按 {context.holding_period_days} 天持有期审查退出节奏，不满足流动性约束的资产直接剔除。",
            f"Start by reviewing exits against the {context.holding_period_days}-day hold; assets that violate the liquidity constraint should be removed first.",
        ),
    ]
    for allocation in top_allocations:
        recommendations.append(
            text_for_locale(
                locale,
                f"{allocation.asset_name} 建议权重 {allocation.target_weight_pct:.1f}%：{allocation.rationale}",
                f"{allocation.asset_name} suggested weight {allocation.target_weight_pct:.1f}%: {allocation.rationale}",
            )
        )
    if any(allocation.blocked_reason for allocation in allocations):
        recommendations.append(
            text_for_locale(
                locale,
                "对存在 KYC 或准入门槛的资产，先确认资格，再做收益比较。",
                "For assets with KYC or access gating, confirm eligibility before comparing yield.",
            )
        )
    return recommendations


def _open_questions(
    context: RwaIntakeContext,
    allocations: list[PortfolioAllocation],
    *,
    locale: str = "zh",
) -> list[str]:
    questions: list[str] = []
    if not context.wallet_address:
        questions.append(
            text_for_locale(
                locale,
                "钱包地址尚未提供，当前只能生成可执行草案，不能直接完成链上交互。",
                "No wallet address was provided, so the system can only generate an execution draft rather than complete onchain actions directly.",
            )
        )
    if any(allocation.blocked_reason for allocation in allocations):
        questions.append(
            text_for_locale(
                locale,
                "部分资产因 KYC 等级不足被降权或剔除，需确认链上 KYC/SBT 的真实资格状态。",
                "Some assets were down-weighted or removed because KYC level appears insufficient; confirm the real onchain KYC/SBT status.",
            )
        )
    if context.liquidity_need == LiquidityNeed.INSTANT:
        questions.append(
            text_for_locale(
                locale,
                "你要求高流动性，任何 T+N 资产都应重新核对赎回闸门和配额。",
                "You requested high liquidity, so any T+N asset should be re-checked for redemption gates and quota limits.",
            )
        )
    return questions


def _asset_summary_lines(
    asset_cards: Iterable[AssetAnalysisCard],
    simulations: dict[str, HoldingPeriodSimulation],
    *,
    locale: str = "zh",
) -> list[str]:
    lines: list[str] = []
    for card in asset_cards:
        simulation = simulations[card.asset_id]
        lines.append(
            text_for_locale(
                locale,
                (
                    f"- **{card.name}**: 基准收益 {simulation.return_pct_base:.2f}%，"
                    f"综合风险 {card.risk_vector.overall:.1f}/100，"
                    f"退出 {('T+0' if card.exit_days == 0 else f'T+{card.exit_days}')}"
                ),
                (
                    f"- **{card.name}**: base return {simulation.return_pct_base:.2f}%, "
                    f"overall risk {card.risk_vector.overall:.1f}/100, "
                    f"exit {('T+0' if card.exit_days == 0 else f'T+{card.exit_days}')}"
                ),
            )
        )
    return lines


def _classify_evidence_source(evidence: EvidenceItem) -> DataSourceTag:
    """Classify an evidence item's data source tag based on its metadata."""
    url = (evidence.source_url or "").lower()
    name = (evidence.source_name or "").lower()
    if any(k in url for k in ("explorer", "blockscout", "etherscan", "hashscan")):
        return DataSourceTag.ONCHAIN_VERIFIED
    if any(k in name for k in ("oracle", "apro", "chainlink", "supra")):
        return DataSourceTag.ORACLE_FED
    if evidence.source_type == "user":
        return DataSourceTag.USER_ASSUMPTION
    if evidence.source_type == "web" or any(k in url for k in ("defillama", "brave.com", "coingecko", "reuters")):
        return DataSourceTag.THIRD_PARTY_SOURCE
    if any(k in url for k in ("prnewswire", "newsroom", "issuer", "docs.hashkey")):
        return DataSourceTag.ISSUER_DISCLOSED
    return DataSourceTag.MODEL_INFERENCE


def build_rwa_report(
    *,
    mode: AnalysisMode,
    problem_statement: str,
    context: RwaIntakeContext,
    chain_config: HashKeyChainConfig,
    asset_library: list[AssetTemplate],
    locale: str = "zh",
    oracle_snapshots: list[OracleSnapshot] | None = None,
) -> tuple[AnalysisReport, list[EvidenceItem]]:
    working_context = context.model_copy(deep=True)
    demo_scenario = (
        get_demo_scenario(working_context.demo_scenario_id, locale=locale)
        if working_context.demo_mode and working_context.demo_scenario_id
        else None
    )
    if demo_scenario is not None:
        working_context.preferred_asset_ids = list(demo_scenario.featured_asset_ids)
        working_context.analysis_seed = demo_scenario.analysis_seed
        working_context.demo_mode = True
        working_context.demo_scenario_id = demo_scenario.scenario_id

    selected_assets = resolve_selected_assets(mode, problem_statement, working_context, asset_library)
    if demo_scenario is not None:
        selected_ids = set(demo_scenario.featured_asset_ids)
        ordered_assets = {asset.asset_id: asset for asset in asset_library if asset.asset_id in selected_ids}
        selected_assets = [
            ordered_assets[asset_id]
            for asset_id in demo_scenario.featured_asset_ids
            if asset_id in ordered_assets
        ]

    resolved_report_network = _report_network(working_context, chain_config)
    evidence_reference_time = DEMO_REFERENCE_TIME if demo_scenario is not None else None
    kyc_snapshot: KycOnchainResult | None = None

    if demo_scenario is not None:
        kyc_snapshot = build_demo_kyc_snapshot(
            chain_config,
            demo_scenario,
            network=resolved_report_network,
            wallet_address=working_context.wallet_address,
        )
        working_context.wallet_kyc_level_onchain = kyc_snapshot.level
        working_context.wallet_kyc_verified = kyc_snapshot.is_human
        if oracle_snapshots is None:
            oracle_snapshots = build_demo_oracle_snapshots(
                chain_config,
                demo_scenario.scenario_id,
                network=resolved_report_network,
            )
    elif working_context.wallet_address:
        try:
            from app.rwa.kyc_service import read_kyc_from_chain
            kyc_snapshot = read_kyc_from_chain(
                chain_config,
                working_context.wallet_address,
                working_context.wallet_network or resolved_report_network,
            )
            working_context.wallet_kyc_level_onchain = kyc_snapshot.level
            working_context.wallet_kyc_verified = kyc_snapshot.is_human
            working_context.wallet_network = working_context.wallet_network or resolved_report_network
            logger.info(
                "KYC snapshot: status=%s level=%d for %s on %s",
                kyc_snapshot.status.value,
                kyc_snapshot.level,
                working_context.wallet_address,
                working_context.wallet_network,
            )
        except Exception as exc:
            logger.warning("KYC backend read failed, using intake: %s", exc)

    if oracle_snapshots is None:
        try:
            from app.rwa.oracle_service import fetch_oracle_snapshots
            oracle_snapshots = fetch_oracle_snapshots(
                chain_config,
                network=resolved_report_network,
            )
        except Exception as exc:
            logger.warning("Oracle fetch failed for report: %s", exc)
            oracle_snapshots = []

    simulations = [
        simulate_holding(
            asset,
            working_context.investment_amount,
            working_context.holding_period_days,
            locale=locale,
            analysis_seed=working_context.analysis_seed,
        )
        for asset in selected_assets
    ]
    asset_cards = build_asset_cards(selected_assets, working_context, simulations, locale=locale)
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    allocations = recommend_allocations(working_context, asset_cards, locale=locale)
    asset_lookup = {asset.asset_id: asset for asset in selected_assets}
    tx_draft = build_tx_draft(
        working_context,
        allocations,
        asset_lookup,
        chain_config,
        locale=locale,
    )
    evidence = [
        item
        for asset in selected_assets
        for item in build_catalog_evidence(
            asset,
            locale=locale,
            fetched_at=evidence_reference_time,
        )
    ]
    for item in evidence:
        item.source_tag = _classify_evidence_source(item)
    evidence = enrich_report_evidence(evidence, reference_time=evidence_reference_time)
    evidence_governance = build_evidence_governance(
        evidence,
        selected_assets,
        reference_time=evidence_reference_time,
    )
    eligibility_service = EligibilityService()
    eligibility_summary = [
        eligibility_service.evaluate_asset(
            asset,
            kyc_snapshot=kyc_snapshot,
            kyc_level=working_context.kyc_level or working_context.minimum_kyc_level,
            investor_type=working_context.investor_type,
            jurisdiction=working_context.jurisdiction,
            ticket_size=working_context.ticket_size or working_context.investment_amount,
            source_asset=working_context.source_asset or working_context.base_currency,
            source_chain=working_context.source_chain or working_context.wallet_network,
        )
        for asset in selected_assets
    ]
    execution_asset_ids = {
        decision.asset_id
        for decision in eligibility_summary
        if decision.status != decision.status.BLOCKED
    }
    for item in evidence:
        item.included_in_execution_plan = item.asset_id in execution_asset_ids
        if item.included_in_execution_plan:
            item.execution_step_ids = ["provisional-execution"]
    option_profiles = build_option_profiles(asset_cards, simulations, locale=locale)
    tables = build_comparison_tables(asset_cards, simulations, locale=locale)
    comparison_matrix = build_comparison_matrix(
        working_context,
        selected_assets,
        asset_cards,
        simulations,
        locale=locale,
    )
    recommendation_reason = build_recommendation_reason(
        working_context,
        selected_assets,
        asset_cards,
        allocations,
        locale=locale,
    )
    action_intents = build_action_intents(
        working_context,
        selected_assets,
        allocations,
        locale=locale,
    )
    warnings = build_report_warnings(
        working_context,
        selected_assets,
        allocations,
        evidence_warning=evidence_governance.weak_evidence_warning,
        locale=locale,
    )
    unknowns = build_report_unknowns(working_context, selected_assets, locale=locale)
    recommendations = _recommendation_lines(working_context, allocations, locale=locale)
    open_questions = _open_questions(working_context, allocations, locale=locale)
    source_provenance_refs = build_source_provenance_refs(selected_assets)
    top_choice = next(
        (allocation for allocation in allocations if allocation.target_weight_pct > 0),
        None,
    )
    summary = text_for_locale(
        locale,
        (
            f"当前更适合以 {top_choice.asset_name} 作为核心配置腿，并围绕 {working_context.holding_period_days} 天持有期管理流动性、KYC 和赎回风险。"
            if top_choice
            else "当前更适合先确认准入门槛和退出条款，再决定是否进入 RWA 配置。"
        ),
        (
            f"The current setup is best anchored by {top_choice.asset_name} as the core sleeve, with liquidity, KYC, and redemption risk managed around a {working_context.holding_period_days}-day hold."
            if top_choice
            else "The safer posture is to confirm access gating and redemption terms before entering an RWA allocation."
        ),
    )
    if demo_scenario is not None:
        summary = text_for_locale(
            locale,
            f"[{demo_scenario.demo_label}] {summary}",
            f"[{demo_scenario.demo_label}] {summary}",
        )

    attestation_draft = build_attestation_draft(summary, allocations, chain_config)
    confidence_band = build_confidence_band(
        simulations,
        allocations,
        note="Weighted from the holding-period simulation bands of the suggested allocation sleeves.",
    )
    oracle_stress_score = build_oracle_stress_score(asset_cards, allocations)
    reserve_backing_summary = build_reserve_backing_summary(selected_assets, source_provenance_refs)
    stress_scenarios = build_stress_scenarios(asset_cards, allocations, source_provenance_refs)
    effective_kyc_level = _effective_kyc_level(working_context)
    assumptions = [
        text_for_locale(
            locale,
            f"默认投资本金为 {working_context.investment_amount:.2f} {working_context.base_currency}",
            f"Base principal assumed: {working_context.investment_amount:.2f} {working_context.base_currency}",
        ),
        text_for_locale(
            locale,
            f"持有期按 {working_context.holding_period_days} 天估算，收益为情景模拟而非预测。",
            f"The holding period is modeled over {working_context.holding_period_days} days and returns are scenario outputs rather than forecasts.",
        ),
        text_for_locale(
            locale,
            "RWA 资产的准入、申赎和托管条款以发行人实际文件为准。",
            "Issuer documents remain the source of truth for RWA eligibility, redemption, and custody terms.",
        ),
        text_for_locale(
            locale,
            "这不是金融建议，也不是法律、税务或合规意见。",
            "This is not financial advice and not legal, tax, or compliance advice.",
        ),
        text_for_locale(
            locale,
            (
                f"当前采用的有效 KYC 等级为 L{effective_kyc_level}，该值在已连接钱包时优先采用链上 KYC/SBT 快照。"
                if working_context.wallet_address or demo_scenario is not None
                else f"当前按用户声明的 KYC 约束 L{effective_kyc_level} 进行筛选。"
            ),
            (
                f"The effective KYC level used in this report is L{effective_kyc_level}; an onchain KYC/SBT snapshot takes precedence when available."
                if working_context.wallet_address or demo_scenario is not None
                else f"The current screening uses the user-declared KYC constraint of L{effective_kyc_level}."
            ),
        ),
        text_for_locale(
            locale,
            f"报告使用的链上数据网络为 {_network_label(resolved_report_network, locale=locale)}。",
            f"The report uses {_network_label(resolved_report_network, locale='en')} as the active onchain data network.",
        ),
    ]
    if demo_scenario is not None:
        assumptions.append(
            text_for_locale(
                locale,
                f"当前处于 {demo_scenario.demo_label}，使用固定资产池、固定快照和固定随机种子。",
                f"This run is in {demo_scenario.demo_label} mode with a fixed asset universe, fixed snapshots, and a fixed random seed.",
            )
        )

    markdown = "\n".join(
        [
            text_for_locale(locale, "## 决策结论", "## Decision posture"),
            summary,
            "",
            text_for_locale(locale, "## 资产对比", "## Asset comparison"),
            *_asset_summary_lines(asset_cards, simulation_map, locale=locale),
            "",
            text_for_locale(locale, "## 组合建议", "## Allocation guidance"),
            *[f"- {item}" for item in recommendations],
            "",
            text_for_locale(locale, "## 为什么推荐这些资产", "## Why this recommendation"),
            *[
                f"- {driver.title}: {driver.detail}"
                for driver in recommendation_reason.top_drivers
            ],
            "",
            text_for_locale(locale, "## 风险拆解", "## Risk decomposition"),
            text_for_locale(
                locale,
                "- RiskVector 统一覆盖 Market、Liquidity、Peg/Redemption、Issuer/Custody、Smart Contract、Oracle、Compliance 七类风险。",
                "- RiskVector consistently covers seven dimensions: Market, Liquidity, Peg/Redemption, Issuer/Custody, Smart Contract, Oracle, and Compliance.",
            ),
            text_for_locale(
                locale,
                "- 稳定币不只看 APY，还要显式看待赎回信心和脱锚压力测试。",
                "- Stablecoins should not be ranked by APY alone; redemption confidence and depeg stress must stay explicit.",
            ),
            text_for_locale(
                locale,
                "- RWA 类资产更应重视发行人、托管和法律结构，而不是只看收益率。",
                "- For RWAs, issuer quality, custody, and legal structure matter more than headline yield alone.",
            ),
            "",
            text_for_locale(locale, "## 执行与存证", "## Execution and attestation"),
            text_for_locale(
                locale,
                f"- 当前执行网络: {_network_label(resolved_report_network, locale=locale)} ({chain_id_for(chain_config, resolved_report_network)})",
                f"- Active execution network: {_network_label(resolved_report_network, locale='en')} ({chain_id_for(chain_config, resolved_report_network)})",
            ),
            text_for_locale(
                locale,
                f"- 存证网络: HashKey Chain {attestation_draft.network.title()} ({attestation_draft.chain_id})",
                f"- Attestation network: HashKey Chain {attestation_draft.network.title()} ({attestation_draft.chain_id})",
            ),
            text_for_locale(
                locale,
                f"- Plan Registry 地址: {attestation_draft.contract_address or '未配置，当前仅生成离线存证草案'}",
                f"- Plan Registry address: {attestation_draft.contract_address or 'Not configured; only an offline attestation draft can be generated'}",
            ),
            "",
            text_for_locale(locale, "## 假设与未知项", "## Assumptions and unknowns"),
            *[f"- {item}" for item in assumptions],
            *[f"- {item}" for item in unknowns],
            "",
            text_for_locale(locale, "## 重要提醒", "## Key warnings"),
            *[f"- {item}" for item in warnings],
        ]
    )

    report = AnalysisReport(
        summary=summary,
        assumptions=assumptions,
        unknowns=unknowns,
        warnings=warnings,
        recommendations=recommendations,
        open_questions=open_questions,
        markdown=markdown,
        confidence_band=confidence_band,
        stress_scenarios=stress_scenarios,
        reserve_backing_summary=reserve_backing_summary,
        source_provenance_refs=source_provenance_refs,
        oracle_stress_score=oracle_stress_score,
        tables=tables,
        option_profiles=option_profiles,
        chain_config=chain_config,
        kyc_snapshot=kyc_snapshot,
        market_snapshots=[
            MarketDataSnapshot(**snap.model_dump())
            for snap in (oracle_snapshots or [])
        ],
        asset_cards=asset_cards,
        simulations=simulations,
        recommended_allocations=allocations,
        comparison_matrix=comparison_matrix,
        recommendation_reason=recommendation_reason,
        action_intents=action_intents,
        evidence_governance=evidence_governance,
        methodology_references=methodology_references(),
        tx_draft=tx_draft,
        eligibility_summary=eligibility_summary,
    )
    report.attestation_draft = build_attestation_draft(markdown, allocations, chain_config)
    report.attestation_draft.evidence_hash = _compute_evidence_hash(evidence)
    report.execution_plan = _build_provisional_execution_plan(
        working_context=working_context,
        tx_draft=tx_draft,
        warnings=warnings,
        eligibility=eligibility_summary,
        attestation_draft=report.attestation_draft,
    )
    report.attestation_draft.execution_plan_hash = report.execution_plan.plan_hash

    return report, evidence
