"""Portfolio optimization adapter with a stable public interface.

This module provides a single ``optimize_portfolio()`` entry point that the
rest of the codebase (API routes, report builder, orchestrator) should call.
The implementation is swappable behind this interface:

  1. **Current**: a lightweight rule-based optimizer that performs
     risk filtering, liquidity penalty, horizon matching, and fallback
     scoring — no external dependencies beyond the standard library.

  2. **Future**: PyPortfolioOpt efficient-frontier / HRP / Black-Litterman
     optimizer, toggleable via an environment flag or the presence of the
     ``pypfopt`` package at import time.

Design contract
---------------
- Callers ONLY import ``optimize_portfolio`` and the dataclass outputs.
- The function signature and return type are stable.
- Internally, we delegate to the best available backend.
- If PyPortfolioOpt is installed *and* the caller passes
  ``allow_pypfopt=True``, we use it.  Otherwise we use the built-in
  optimizer.

# TODO(future): When PyPortfolioOpt is added to requirements.txt,
# uncomment the ``_optimize_with_pypfopt`` path and wire it into
# ``optimize_portfolio``.  No changes to callers are needed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence

# ---------------------------------------------------------------------------
# Optional PyPortfolioOpt import — never hard-fail
# ---------------------------------------------------------------------------
_HAS_PYPFOPT = False
try:
    import pypfopt  # type: ignore[import-untyped]  # noqa: F401

    _HAS_PYPFOPT = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Public data types  (stable interface — do not change field names)
# ---------------------------------------------------------------------------

class OptMethod(str, Enum):
    """Optimisation method selector."""
    RULE_BASED = "rule_based"
    RISK_PARITY = "risk_parity"
    EQUAL = "equal"
    MIN_VOLATILITY = "min_volatility"       # requires PyPortfolioOpt
    MAX_SHARPE = "max_sharpe"               # requires PyPortfolioOpt


@dataclass
class PortfolioAsset:
    """Canonical input for a single candidate asset."""
    asset_id: str
    name: str
    expected_return: float          # annualised, e.g. 0.05 = 5 %
    volatility: float               # annualised std-dev
    risk_score: float               # 0 – 100 composite risk score
    total_cost_bps: int             # all-in basis points
    redemption_days: int = 0        # earliest exit T+N
    lockup_days: int = 0
    kyc_blocked: bool = False
    min_weight: float = 0.0
    max_weight: float = 1.0


@dataclass
class PortfolioConstraints:
    """Constraints that shape the optimisation."""
    max_single_asset: float = 0.50
    min_single_asset: float = 0.0
    max_volatile_total: float = 0.35
    volatile_threshold: float = 0.20
    target_risk_score: float = 50.0
    risk_tolerance_multiplier: float = 1.0  # 0.7 conservative → 1.3 aggressive
    holding_period_days: int = 30
    liquidity_need_instant: bool = False
    liquidity_need_t3: bool = True


@dataclass
class WeightResult:
    """Weight for one asset in the optimised portfolio."""
    asset_id: str
    name: str
    raw_score: float
    weight: float           # 0.0 – 1.0
    weight_pct: float       # 0.0 – 100.0
    blocked: bool = False
    blocked_reason: str = ""


@dataclass
class PortfolioResult:
    """Complete optimization output."""
    weights: list[WeightResult] = field(default_factory=list)
    method: str = "rule_based"
    notes: list[str] = field(default_factory=list)
    pypfopt_available: bool = _HAS_PYPFOPT


# ---------------------------------------------------------------------------
# Internal scoring helpers
# ---------------------------------------------------------------------------

def _liquidity_penalty(
    asset: PortfolioAsset,
    constraints: PortfolioConstraints,
) -> float:
    """Penalise assets whose exit speed violates the user's liquidity need."""
    if constraints.liquidity_need_instant and asset.redemption_days > 0:
        return 16.0 + asset.redemption_days * 2.5
    if constraints.liquidity_need_t3 and asset.redemption_days > 3:
        return 9.0 + asset.redemption_days * 1.5
    return 0.0


def _horizon_penalty(
    asset: PortfolioAsset,
    constraints: PortfolioConstraints,
) -> float:
    """Penalise lockups that exceed the user's holding horizon."""
    if asset.lockup_days <= 0:
        return 0.0
    overshoot = asset.lockup_days - constraints.holding_period_days
    if overshoot <= 0:
        return 0.0
    return min(30.0, overshoot * 0.6)


def _risk_filter_pass(
    asset: PortfolioAsset,
    constraints: PortfolioConstraints,
) -> bool:
    """Return True if the asset passes the risk filter for the user's tolerance."""
    # Conservative users reject assets with risk_score > 65
    # Balanced users reject > 80
    # Aggressive users reject > 95
    threshold = 50.0 + 30.0 * constraints.risk_tolerance_multiplier
    return asset.risk_score <= threshold


def _composite_score(
    asset: PortfolioAsset,
    constraints: PortfolioConstraints,
) -> float:
    """Blends return, risk, cost, liquidity, and horizon into a single score."""
    if asset.kyc_blocked:
        return 0.0

    # Return reward
    return_score = asset.expected_return * 100.0

    # Risk penalty — penalise distance above the target
    risk_gap = max(0.0, asset.risk_score - constraints.target_risk_score)
    risk_penalty = risk_gap * 0.4 * (2.0 - constraints.risk_tolerance_multiplier)

    # Volatility penalty
    vol_penalty = max(0.0, asset.volatility - 0.10) * 30.0

    # Cost penalty
    cost_penalty = asset.total_cost_bps / 50.0

    # Liquidity and horizon penalties
    liq_pen = _liquidity_penalty(asset, constraints)
    hor_pen = _horizon_penalty(asset, constraints)

    score = return_score - risk_penalty - vol_penalty - cost_penalty - liq_pen - hor_pen
    return max(0.0, score)


# ---------------------------------------------------------------------------
# Built-in rule-based optimizer
# ---------------------------------------------------------------------------

def _risk_parity_weights(assets: Sequence[PortfolioAsset]) -> list[float]:
    """Inverse-volatility weighting."""
    inv_vols = []
    for a in assets:
        if a.kyc_blocked:
            inv_vols.append(0.0)
        elif a.volatility > 0:
            inv_vols.append(1.0 / a.volatility)
        else:
            inv_vols.append(1.0)
    total = sum(inv_vols)
    if total <= 0:
        n = len(assets)
        return [1.0 / n] * n
    return [v / total for v in inv_vols]


def _apply_bounds(
    weights: list[float],
    assets: Sequence[PortfolioAsset],
    constraints: PortfolioConstraints,
) -> list[float]:
    """Enforce per-asset min/max, volatile cap, and re-normalise."""
    bounded: list[float] = []
    for w, a in zip(weights, assets):
        if a.kyc_blocked:
            bounded.append(0.0)
            continue
        eff_max = min(a.max_weight, constraints.max_single_asset)
        eff_min = max(a.min_weight, constraints.min_single_asset)
        bounded.append(max(eff_min, min(eff_max, w)))

    # Cap combined volatile-asset weight
    volatile_total = sum(
        w for w, a in zip(bounded, assets)
        if a.volatility >= constraints.volatile_threshold and not a.kyc_blocked
    )
    if volatile_total > constraints.max_volatile_total and volatile_total > 0:
        scale = constraints.max_volatile_total / volatile_total
        bounded = [
            w * scale if a.volatility >= constraints.volatile_threshold else w
            for w, a in zip(bounded, assets)
        ]

    # Re-normalise
    total = sum(bounded)
    if total > 0:
        bounded = [w / total for w in bounded]
    return bounded


def _optimize_rule_based(
    assets: Sequence[PortfolioAsset],
    constraints: PortfolioConstraints,
) -> PortfolioResult:
    """Full rule-based pipeline: risk filter → score → bound → output."""
    notes: list[str] = []

    if not assets:
        return PortfolioResult(weights=[], method="rule_based",
                               notes=["No assets provided."])

    # Step 1: risk filter
    filtered_out = []
    for a in assets:
        if not a.kyc_blocked and not _risk_filter_pass(a, constraints):
            filtered_out.append(a.name)
    if filtered_out:
        notes.append(f"Risk-filtered out: {', '.join(filtered_out)}")

    # Step 2: composite scoring
    scores = [_composite_score(a, constraints) for a in assets]

    # Step 3: zero out risk-filtered assets
    for i, a in enumerate(assets):
        if not _risk_filter_pass(a, constraints) and not a.kyc_blocked:
            scores[i] = 0.0

    total_score = sum(scores)
    if total_score > 0:
        raw_weights = [s / total_score for s in scores]
        notes.append("Used rule-based composite scoring with risk filtering, "
                      "liquidity penalty, and horizon matching.")
    else:
        # Fallback: equal weight across non-blocked assets
        eligible = sum(1 for a in assets if not a.kyc_blocked)
        raw_weights = [
            1.0 / eligible if not a.kyc_blocked and eligible > 0 else 0.0
            for a in assets
        ]
        notes.append("All scores were zero; fell back to equal weight.")

    # Step 4: apply bounds
    final = _apply_bounds(raw_weights, assets, constraints)

    # Step 5: build output
    result_weights: list[WeightResult] = []
    for a, score, w in zip(assets, scores, final):
        result_weights.append(WeightResult(
            asset_id=a.asset_id,
            name=a.name,
            raw_score=round(score, 3),
            weight=round(w, 6),
            weight_pct=round(w * 100, 2),
            blocked=a.kyc_blocked,
            blocked_reason="KYC level insufficient" if a.kyc_blocked else "",
        ))

    blocked_count = sum(1 for a in assets if a.kyc_blocked)
    if blocked_count:
        notes.append(f"{blocked_count} asset(s) blocked by KYC gating.")

    return PortfolioResult(weights=result_weights, method="rule_based",
                           notes=notes)


def _optimize_risk_parity(
    assets: Sequence[PortfolioAsset],
    constraints: PortfolioConstraints,
) -> PortfolioResult:
    notes: list[str] = ["Used inverse-volatility (risk-parity-lite) weighting."]
    if not assets:
        return PortfolioResult(weights=[], method="risk_parity",
                               notes=["No assets provided."])
    raw = _risk_parity_weights(assets)
    final = _apply_bounds(raw, assets, constraints)
    scores = [_composite_score(a, constraints) for a in assets]
    weights = [
        WeightResult(
            asset_id=a.asset_id, name=a.name,
            raw_score=round(s, 3), weight=round(w, 6),
            weight_pct=round(w * 100, 2),
            blocked=a.kyc_blocked,
            blocked_reason="KYC level insufficient" if a.kyc_blocked else "",
        )
        for a, s, w in zip(assets, scores, final)
    ]
    return PortfolioResult(weights=weights, method="risk_parity", notes=notes)


def _optimize_equal(
    assets: Sequence[PortfolioAsset],
    constraints: PortfolioConstraints,
) -> PortfolioResult:
    notes: list[str] = ["Used equal weighting across eligible assets."]
    if not assets:
        return PortfolioResult(weights=[], method="equal",
                               notes=["No assets provided."])
    eligible = sum(1 for a in assets if not a.kyc_blocked)
    raw = [
        1.0 / eligible if not a.kyc_blocked and eligible > 0 else 0.0
        for a in assets
    ]
    final = _apply_bounds(raw, assets, constraints)
    scores = [_composite_score(a, constraints) for a in assets]
    weights = [
        WeightResult(
            asset_id=a.asset_id, name=a.name,
            raw_score=round(s, 3), weight=round(w, 6),
            weight_pct=round(w * 100, 2),
            blocked=a.kyc_blocked,
            blocked_reason="KYC level insufficient" if a.kyc_blocked else "",
        )
        for a, s, w in zip(assets, scores, final)
    ]
    return PortfolioResult(weights=weights, method="equal", notes=notes)


# ---------------------------------------------------------------------------
# TODO: PyPortfolioOpt backend  (uncomment when pypfopt is in requirements)
# ---------------------------------------------------------------------------
#
# def _optimize_with_pypfopt(
#     assets: Sequence[PortfolioAsset],
#     constraints: PortfolioConstraints,
#     method: OptMethod,
# ) -> PortfolioResult:
#     """Delegate to PyPortfolioOpt's EfficientFrontier or HRPOpt.
#
#     Expected usage:
#       import numpy as np
#       import pandas as pd
#       from pypfopt import EfficientFrontier, expected_returns, risk_models
#
#       # Build expected returns vector and covariance matrix from asset inputs.
#       # For now we use a diagonal covariance (no cross-correlation data).
#       mu = pd.Series({a.asset_id: a.expected_return for a in assets})
#       S = pd.DataFrame(
#           np.diag([a.volatility**2 for a in assets]),
#           index=[a.asset_id for a in assets],
#           columns=[a.asset_id for a in assets],
#       )
#       ef = EfficientFrontier(mu, S)
#       ef.add_constraint(lambda w: w <= constraints.max_single_asset)
#
#       if method == OptMethod.MIN_VOLATILITY:
#           ef.min_volatility()
#       elif method == OptMethod.MAX_SHARPE:
#           ef.max_sharpe()
#
#       cleaned = ef.clean_weights()
#       # ... convert to WeightResult list ...
#
#     This stub shows the integration shape.  The actual implementation
#     should also handle HRP (HRPOpt) and custom RWA constraints.
#     """
#     raise NotImplementedError("PyPortfolioOpt backend not yet wired.")


# ---------------------------------------------------------------------------
# Public entry point  (STABLE — callers should ONLY use this)
# ---------------------------------------------------------------------------

def optimize_portfolio(
    assets: Sequence[PortfolioAsset],
    constraints: PortfolioConstraints | None = None,
    *,
    method: OptMethod | str = OptMethod.RULE_BASED,
    allow_pypfopt: bool = False,
) -> PortfolioResult:
    """Run portfolio optimisation through the best available backend.

    Parameters
    ----------
    assets
        List of candidate assets with return, risk, and constraint data.
    constraints
        Allocation constraints.  ``None`` → sensible defaults.
    method
        Which optimisation strategy to use.  ``"rule_based"`` always works.
        ``"min_volatility"`` and ``"max_sharpe"`` require PyPortfolioOpt.
    allow_pypfopt
        When ``True`` *and* the ``pypfopt`` package is importable, delegate
        to PyPortfolioOpt for methods that support it.

    Returns
    -------
    PortfolioResult
        Weights, method used, and notes.  Weights always sum to 1.0
        (modulo blocked assets which are zero-weighted).
    """
    if constraints is None:
        constraints = PortfolioConstraints()

    method_str = method.value if isinstance(method, OptMethod) else method

    # --- PyPortfolioOpt path (future) ---
    if allow_pypfopt and _HAS_PYPFOPT and method_str in (
        OptMethod.MIN_VOLATILITY.value,
        OptMethod.MAX_SHARPE.value,
    ):
        # TODO: call _optimize_with_pypfopt(assets, constraints, method)
        # For now, fall back to rule-based with a note.
        result = _optimize_rule_based(assets, constraints)
        result.notes.insert(
            0,
            f"PyPortfolioOpt is installed but the '{method_str}' backend is "
            f"not yet wired.  Fell back to rule-based scoring.",
        )
        result.method = f"rule_based (fallback from {method_str})"
        return result

    # --- Built-in backends ---
    if method_str == OptMethod.RISK_PARITY.value:
        return _optimize_risk_parity(assets, constraints)
    if method_str == OptMethod.EQUAL.value:
        return _optimize_equal(assets, constraints)

    # Default: rule-based
    return _optimize_rule_based(assets, constraints)
