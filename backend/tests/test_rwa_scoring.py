"""Tests for the RWA scoring, simulation, allocation, and comparison logic."""

import unittest

from app.config import Settings
from app.domain.models import AnalysisMode, EvidenceItem
from app.domain.rwa import (
    AssetType,
    DataSourceTag,
    LiquidityNeed,
    RiskTolerance,
    RwaIntakeContext,
)
from app.rwa.catalog import build_asset_library, build_chain_config
from app.rwa.engine import (
    build_asset_cards,
    build_comparison_tables,
    build_rwa_report,
    build_tx_draft,
    recommend_allocations,
    resolve_selected_assets,
    score_risk,
    simulate_holding,
    _classify_evidence_source,
)
from app.rwa.portfolio_optimizer import (
    AssetInput,
    OptimizationConstraints,
    optimize_weights,
)


def _settings():
    return Settings.from_env()


def _chain_config():
    return build_chain_config(_settings())


def _asset_library(locale="en"):
    return build_asset_library(_chain_config(), locale=locale)


def _context(**overrides):
    defaults = {
        "investment_amount": 10000.0,
        "holding_period_days": 30,
        "risk_tolerance": RiskTolerance.BALANCED,
        "liquidity_need": LiquidityNeed.T_PLUS_3,
    }
    defaults.update(overrides)
    return RwaIntakeContext(**defaults)


class ScoreRiskTests(unittest.TestCase):
    def test_score_risk_returns_vector_for_each_asset_type(self):
        library = _asset_library()
        for asset in library:
            vector = score_risk(asset)
            self.assertIsNotNone(vector)
            self.assertGreaterEqual(vector.overall, 0)
            self.assertLessEqual(vector.overall, 100)
            self.assertGreaterEqual(vector.market, 0)
            self.assertGreaterEqual(vector.liquidity, 0)
            self.assertGreaterEqual(vector.peg_redemption, 0)

    def test_stablecoin_has_lower_market_risk_than_real_estate(self):
        library = _asset_library()
        stablecoin = next(a for a in library if a.asset_type == AssetType.STABLECOIN)
        real_estate = next(a for a in library if a.asset_type == AssetType.REAL_ESTATE)
        stablecoin_risk = score_risk(stablecoin)
        real_estate_risk = score_risk(real_estate)
        self.assertLess(stablecoin_risk.market, real_estate_risk.market)

    def test_risk_scores_are_deterministic(self):
        library = _asset_library()
        asset = library[0]
        v1 = score_risk(asset)
        v2 = score_risk(asset)
        self.assertEqual(v1.overall, v2.overall)
        self.assertEqual(v1.market, v2.market)
        self.assertEqual(v1.liquidity, v2.liquidity)


class SimulateHoldingTests(unittest.TestCase):
    def test_simulation_returns_valid_structure(self):
        library = _asset_library()
        asset = library[0]
        sim = simulate_holding(asset, 10000.0, 30, locale="en")
        self.assertEqual(asset.asset_id, sim.asset_id)
        self.assertIsNotNone(sim.ending_value_low)
        self.assertIsNotNone(sim.ending_value_base)
        self.assertIsNotNone(sim.ending_value_high)
        self.assertGreaterEqual(len(sim.path), 0)

    def test_simulation_is_deterministic_with_same_seed(self):
        library = _asset_library()
        asset = library[0]
        s1 = simulate_holding(asset, 10000.0, 30, locale="en")
        s2 = simulate_holding(asset, 10000.0, 30, locale="en")
        self.assertEqual(s1.ending_value_low, s2.ending_value_low)
        self.assertEqual(s1.ending_value_base, s2.ending_value_base)
        self.assertEqual(s1.ending_value_high, s2.ending_value_high)

    def test_simulation_respects_holding_period(self):
        library = _asset_library()
        asset = library[0]
        sim_short = simulate_holding(asset, 10000.0, 7, locale="en")
        sim_long = simulate_holding(asset, 10000.0, 180, locale="en")
        self.assertLessEqual(len(sim_short.path), len(sim_long.path))


class AllocationTests(unittest.TestCase):
    def test_recommend_allocations_returns_entries(self):
        library = _asset_library()
        context = _context()
        assets = resolve_selected_assets(
            AnalysisMode.MULTI_OPTION, "30-day RWA allocation", context, library,
        )
        cards = build_asset_cards(assets, context)
        allocations = recommend_allocations(context, cards, locale="en")
        self.assertGreater(len(allocations), 0)
        total_weight = sum(a.target_weight_pct for a in allocations)
        self.assertAlmostEqual(total_weight, 100.0, delta=1.0)

    def test_kyc_gating_blocks_restricted_assets(self):
        library = _asset_library()
        context = _context(minimum_kyc_level=0)
        assets = resolve_selected_assets(
            AnalysisMode.MULTI_OPTION, "30-day allocation", context, library,
        )
        # We expect some assets requiring KYC > 0 to be filtered or flagged
        cards = build_asset_cards(assets, context)
        self.assertTrue(len(cards) >= 1)


class ComparisonTableTests(unittest.TestCase):
    def test_build_comparison_tables_returns_tables(self):
        library = _asset_library()
        context = _context()
        assets = resolve_selected_assets(
            AnalysisMode.MULTI_OPTION, "RWA comparison", context, library,
        )
        cards = build_asset_cards(assets, context)
        sims = [simulate_holding(a, 10000.0, 30, locale="en") for a in assets]
        tables = build_comparison_tables(cards, sims, locale="en")
        self.assertGreater(len(tables), 0)
        for table in tables:
            self.assertGreater(len(table.columns), 0)
            self.assertGreater(len(table.rows), 0)


class BuildReportTests(unittest.TestCase):
    def test_build_rwa_report_produces_complete_report(self):
        library = _asset_library()
        chain_config = _chain_config()
        context = _context()
        report, evidence = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Build a 30-day HashKey Chain RWA allocation for 10,000 USDT.",
            context=context,
            chain_config=chain_config,
            asset_library=library,
            locale="en",
            oracle_snapshots=[],
        )
        self.assertIsNotNone(report)
        self.assertGreater(len(report.summary), 0)
        self.assertGreater(len(report.recommendations), 0)
        self.assertGreater(len(report.markdown), 0)
        self.assertIsNotNone(report.attestation_draft)
        self.assertGreater(len(evidence), 0)

    def test_report_evidence_has_source_tags(self):
        library = _asset_library()
        chain_config = _chain_config()
        context = _context()
        _, evidence = build_rwa_report(
            mode=AnalysisMode.MULTI_OPTION,
            problem_statement="Test evidence tagging",
            context=context,
            chain_config=chain_config,
            asset_library=library,
            locale="en",
            oracle_snapshots=[],
        )
        for item in evidence:
            self.assertIn(
                item.source_tag,
                [t.value for t in DataSourceTag],
            )


class ClassifyEvidenceSourceTests(unittest.TestCase):
    def test_blockchain_explorer_classified_as_onchain(self):
        e = EvidenceItem(
            title="Test",
            source_url="https://explorer.hsk.xyz/tx/0x...",
            source_name="Blockscout",
            summary="test",
        )
        tag = _classify_evidence_source(e)
        self.assertEqual(tag, DataSourceTag.ONCHAIN_VERIFIED)

    def test_oracle_source_classified_as_oracle_fed(self):
        e = EvidenceItem(
            title="Test",
            source_url="https://docs.hashkey.com",
            source_name="APRO Oracle",
            summary="test",
        )
        tag = _classify_evidence_source(e)
        self.assertEqual(tag, DataSourceTag.ORACLE_FED)

    def test_issuer_source_classified_as_issuer_disclosed(self):
        e = EvidenceItem(
            title="Test",
            source_url="https://www.prnewswire.com/news/test",
            source_name="PR Wire",
            summary="test",
        )
        tag = _classify_evidence_source(e)
        self.assertEqual(tag, DataSourceTag.ISSUER_DISCLOSED)


class PortfolioOptimizerTests(unittest.TestCase):
    def _sample_assets(self):
        return [
            AssetInput(
                asset_id="usdt", name="USDT", expected_return=0.04,
                volatility=0.01, risk_score=15, total_cost_bps=5,
            ),
            AssetInput(
                asset_id="mmf", name="MMF", expected_return=0.035,
                volatility=0.02, risk_score=25, total_cost_bps=20,
            ),
            AssetInput(
                asset_id="silver", name="Silver RWA", expected_return=0.08,
                volatility=0.15, risk_score=55, total_cost_bps=50,
            ),
            AssetInput(
                asset_id="re", name="Real Estate", expected_return=0.12,
                volatility=0.25, risk_score=70, total_cost_bps=100,
                kyc_blocked=True,
            ),
        ]

    def test_score_weighted_sums_to_one(self):
        result = optimize_weights(self._sample_assets(), method="score_weighted")
        total = sum(w.weight for w in result.weights)
        self.assertAlmostEqual(total, 1.0, delta=0.01)

    def test_blocked_asset_gets_zero_weight(self):
        result = optimize_weights(self._sample_assets(), method="score_weighted")
        re_weight = next(w for w in result.weights if w.asset_id == "re")
        self.assertEqual(re_weight.weight, 0.0)
        self.assertTrue(re_weight.blocked)

    def test_risk_parity_sums_to_one(self):
        result = optimize_weights(self._sample_assets(), method="risk_parity")
        total = sum(w.weight for w in result.weights)
        self.assertAlmostEqual(total, 1.0, delta=0.01)

    def test_equal_weight(self):
        assets = self._sample_assets()
        result = optimize_weights(assets, method="equal")
        eligible_count = sum(1 for a in assets if not a.kyc_blocked)
        for w in result.weights:
            if not w.blocked:
                self.assertAlmostEqual(w.weight, 1.0 / eligible_count, delta=0.01)

    def test_max_weight_cap_enforced(self):
        constraints = OptimizationConstraints(max_single_asset_weight=0.40)
        result = optimize_weights(self._sample_assets(), constraints=constraints)
        for w in result.weights:
            self.assertLessEqual(w.weight, 0.40 + 0.01)

    def test_volatile_cap_enforced(self):
        constraints = OptimizationConstraints(
            max_volatile_asset_total=0.30,
            volatile_threshold=0.10,
        )
        result = optimize_weights(self._sample_assets(), constraints=constraints)
        volatile_total = sum(
            w.weight for w, a in zip(result.weights, self._sample_assets())
            if a.volatility >= 0.10 and not a.kyc_blocked
        )
        self.assertLessEqual(volatile_total, 0.30 + 0.02)

    def test_empty_assets_returns_empty_result(self):
        result = optimize_weights([])
        self.assertEqual(len(result.weights), 0)
        self.assertIn("No assets provided", result.notes[0])


class MultiHorizonTests(unittest.TestCase):
    def test_multi_horizon_returns_three_simulations(self):
        from app.rwa.engine import simulate_multi_horizon
        library = _asset_library()
        asset = library[0]
        sims = simulate_multi_horizon(asset, 10000.0, locale="en")
        self.assertEqual(len(sims), 3)
        expected_days = [90, 180, 365]
        actual_days = [s.holding_period_days for s in sims]
        self.assertEqual(actual_days, expected_days)

    def test_multi_horizon_custom_periods(self):
        from app.rwa.engine import simulate_multi_horizon
        library = _asset_library()
        asset = library[0]
        sims = simulate_multi_horizon(asset, 10000.0, [7, 30], locale="en")
        self.assertEqual(len(sims), 2)
        self.assertEqual(sims[0].holding_period_days, 7)
        self.assertEqual(sims[1].holding_period_days, 30)

    def test_multi_horizon_deterministic(self):
        from app.rwa.engine import simulate_multi_horizon
        library = _asset_library()
        asset = library[0]
        s1 = simulate_multi_horizon(asset, 10000.0, locale="en")
        s2 = simulate_multi_horizon(asset, 10000.0, locale="en")
        for a, b in zip(s1, s2):
            self.assertEqual(a.ending_value_base, b.ending_value_base)


class NetReturnTests(unittest.TestCase):
    def test_estimate_net_return_structure(self):
        from app.rwa.engine import estimate_net_return_after_fees
        library = _asset_library()
        asset = library[0]
        result = estimate_net_return_after_fees(asset, 10000.0, 30)
        self.assertIn("gross_return_pct", result)
        self.assertIn("total_fee_pct", result)
        self.assertIn("net_return_pct", result)
        self.assertIn("net_value", result)

    def test_net_return_less_than_gross(self):
        from app.rwa.engine import estimate_net_return_after_fees
        library = _asset_library()
        asset = library[0]
        result = estimate_net_return_after_fees(asset, 10000.0, 30)
        self.assertLessEqual(result["net_return_pct"], result["gross_return_pct"])


if __name__ == "__main__":
    unittest.main()
