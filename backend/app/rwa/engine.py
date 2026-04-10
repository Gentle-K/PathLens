from __future__ import annotations

import hashlib
import json
import math
import random
from statistics import mean
from typing import Iterable
from urllib.parse import urlparse

import logging

from app.domain.models import AnalysisMode, AnalysisReport, EvidenceItem, OptionProfile, ReportTable
from app.domain.rwa import (
    AssetAnalysisCard,
    AssetTemplate,
    AssetType,
    AttestationDraft,
    DataSourceTag,
    HashKeyChainConfig,
    HoldingPeriodSimulation,
    LiquidityNeed,
    MarketDataSnapshot,
    OracleSnapshot,
    PortfolioAllocation,
    RiskTolerance,
    RiskVector,
    RwaIntakeContext,
    SimulationPathPoint,
    TxDraft,
    TxDraftStep,
)
from app.i18n import text_for_locale
from app.rwa.explorer_service import address_url, oracle_docs_url

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
    market = 30.0
    market += 50.0 * sigmoid01((asset.price_volatility - 0.25) / 0.15)
    market += 40.0 * sigmoid01((abs(asset.max_drawdown_180d) - 0.15) / 0.10)
    market = clamp(market)

    liquidity = 20.0
    if asset.avg_daily_volume_usd > 0:
        liquidity += 60.0 * sigmoid01((100_000 - asset.avg_daily_volume_usd) / 500_000)
    liquidity += clamp(5.0 * asset.redemption_days, 0, 40)
    liquidity += clamp(2.0 * asset.lockup_days, 0, 40)
    liquidity = clamp(liquidity)

    peg_redemption = 0.0
    if asset.depeg_events_90d is not None and asset.worst_depeg_bps_90d is not None:
        peg_redemption = 20.0 + 10.0 * asset.depeg_events_90d + 0.08 * asset.worst_depeg_bps_90d
    peg_redemption = clamp(peg_redemption)

    issuer_custody = (
        80.0 * (1 - asset.issuer_disclosure_score)
        + 60.0 * (1 - asset.custody_disclosure_score)
        + 40.0 * (1 - asset.audit_disclosure_score)
    )
    issuer_custody = clamp(issuer_custody)

    smart_contract = 10.0
    smart_contract += 25.0 if asset.contract_is_upgradeable else 0.0
    smart_contract += 25.0 if asset.has_admin_key else 0.0
    smart_contract = clamp(smart_contract)

    oracle_dependency = clamp(60.0 * sigmoid01((2 - asset.oracle_count) / 0.8))

    compliance_access = 0.0
    if asset.requires_kyc_level is not None and asset.requires_kyc_level > 0:
        compliance_access = clamp(10.0 * asset.requires_kyc_level + 20.0)

    overall = mean(
        [
            market,
            liquidity,
            peg_redemption,
            issuer_custody,
            smart_contract,
            oracle_dependency,
            compliance_access,
        ]
    )

    return RiskVector(
        asset_id=asset.asset_id,
        asset_name=asset.name,
        market=round(market, 1),
        liquidity=round(liquidity, 1),
        peg_redemption=round(peg_redemption, 1),
        issuer_custody=round(issuer_custody, 1),
        smart_contract=round(smart_contract, 1),
        oracle_dependency=round(oracle_dependency, 1),
        compliance_access=round(compliance_access, 1),
        overall=round(overall, 1),
    )


def _checkpoint_days(holding_period_days: int) -> list[int]:
    points = {1, max(1, holding_period_days // 5), max(1, holding_period_days // 2), holding_period_days}
    return sorted(points)


def simulate_holding(
    asset: AssetTemplate,
    investment_amount: float,
    holding_period_days: int,
    *,
    locale: str = "zh",
) -> HoldingPeriodSimulation:
    seed_source = f"{asset.asset_id}:{investment_amount:.2f}:{holding_period_days}"
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
        simulate_holding(asset, investment_amount, days, locale=locale)
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


def _source_name(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return hostname.replace("www.", "") or "source"


def build_catalog_evidence(
    asset: AssetTemplate,
    *,
    locale: str = "zh",
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
                title=text_for_locale(
                    locale,
                    f"{asset.name} 依据 {index}",
                    f"{asset.name} reference {index}",
                ),
                source_url=url,
                source_name=_source_name(url),
                summary=text_for_locale(
                    locale,
                    f"{asset.name} 的模板基于官方网络文档、Token Contracts、KYC 说明或发行方披露构建。",
                    f"The {asset.name} template is grounded in official network docs, token-contract references, KYC materials, or issuer disclosures.",
                ),
                extracted_facts=facts,
                confidence=0.82,
            )
        )
    return evidence_items


def build_asset_cards(
    assets: list[AssetTemplate],
    context: RwaIntakeContext,
) -> list[AssetAnalysisCard]:
    cards: list[AssetAnalysisCard] = []
    for asset in assets:
        risk_vector = score_risk(asset)
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
                risk_vector=risk_vector,
                metadata={
                    "minimum_ticket_usd": asset.minimum_ticket_usd,
                    "oracle_count": asset.oracle_count,
                    "lockup_days": asset.lockup_days,
                    "oracle_sources": asset.oracle_sources,
                    "pricing_source_label": "APRO Oracle" if asset.oracle_count else "Issuer / disclosure",
                    "source_url": asset.primary_source_url or (asset.evidence_urls[0] if asset.evidence_urls else ""),
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


def build_tx_draft(
    context: RwaIntakeContext,
    allocations: list[PortfolioAllocation],
    asset_lookup: dict[str, AssetTemplate],
    chain_config: HashKeyChainConfig,
    *,
    locale: str = "zh",
) -> TxDraft:
    attestation_network, _, attestation_contract, attestation_explorer = _resolve_attestation_network(
        chain_config
    )
    steps: list[TxDraftStep] = [
        TxDraftStep(
            step=1,
            title=text_for_locale(locale, "切换到 HashKey Chain", "Switch to HashKey Chain"),
            description=text_for_locale(
                locale,
                "将钱包网络切换到 HashKey Chain 主网，确认 RPC 与 Explorer 参数正确。",
                "Switch the wallet network to HashKey Chain mainnet and verify the RPC and explorer settings.",
            ),
            action_type="switch_network",
            explorer_url=chain_config.mainnet_explorer_url,
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
                    explorer_url=f"{chain_config.mainnet_explorer_url}/address/{asset.contract_address}",
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
                    f"{attestation_explorer}/address/{attestation_contract}"
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
        chain_id=chain_config.mainnet_chain_id,
        chain_name="HashKey Chain Mainnet",
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
        explorer_url=explorer_url,
        ready=bool(contract_address),
    )


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
    selected_assets = resolve_selected_assets(mode, problem_statement, context, asset_library)
    asset_cards = build_asset_cards(selected_assets, context)
    effective_kyc_level = _effective_kyc_level(context)

    # Try backend KYC override when wallet is connected
    if context.wallet_address and context.wallet_network:
        try:
            from app.rwa.kyc_service import read_kyc_from_chain
            kyc_result = read_kyc_from_chain(
                chain_config,
                context.wallet_address,
                context.wallet_network or "testnet",
            )
            if kyc_result.is_human and kyc_result.level > 0:
                context.wallet_kyc_level_onchain = kyc_result.level
                context.wallet_kyc_verified = True
                effective_kyc_level = max(effective_kyc_level, kyc_result.level)
                logger.info(
                    "KYC override: on-chain level %d for %s",
                    kyc_result.level,
                    context.wallet_address,
                )
        except Exception as exc:
            logger.warning("KYC backend read failed, using intake: %s", exc)

    # Fetch oracle snapshots if not provided
    if oracle_snapshots is None:
        try:
            from app.rwa.oracle_service import fetch_oracle_snapshots
            oracle_snapshots = fetch_oracle_snapshots(
                chain_config,
                network=chain_config.default_execution_network or "testnet",
            )
        except Exception as exc:
            logger.warning("Oracle fetch failed for report: %s", exc)
            oracle_snapshots = []

    simulations = [
        simulate_holding(
            asset,
            context.investment_amount,
            context.holding_period_days,
            locale=locale,
        )
        for asset in selected_assets
    ]
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    allocations = recommend_allocations(context, asset_cards, locale=locale)
    asset_lookup = {asset.asset_id: asset for asset in selected_assets}
    tx_draft = build_tx_draft(
        context,
        allocations,
        asset_lookup,
        chain_config,
        locale=locale,
    )
    evidence = [
        item
        for asset in selected_assets
        for item in build_catalog_evidence(asset, locale=locale)
    ]
    option_profiles = build_option_profiles(asset_cards, simulations, locale=locale)
    tables = build_comparison_tables(asset_cards, simulations, locale=locale)
    recommendations = _recommendation_lines(context, allocations, locale=locale)
    open_questions = _open_questions(context, allocations, locale=locale)
    top_choice = next(
        (allocation for allocation in allocations if allocation.target_weight_pct > 0),
        None,
    )
    summary = text_for_locale(
        locale,
        (
            f"当前更适合以 {top_choice.asset_name} 作为核心配置腿，并围绕 {context.holding_period_days} 天持有期管理流动性、KYC 和赎回风险。"
            if top_choice
            else "当前更适合先确认准入门槛和退出条款，再决定是否进入 RWA 配置。"
        ),
        (
            f"The current setup is best anchored by {top_choice.asset_name} as the core sleeve, with liquidity, KYC, and redemption risk managed around a {context.holding_period_days}-day hold."
            if top_choice
            else "The safer posture is to confirm access gating and redemption terms before entering an RWA allocation."
        ),
    )
    attestation_draft = build_attestation_draft(summary, allocations, chain_config)

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
                f"- 当前执行网络: HashKey Chain Mainnet ({chain_config.mainnet_chain_id})",
                f"- Active execution network: HashKey Chain Mainnet ({chain_config.mainnet_chain_id})",
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
        ]
    )

    report = AnalysisReport(
        summary=summary,
        assumptions=[
            text_for_locale(
                locale,
                f"默认投资本金为 {context.investment_amount:.2f} {context.base_currency}",
                f"Base principal assumed: {context.investment_amount:.2f} {context.base_currency}",
            ),
            text_for_locale(
                locale,
                f"持有期按 {context.holding_period_days} 天估算，收益为情景模拟而非预测。",
                f"The holding period is modeled over {context.holding_period_days} days and returns are scenario outputs rather than forecasts.",
            ),
            text_for_locale(
                locale,
                "RWA 资产的准入、申赎和托管条款以发行人实际文件为准。",
                "Issuer documents remain the source of truth for RWA eligibility, redemption, and custody terms.",
            ),
            text_for_locale(
                locale,
                (
                    f"当前采用的有效 KYC 等级为 L{effective_kyc_level}，该值在已连接钱包时优先采用链上 KYC/SBT 快照。"
                    if context.wallet_address
                    else f"当前按用户声明的 KYC 约束 L{effective_kyc_level} 进行筛选。"
                ),
                (
                    f"The effective KYC level used in this report is L{effective_kyc_level}; when a wallet is connected, the onchain KYC/SBT snapshot takes precedence."
                    if context.wallet_address
                    else f"The current screening uses the user-declared KYC constraint of L{effective_kyc_level}."
                ),
            ),
        ],
        recommendations=recommendations,
        open_questions=open_questions,
        markdown=markdown,
        tables=tables,
        option_profiles=option_profiles,
        chain_config=chain_config,
        market_snapshots=[
            MarketDataSnapshot(**snap.model_dump())
            for snap in (oracle_snapshots or [])
        ],
        asset_cards=asset_cards,
        simulations=simulations,
        recommended_allocations=allocations,
        tx_draft=tx_draft,
    )
    report.attestation_draft = build_attestation_draft(markdown, allocations, chain_config)

    # Classify evidence source tags
    for item in evidence:
        item.source_tag = _classify_evidence_source(item)

    return report, evidence
