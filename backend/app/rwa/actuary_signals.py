from __future__ import annotations

from statistics import mean

from app.domain.rwa import (
    AssetAnalysisCard,
    AssetTemplate,
    ConfidenceBand,
    ReserveBackingSummary,
    SourceProvenanceRef,
    StressScenario,
)


def _weight_map(cards: list[AssetAnalysisCard], allocations: list[object]) -> dict[str, float]:
    weights: dict[str, float] = {}
    for allocation in allocations:
        asset_id = getattr(allocation, "asset_id", "")
        weight = float(getattr(allocation, "target_weight_pct", 0.0) or 0.0) / 100
        if asset_id:
            weights[asset_id] = max(weight, 0.0)
    if weights and sum(weights.values()) > 0:
        total = sum(weights.values())
        return {asset_id: value / total for asset_id, value in weights.items()}
    if not cards:
        return {}
    equal = 1 / len(cards)
    return {card.asset_id: equal for card in cards}


def build_confidence_band(
    simulations: list[object],
    allocations: list[object],
    *,
    note: str,
) -> ConfidenceBand | None:
    if not simulations:
        return None
    weight_map = {
        getattr(allocation, "asset_id", ""): float(getattr(allocation, "target_weight_pct", 0.0) or 0.0) / 100
        for allocation in allocations
    }
    total = sum(weight_map.values()) or 1.0
    low = 0.0
    base = 0.0
    high = 0.0
    for simulation in simulations:
        weight = weight_map.get(getattr(simulation, "asset_id", ""), 1 / len(simulations))
        low += float(getattr(simulation, "return_pct_low", 0.0) or 0.0) * weight
        base += float(getattr(simulation, "return_pct_base", 0.0) or 0.0) * weight
        high += float(getattr(simulation, "return_pct_high", 0.0) or 0.0) * weight
    low /= total
    base /= total
    high /= total
    return ConfidenceBand(
        label="Portfolio holding-period return band",
        low=round(low, 2),
        base=round(base, 2),
        high=round(high, 2),
        unit="%",
        confidence_level=0.8,
        note=note,
    )


def build_oracle_stress_score(cards: list[AssetAnalysisCard], allocations: list[object]) -> float | None:
    if not cards:
        return None
    weights = _weight_map(cards, allocations)
    score = 0.0
    for card in cards:
        score += card.risk_vector.oracle_dependency * weights.get(card.asset_id, 0.0)
    return round(score, 2)


def build_reserve_backing_summary(
    assets: list[AssetTemplate],
    refs: list[SourceProvenanceRef],
) -> ReserveBackingSummary | None:
    reserve_assets = [
        asset for asset in assets if asset.asset_type.value in {"stablecoin", "mmf"}
    ]
    if not reserve_assets:
        return None

    disclosure_score = mean(
        (
            asset.issuer_disclosure_score
            + asset.custody_disclosure_score
            + asset.audit_disclosure_score
        ) / 3
        for asset in reserve_assets
    )
    depeg_penalty = mean(float(asset.depeg_events_90d or 0) for asset in reserve_assets) * 3.5
    reserve_quality_score = max(0.0, min(100.0, disclosure_score * 100 - depeg_penalty))
    attestation_status = (
        "official-attestation-linked"
        if any("reserve" in ref.source_kind or "attestation" in ref.source_kind for ref in refs)
        else "issuer-disclosed"
    )
    liquidity_notice = ", ".join(
        f"{asset.symbol}: T+{asset.redemption_days}" if asset.redemption_days else f"{asset.symbol}: T+0"
        for asset in reserve_assets
    )
    return ReserveBackingSummary(
        title="Reserve and redemption summary",
        summary=(
            "Stablecoin and MMF sleeves remain sensitive to reserve transparency, redemption friction, "
            "and disclosure quality rather than headline carry alone."
        ),
        reserve_quality_score=round(reserve_quality_score, 2),
        attestation_status=attestation_status,
        liquidity_notice=liquidity_notice,
        asset_symbols=[asset.symbol for asset in reserve_assets],
        source_provenance_refs=[ref.ref_id for ref in refs[:4]],
    )


def build_stress_scenarios(
    cards: list[AssetAnalysisCard],
    allocations: list[object],
    refs: list[SourceProvenanceRef],
) -> list[StressScenario]:
    if not cards:
        return []
    weights = _weight_map(cards, allocations)
    average_exit_days = sum(card.exit_days * weights.get(card.asset_id, 0.0) for card in cards)

    def weighted_metric(name: str) -> float:
        total = 0.0
        for card in cards:
            risk_vector = card.risk_vector
            total += float(getattr(risk_vector, name, 0.0) or 0.0) * weights.get(card.asset_id, 0.0)
        return total

    affected_assets = [card.asset_id for card in cards]
    shared_refs = [ref.ref_id for ref in refs[:5]]
    stablecoin_weight = sum(
        weights.get(card.asset_id, 0.0)
        for card in cards
        if card.asset_type.value == "stablecoin"
    )
    mmf_weight = sum(
        weights.get(card.asset_id, 0.0)
        for card in cards
        if card.asset_type.value == "mmf"
    )

    scenarios = [
        StressScenario(
            scenario_key="baseline",
            title="Baseline carry and redemption path",
            severity="baseline",
            narrative="Use the current return distribution as the base case and preserve the existing redemption schedule.",
            portfolio_impact_pct=0.0,
            liquidity_impact_days=round(average_exit_days, 2),
            affected_asset_ids=affected_assets,
            source_provenance_refs=shared_refs,
        ),
        StressScenario(
            scenario_key="depeg_run",
            title="Stablecoin depeg and redemption pressure",
            severity="severe",
            narrative="Model a stablecoin redemption-confidence shock that widens exit spreads and compresses carry.",
            portfolio_impact_pct=round(-1 * (weighted_metric("peg_redemption") * 0.09 + stablecoin_weight * 4.0), 2),
            liquidity_impact_days=round(average_exit_days + stablecoin_weight * 3.0, 2),
            affected_asset_ids=affected_assets,
            source_provenance_refs=shared_refs,
        ),
        StressScenario(
            scenario_key="reserve_deterioration",
            title="Reserve quality deterioration",
            severity="adverse",
            narrative="Assume reserve transparency weakens and collateral quality becomes harder to verify across cash-like sleeves.",
            portfolio_impact_pct=round(-1 * (weighted_metric("issuer_custody") * 0.07 + mmf_weight * 2.5), 2),
            liquidity_impact_days=round(average_exit_days + 2.0, 2),
            affected_asset_ids=affected_assets,
            source_provenance_refs=shared_refs,
        ),
        StressScenario(
            scenario_key="oracle_deviation",
            title="Oracle deviation or stale pricing",
            severity="adverse",
            narrative="Apply a pricing-oracle disturbance to assets whose valuation path depends on oracle or issuer-fed marks.",
            portfolio_impact_pct=round(-1 * weighted_metric("oracle_dependency") * 0.08, 2),
            liquidity_impact_days=round(average_exit_days + 1.5, 2),
            affected_asset_ids=affected_assets,
            source_provenance_refs=shared_refs,
        ),
        StressScenario(
            scenario_key="liquidity_crunch",
            title="Liquidity squeeze and slower exits",
            severity="severe",
            narrative="Stress secondary liquidity, widening redemption windows and penalizing sleeves with lockups or slower exits.",
            portfolio_impact_pct=round(-1 * weighted_metric("liquidity") * 0.06, 2),
            liquidity_impact_days=round(average_exit_days + max(2.0, weighted_metric("liquidity") * 0.05), 2),
            affected_asset_ids=affected_assets,
            source_provenance_refs=shared_refs,
        ),
    ]
    return scenarios
