from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import mean, pstdev

from app.domain.rwa import (
    AssetAnalysisCard,
    AssetTemplate,
    AssetType,
    HoldingPeriodSimulation,
    LiquidityNeed,
    MethodologyReference,
    RiskBreakdownItem,
    RiskTolerance,
    RiskVector,
    RwaIntakeContext,
)

DIMENSION_ORDER = (
    "market",
    "liquidity",
    "peg_redemption",
    "issuer_custody",
    "smart_contract",
    "oracle_dependency",
    "compliance_access",
)
DIMENSION_LABELS = {
    "market": "Market volatility",
    "liquidity": "Liquidity friction",
    "peg_redemption": "Tail loss and redemption stress",
    "issuer_custody": "Issuer and custody transparency",
    "smart_contract": "Contract governance",
    "oracle_dependency": "Oracle dependency",
    "compliance_access": "Eligibility and KYC gating",
}
FALLBACK_BOUNDS = {
    "market": (1.0, 65.0),
    "liquidity": (0.0, 120.0),
    "peg_redemption": (0.0, 45.0),
    "issuer_custody": (0.0, 100.0),
    "smart_contract": (0.0, 85.0),
    "oracle_dependency": (0.0, 85.0),
    "compliance_access": (0.0, 95.0),
}
AHP_PRIORS = {
    RiskTolerance.CONSERVATIVE: {
        "market": 0.13,
        "liquidity": 0.18,
        "peg_redemption": 0.18,
        "issuer_custody": 0.17,
        "smart_contract": 0.11,
        "oracle_dependency": 0.09,
        "compliance_access": 0.14,
    },
    RiskTolerance.BALANCED: {
        "market": 0.16,
        "liquidity": 0.16,
        "peg_redemption": 0.17,
        "issuer_custody": 0.16,
        "smart_contract": 0.12,
        "oracle_dependency": 0.10,
        "compliance_access": 0.13,
    },
    RiskTolerance.AGGRESSIVE: {
        "market": 0.19,
        "liquidity": 0.13,
        "peg_redemption": 0.19,
        "issuer_custody": 0.15,
        "smart_contract": 0.13,
        "oracle_dependency": 0.09,
        "compliance_access": 0.12,
    },
}
TYPE_ALIGNMENT = {
    RiskTolerance.CONSERVATIVE: {
        AssetType.STABLECOIN: 1.10,
        AssetType.MMF: 1.06,
        AssetType.PRECIOUS_METAL: 0.94,
        AssetType.REAL_ESTATE: 0.80,
        AssetType.BENCHMARK: 0.74,
        AssetType.STOCKS: 0.70,
    },
    RiskTolerance.BALANCED: {
        AssetType.STABLECOIN: 1.00,
        AssetType.MMF: 1.02,
        AssetType.PRECIOUS_METAL: 1.02,
        AssetType.REAL_ESTATE: 0.96,
        AssetType.BENCHMARK: 0.94,
        AssetType.STOCKS: 0.88,
    },
    RiskTolerance.AGGRESSIVE: {
        AssetType.STABLECOIN: 0.92,
        AssetType.MMF: 0.95,
        AssetType.PRECIOUS_METAL: 1.02,
        AssetType.REAL_ESTATE: 1.02,
        AssetType.BENCHMARK: 1.10,
        AssetType.STOCKS: 1.05,
    },
}


@dataclass(slots=True)
class RiskProfile:
    risk_vector: RiskVector
    risk_breakdown: list[RiskBreakdownItem]
    risk_data_quality: float
    utility_score: float
    utility_components: dict[str, float]


def _percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered) - 1) * pct
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[int(index)]
    fraction = index - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _winsorize(values: list[float], lower_pct: float = 0.1, upper_pct: float = 0.9) -> list[float]:
    if not values:
        return []
    lower = _percentile(values, lower_pct)
    upper = _percentile(values, upper_pct)
    return [max(lower, min(upper, value)) for value in values]


def _normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    total = sum(max(value, 0.0) for value in weights.values()) or 1.0
    return {key: max(value, 0.0) / total for key, value in weights.items()}


def _safe_corr(left: list[float], right: list[float]) -> float:
    if len(left) < 2 or len(right) < 2:
        return 0.0
    left_mean = mean(left)
    right_mean = mean(right)
    left_var = sum((value - left_mean) ** 2 for value in left)
    right_var = sum((value - right_mean) ** 2 for value in right)
    if left_var <= 1e-9 or right_var <= 1e-9:
        return 0.0
    covariance = sum((lv - left_mean) * (rv - right_mean) for lv, rv in zip(left, right))
    return max(-1.0, min(1.0, covariance / math.sqrt(left_var * right_var)))


def _robust_scale(values_by_asset: dict[str, float], dimension: str) -> dict[str, float]:
    raw_values = list(values_by_asset.values())
    if not raw_values:
        return {}
    winsorized = _winsorize(raw_values)
    win_map = {asset_id: winsorized[index] for index, asset_id in enumerate(values_by_asset.keys())}
    lower = min(winsorized)
    upper = max(winsorized)
    if upper - lower < 1e-9:
        lower, upper = FALLBACK_BOUNDS[dimension]
    return {
        asset_id: round(((value - lower) / max(upper - lower, 1e-9)) * 100, 2)
        for asset_id, value in win_map.items()
    }


def _critic_weights(scores_by_dimension: dict[str, dict[str, float]]) -> dict[str, float]:
    if not scores_by_dimension:
        return {}
    dimension_vectors = {
        dimension: [scores[asset_id] / 100 for asset_id in sorted(scores.keys())]
        for dimension, scores in scores_by_dimension.items()
    }
    critic_scores: dict[str, float] = {}
    for dimension, vector in dimension_vectors.items():
        if len(vector) < 2:
            critic_scores[dimension] = 0.0
            continue
        sigma = pstdev(vector)
        conflict = 0.0
        for other_dimension, other_vector in dimension_vectors.items():
            if other_dimension == dimension:
                continue
            conflict += 1 - _safe_corr(vector, other_vector)
        critic_scores[dimension] = sigma * max(conflict, 0.0)
    return _normalize_weights(critic_scores)


def _blend_weights(
    risk_tolerance: RiskTolerance,
    scores_by_dimension: dict[str, dict[str, float]],
) -> dict[str, float]:
    ahp = AHP_PRIORS[risk_tolerance]
    critic = _critic_weights(scores_by_dimension)
    if not critic or not any(value > 0 for value in critic.values()):
        return _normalize_weights(dict(ahp))
    return _normalize_weights(
        {
            dimension: ahp[dimension] * 0.65 + critic.get(dimension, 0.0) * 0.35
            for dimension in DIMENSION_ORDER
        }
    )


def _data_quality_score(completeness_flags: list[bool]) -> float:
    if not completeness_flags:
        return 0.7
    observed = sum(1 for flag in completeness_flags if flag)
    return round(max(0.35, min(1.0, observed / len(completeness_flags))), 2)


def _raw_dimension_map(
    asset: AssetTemplate,
    simulation: HoldingPeriodSimulation,
    context: RwaIntakeContext,
) -> tuple[dict[str, float], dict[str, list[bool]]]:
    effective_kyc = 0
    if context.wallet_address and context.wallet_kyc_verified is False:
        effective_kyc = 0
    elif context.wallet_address and context.wallet_kyc_level_onchain is not None:
        effective_kyc = max(0, context.wallet_kyc_level_onchain)
    else:
        effective_kyc = max(0, context.minimum_kyc_level)

    disclosure_avg = mean(
        [
            asset.issuer_disclosure_score,
            asset.custody_disclosure_score,
            asset.audit_disclosure_score,
        ]
    )
    volume_term = 0.0
    if asset.avg_daily_volume_usd > 0:
        volume_term = max(0.0, (6.0 - math.log10(max(asset.avg_daily_volume_usd, 1.0))) * 9.0)

    kyc_gap = max(0, (asset.requires_kyc_level or 0) - effective_kyc)

    raw_values = {
        "market": asset.price_volatility * 100 + abs(asset.max_drawdown_180d) * 55,
        "liquidity": asset.redemption_days * 12 + asset.lockup_days * 1.8 + volume_term,
        "peg_redemption": (
            max(abs(simulation.cvar_95_pct), abs(simulation.var_95_pct) * 0.9, abs(asset.max_drawdown_180d) * 100 * 0.8)
            + max(asset.depeg_events_90d or 0, 0) * 3.5
            + max(asset.worst_depeg_bps_90d or 0, 0) / 35
        ),
        "issuer_custody": max(0.0, 100 * (1 - disclosure_avg)),
        "smart_contract": (
            (35 if asset.contract_is_upgradeable else 8)
            + (30 if asset.has_admin_key else 0)
            + (0 if asset.onchain_verified else 10)
        ),
        "oracle_dependency": max(0.0, 70 - asset.oracle_count * 16) + (0 if asset.onchain_verified else 8),
        "compliance_access": (
            (asset.requires_kyc_level or 0) * 16
            + kyc_gap * 22
            + min(asset.minimum_ticket_usd / 2500, 24)
        ),
    }
    data_flags = {
        "market": [asset.price_volatility > 0, asset.max_drawdown_180d >= 0],
        "liquidity": [asset.avg_daily_volume_usd > 0, asset.redemption_days >= 0, asset.lockup_days >= 0],
        "peg_redemption": [simulation.cvar_95_pct != 0 or simulation.var_95_pct != 0, asset.max_drawdown_180d >= 0],
        "issuer_custody": [
            asset.issuer_disclosure_score > 0,
            asset.custody_disclosure_score > 0,
            asset.audit_disclosure_score > 0,
        ],
        "smart_contract": [True],
        "oracle_dependency": [asset.oracle_count >= 0],
        "compliance_access": [True],
    }
    return raw_values, data_flags


def build_risk_profiles(
    assets: list[AssetTemplate],
    simulations: list[HoldingPeriodSimulation],
    context: RwaIntakeContext,
) -> dict[str, RiskProfile]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    raw_dimension_by_asset: dict[str, dict[str, float]] = {}
    data_flags_by_asset: dict[str, dict[str, list[bool]]] = {}

    for asset in assets:
        raw_values, data_flags = _raw_dimension_map(asset, simulation_map[asset.asset_id], context)
        raw_dimension_by_asset[asset.asset_id] = raw_values
        data_flags_by_asset[asset.asset_id] = data_flags

    scores_by_dimension = {
        dimension: _robust_scale(
            {asset.asset_id: raw_dimension_by_asset[asset.asset_id][dimension] for asset in assets},
            dimension,
        )
        for dimension in DIMENSION_ORDER
    }
    final_weights = _blend_weights(context.risk_tolerance, scores_by_dimension)

    profiles: dict[str, RiskProfile] = {}
    for asset in assets:
        asset_id = asset.asset_id
        data_quality = _data_quality_score(
            [
                flag
                for dimension_flags in data_flags_by_asset[asset_id].values()
                for flag in dimension_flags
            ]
        )
        breakdown = [
            RiskBreakdownItem(
                dimension=DIMENSION_LABELS[dimension],
                raw_value=round(raw_dimension_by_asset[asset_id][dimension], 4),
                normalized_score=round(scores_by_dimension[dimension][asset_id], 2),
                weight=round(final_weights[dimension], 4),
                evidence_refs=list(asset.evidence_urls[:2]),
                data_status="live" if data_quality >= 0.8 else "partial",
                note="" if data_quality >= 0.8 else "Data quality discount applied.",
            )
            for dimension in DIMENSION_ORDER
        ]
        weighted_score = sum(
            scores_by_dimension[dimension][asset_id] * final_weights[dimension]
            for dimension in DIMENSION_ORDER
        )
        overall = round(min(100.0, weighted_score + (1 - data_quality) * 12), 1)
        vector = RiskVector(
            asset_id=asset_id,
            asset_name=asset.name,
            market=round(scores_by_dimension["market"][asset_id], 1),
            liquidity=round(scores_by_dimension["liquidity"][asset_id], 1),
            peg_redemption=round(scores_by_dimension["peg_redemption"][asset_id], 1),
            issuer_custody=round(scores_by_dimension["issuer_custody"][asset_id], 1),
            smart_contract=round(scores_by_dimension["smart_contract"][asset_id], 1),
            oracle_dependency=round(scores_by_dimension["oracle_dependency"][asset_id], 1),
            compliance_access=round(scores_by_dimension["compliance_access"][asset_id], 1),
            overall=overall,
        )
        profiles[asset_id] = RiskProfile(
            risk_vector=vector,
            risk_breakdown=breakdown,
            risk_data_quality=data_quality,
            utility_score=0.0,
            utility_components={},
        )

    utilities = _utility_components(assets, simulations, context, profiles)
    for asset in assets:
        profiles[asset.asset_id].utility_score = utilities[asset.asset_id]["utility"]
        profiles[asset.asset_id].utility_components = utilities[asset.asset_id]
    return profiles


def _liquidity_penalty(card_like: AssetTemplate, context: RwaIntakeContext) -> float:
    if context.liquidity_need == LiquidityNeed.INSTANT:
        return card_like.redemption_days * 2.8 + card_like.lockup_days * 0.7
    if context.liquidity_need == LiquidityNeed.T_PLUS_3:
        return max(0, card_like.redemption_days - 3) * 1.9 + card_like.lockup_days * 0.35
    return card_like.redemption_days * 0.4 + card_like.lockup_days * 0.1


def _utility_components(
    assets: list[AssetTemplate],
    simulations: list[HoldingPeriodSimulation],
    context: RwaIntakeContext,
    profiles: dict[str, RiskProfile],
) -> dict[str, dict[str, float]]:
    simulation_map = {simulation.asset_id: simulation for simulation in simulations}
    effective_kyc = (
        0
        if context.wallet_address and context.wallet_kyc_verified is False
        else context.wallet_kyc_level_onchain
        if context.wallet_address and context.wallet_kyc_level_onchain is not None
        else context.minimum_kyc_level
    )
    risk_aversion = {
        RiskTolerance.CONSERVATIVE: 1.35,
        RiskTolerance.BALANCED: 1.05,
        RiskTolerance.AGGRESSIVE: 0.82,
    }[context.risk_tolerance]
    utilities: dict[str, dict[str, float]] = {}

    for asset in assets:
        simulation = simulation_map[asset.asset_id]
        profile = profiles[asset.asset_id]
        net_return = simulation.return_pct_base
        cvar_penalty = abs(simulation.cvar_95_pct) * risk_aversion
        liquidity_penalty = _liquidity_penalty(asset, context)
        fee_penalty = asset.total_cost_bps(context.holding_period_days) / 18
        data_penalty = (1 - profile.risk_data_quality) * 16
        risk_penalty = profile.risk_vector.overall * 0.18 * risk_aversion
        kyc_gap = max(0, (asset.requires_kyc_level or 0) - (effective_kyc or 0))
        kyc_penalty = kyc_gap * 18
        ticket_penalty = 14 if asset.minimum_ticket_usd > context.investment_amount > 0 else 0
        utility = (
            (net_return * 4.2)
            - cvar_penalty
            - liquidity_penalty
            - fee_penalty
            - risk_penalty
            - data_penalty
            - kyc_penalty
            - ticket_penalty
        ) * TYPE_ALIGNMENT[context.risk_tolerance].get(asset.asset_type, 1.0)
        utilities[asset.asset_id] = {
            "utility": round(utility, 4),
            "net_return": round(net_return, 4),
            "cvar_penalty": round(cvar_penalty, 4),
            "liquidity_penalty": round(liquidity_penalty, 4),
            "fee_penalty": round(fee_penalty, 4),
            "data_penalty": round(data_penalty, 4),
            "risk_penalty": round(risk_penalty, 4),
            "kyc_penalty": round(kyc_penalty + ticket_penalty, 4),
        }
    return utilities


def methodology_references() -> list[MethodologyReference]:
    return [
        MethodologyReference(
            key="markowitz-1952",
            title="Markowitz (1952) Portfolio Selection",
            url="https://traders.berkeley.edu/papers/Markowitz.pdf",
            summary="Separates expected return from risk and motivates risk-adjusted utility rather than raw yield ranking.",
        ),
        MethodologyReference(
            key="rockafellar-uryasev-2000",
            title="Rockafellar & Uryasev (2000) Conditional Value-at-Risk",
            url="https://www.risk.net/journal-risk/2161159/optimization-conditional-value-risk",
            summary="Uses CVaR as the tail-loss control so severe downside scenarios remain explicit in the score.",
        ),
        MethodologyReference(
            key="saaty-1987",
            title="Saaty (1987) Analytic Hierarchy Process",
            url="https://www.researchgate.net/publication/247759937_The_Analytic_Hierarchy_Process_-_What_It_Is_and_How_It_Is_Used",
            summary="Provides the explainable prior weights for market, liquidity, governance, oracle, and compliance dimensions.",
        ),
        MethodologyReference(
            key="diakoulaki-1995",
            title="Diakoulaki et al. (1995) CRITIC method",
            url="https://reformship.github.io/pages/1capacity/1model/11evaluation/Determining%20objective%20weights%20in%20multiple%20criteria%20problems%20The%20CRITIC%20method.pdf",
            summary="Adjusts weights using cross-asset contrast and correlation so the model avoids flattening every candidate into the same score band.",
        ),
    ]


def allocation_reason(card: AssetAnalysisCard, utility_components: dict[str, float]) -> str:
    if card.asset_type == AssetType.STABLECOIN:
        return "Provides the liquidity anchor while keeping tail risk comparatively contained."
    if card.asset_type == AssetType.MMF:
        return "Combines modest carry with shorter redemption friction than longer-lockup RWAs."
    if card.asset_type == AssetType.PRECIOUS_METAL:
        return "Adds macro and inflation diversification, but sizing should stay below the liquidity core."
    if utility_components.get("liquidity_penalty", 0) > utility_components.get("cvar_penalty", 0):
        return "Potential return is offset primarily by liquidity friction, so position sizing should stay measured."
    return "Risk-adjusted utility remains investable, but the position should be governed by explicit downside and access controls."
