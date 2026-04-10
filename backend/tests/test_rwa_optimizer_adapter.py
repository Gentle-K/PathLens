"""Tests for the portfolio optimization adapter (Option B — lightweight)."""

import unittest

from app.adapters.portfolio_opt import (
    OptMethod,
    PortfolioAsset,
    PortfolioConstraints,
    PortfolioResult,
    optimize_portfolio,
)


def _sample_assets():
    return [
        PortfolioAsset(
            asset_id="usdt", name="USDT",
            expected_return=0.04, volatility=0.01,
            risk_score=15, total_cost_bps=5,
            redemption_days=0, lockup_days=0,
        ),
        PortfolioAsset(
            asset_id="mmf", name="MMF",
            expected_return=0.035, volatility=0.02,
            risk_score=25, total_cost_bps=20,
            redemption_days=2, lockup_days=0,
        ),
        PortfolioAsset(
            asset_id="silver", name="Silver RWA",
            expected_return=0.08, volatility=0.15,
            risk_score=55, total_cost_bps=50,
            redemption_days=3, lockup_days=0,
        ),
        PortfolioAsset(
            asset_id="re", name="Real Estate",
            expected_return=0.12, volatility=0.25,
            risk_score=70, total_cost_bps=100,
            redemption_days=7, lockup_days=30,
            kyc_blocked=True,
        ),
    ]


class RuleBasedOptimiserTests(unittest.TestCase):
    def test_weights_sum_to_one(self):
        result = optimize_portfolio(_sample_assets())
        total = sum(w.weight for w in result.weights)
        self.assertAlmostEqual(total, 1.0, delta=0.01)

    def test_blocked_asset_gets_zero(self):
        result = optimize_portfolio(_sample_assets())
        re = next(w for w in result.weights if w.asset_id == "re")
        self.assertEqual(re.weight, 0.0)
        self.assertTrue(re.blocked)

    def test_method_is_rule_based(self):
        result = optimize_portfolio(_sample_assets())
        self.assertEqual(result.method, "rule_based")

    def test_notes_populated(self):
        result = optimize_portfolio(_sample_assets())
        self.assertGreater(len(result.notes), 0)


class RiskParityTests(unittest.TestCase):
    def test_risk_parity_sums_to_one(self):
        result = optimize_portfolio(
            _sample_assets(), method=OptMethod.RISK_PARITY,
        )
        total = sum(w.weight for w in result.weights)
        self.assertAlmostEqual(total, 1.0, delta=0.01)

    def test_lower_vol_gets_higher_weight(self):
        result = optimize_portfolio(
            _sample_assets(), method=OptMethod.RISK_PARITY,
        )
        usdt = next(w for w in result.weights if w.asset_id == "usdt")
        silver = next(w for w in result.weights if w.asset_id == "silver")
        self.assertGreater(usdt.weight, silver.weight)


class EqualWeightTests(unittest.TestCase):
    def test_equal_weight_non_blocked(self):
        assets = _sample_assets()
        result = optimize_portfolio(assets, method=OptMethod.EQUAL)
        eligible = sum(1 for a in assets if not a.kyc_blocked)
        for w in result.weights:
            if not w.blocked:
                self.assertAlmostEqual(w.weight, 1.0 / eligible, delta=0.02)


class LiquidityPenaltyTests(unittest.TestCase):
    def test_instant_liquidity_penalises_lockup(self):
        assets = _sample_assets()
        constraints = PortfolioConstraints(
            liquidity_need_instant=True,
            liquidity_need_t3=False,
        )
        result = optimize_portfolio(assets, constraints=constraints)
        # USDT (T+0) should have more weight than MMF (T+2)
        usdt = next(w for w in result.weights if w.asset_id == "usdt")
        mmf = next(w for w in result.weights if w.asset_id == "mmf")
        self.assertGreaterEqual(usdt.weight, mmf.weight)


class HorizonMatchingTests(unittest.TestCase):
    def test_short_horizon_penalises_lockup(self):
        assets = [
            PortfolioAsset(
                asset_id="a", name="Short Exit",
                expected_return=0.05, volatility=0.05,
                risk_score=30, total_cost_bps=10,
                redemption_days=0, lockup_days=0,
            ),
            PortfolioAsset(
                asset_id="b", name="Long Lockup",
                expected_return=0.08, volatility=0.05,
                risk_score=30, total_cost_bps=10,
                redemption_days=0, lockup_days=90,
            ),
        ]
        constraints = PortfolioConstraints(holding_period_days=30)
        result = optimize_portfolio(assets, constraints=constraints)
        short = next(w for w in result.weights if w.asset_id == "a")
        long = next(w for w in result.weights if w.asset_id == "b")
        self.assertGreater(short.weight, long.weight)


class RiskFilterTests(unittest.TestCase):
    def test_conservative_filters_high_risk(self):
        assets = [
            PortfolioAsset(
                asset_id="safe", name="Safe",
                expected_return=0.03, volatility=0.01,
                risk_score=20, total_cost_bps=5,
            ),
            PortfolioAsset(
                asset_id="risky", name="Risky",
                expected_return=0.15, volatility=0.30,
                risk_score=85, total_cost_bps=80,
            ),
        ]
        # Conservative: threshold = 50 + 30 * 0.7 = 71
        constraints = PortfolioConstraints(risk_tolerance_multiplier=0.7)
        result = optimize_portfolio(assets, constraints=constraints)
        risky = next(w for w in result.weights if w.asset_id == "risky")
        self.assertEqual(risky.weight, 0.0)


class FallbackScoringTests(unittest.TestCase):
    def test_pypfopt_method_falls_back(self):
        """When requesting min_volatility without pypfopt installed,
        the adapter should fall through to rule_based."""
        result = optimize_portfolio(
            _sample_assets(),
            method=OptMethod.MIN_VOLATILITY,
            allow_pypfopt=True,
        )
        # Should not crash and should produce valid weights
        total = sum(w.weight for w in result.weights)
        self.assertAlmostEqual(total, 1.0, delta=0.01)
        # Without pypfopt installed, falls through to rule_based directly
        self.assertIn("rule_based", result.method)


class EmptyInputTests(unittest.TestCase):
    def test_empty_assets(self):
        result = optimize_portfolio([])
        self.assertEqual(len(result.weights), 0)
        self.assertIn("No assets provided", result.notes[0])


class MaxWeightCapTests(unittest.TestCase):
    def test_max_weight_enforced(self):
        constraints = PortfolioConstraints(max_single_asset=0.40)
        result = optimize_portfolio(_sample_assets(), constraints=constraints)
        for w in result.weights:
            self.assertLessEqual(w.weight, 0.40 + 0.02)


class VolatileCapTests(unittest.TestCase):
    def test_volatile_cap_enforced(self):
        constraints = PortfolioConstraints(
            max_volatile_total=0.30,
            volatile_threshold=0.10,
        )
        result = optimize_portfolio(_sample_assets(), constraints=constraints)
        volatile_total = sum(
            w.weight for w, a in zip(result.weights, _sample_assets())
            if a.volatility >= 0.10 and not a.kyc_blocked
        )
        self.assertLessEqual(volatile_total, 0.30 + 0.02)


if __name__ == "__main__":
    unittest.main()
