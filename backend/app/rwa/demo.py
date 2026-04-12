from __future__ import annotations

from datetime import datetime, timezone

from app.domain.rwa import (
    DemoScenarioDefinition,
    KycOnchainResult,
    KycStatus,
    LiquidityNeed,
    OracleSnapshot,
    RiskTolerance,
    RwaIntakeContext,
)
from app.i18n import text_for_locale
from app.rwa.explorer_service import address_url

DEMO_REFERENCE_TIME = datetime(2026, 4, 1, 12, 0, tzinfo=timezone.utc)
DEMO_WALLET_ADDRESS = "0x00000000000000000000000000000000DeM00001"


def build_demo_scenarios(*, locale: str = "zh") -> list[DemoScenarioDefinition]:
    return [
        DemoScenarioDefinition(
            scenario_id="conservative-10000-usdt",
            title=text_for_locale(
                locale,
                "10,000 USDT 保守配置",
                "10,000 USDT conservative allocation",
            ),
            description=text_for_locale(
                locale,
                "稳定币与 MMF 的保守配置场景，默认展示 KYC 门槛如何影响结果。",
                "A conservative stablecoin-versus-MMF setup that intentionally shows how KYC gating changes the outcome.",
            ),
            problem_statement=text_for_locale(
                locale,
                "我有 10,000 USDT，想做保守型 RWA / DeFi 配置，优先控制回撤和流动性。",
                "I have 10,000 USDT and want a conservative RWA / DeFi allocation with low drawdown and decent liquidity.",
            ),
            intake_context=RwaIntakeContext(
                investment_amount=10_000,
                base_currency="USDT",
                preferred_asset_ids=["hsk-usdt", "hsk-usdc", "cpic-estable-mmf"],
                holding_period_days=90,
                risk_tolerance=RiskTolerance.CONSERVATIVE,
                liquidity_need=LiquidityNeed.T_PLUS_3,
                minimum_kyc_level=1,
                include_non_production_assets=False,
                demo_mode=True,
                demo_scenario_id="conservative-10000-usdt",
                analysis_seed=101,
            ),
            featured_asset_ids=["hsk-usdt", "hsk-usdc", "cpic-estable-mmf"],
            analysis_seed=101,
            notes=[
                text_for_locale(
                    locale,
                    "该场景固定为三资产资产池，重点展示稳定收益与准入门槛取舍。",
                    "This scenario fixes a three-asset universe to highlight the trade-off between steady carry and access constraints.",
                ),
            ],
        ),
        DemoScenarioDefinition(
            scenario_id="inflation-hedge-silver",
            title=text_for_locale(
                locale,
                "抗通胀：稳定币 vs 白银 RWA",
                "Inflation hedge: stablecoin vs silver RWA",
            ),
            description=text_for_locale(
                locale,
                "用白银 RWA 与稳定币现金腿做对冲比较，强调波动、赎回与 KYC 的权衡。",
                "Compares a silver RWA hedge sleeve against stablecoin cash sleeves, emphasizing volatility, redemption, and KYC trade-offs.",
            ),
            problem_statement=text_for_locale(
                locale,
                "我想做一个抗通胀组合，比较稳定币和白银 RWA，能接受一定波动但不想完全失去流动性。",
                "I want an inflation-hedge allocation comparing stablecoins and a silver RWA, with some risk tolerance but not zero liquidity.",
            ),
            intake_context=RwaIntakeContext(
                investment_amount=25_000,
                base_currency="USDT",
                preferred_asset_ids=["hsk-usdc", "hsk-usdt", "hk-regulated-silver"],
                holding_period_days=180,
                risk_tolerance=RiskTolerance.BALANCED,
                liquidity_need=LiquidityNeed.T_PLUS_3,
                minimum_kyc_level=2,
                include_non_production_assets=False,
                demo_mode=True,
                demo_scenario_id="inflation-hedge-silver",
                analysis_seed=202,
            ),
            featured_asset_ids=["hsk-usdc", "hsk-usdt", "hk-regulated-silver"],
            analysis_seed=202,
            notes=[
                text_for_locale(
                    locale,
                    "场景固定纳入白银 RWA，用于展示通胀对冲腿为何会因为流动性和波动被限制仓位。",
                    "The fixed silver RWA sleeve shows why an inflation hedge can still be position-limited by liquidity and volatility.",
                ),
            ],
        ),
        DemoScenarioDefinition(
            scenario_id="liquidity-first-mmf-vs-real-estate",
            title=text_for_locale(
                locale,
                "流动性优先：MMF-like vs Real-estate-like",
                "Liquidity first: MMF-like vs real-estate-like",
            ),
            description=text_for_locale(
                locale,
                "对比高流动性 MMF-like 方案与高摩擦房地产 demo 模板，突出退出约束与默认排除规则。",
                "Contrasts a liquid MMF-like sleeve with a high-friction real-estate demo template, highlighting exit constraints and default exclusions.",
            ),
            problem_statement=text_for_locale(
                locale,
                "我更看重流动性，想比较 MMF-like 和 real-estate-like 模板，看看哪些资产应该被直接排除。",
                "Liquidity matters most to me; compare an MMF-like asset against a real-estate-like template and show what should be excluded outright.",
            ),
            intake_context=RwaIntakeContext(
                investment_amount=50_000,
                base_currency="USDT",
                preferred_asset_ids=["cpic-estable-mmf", "tokenized-real-estate-demo", "hsk-usdc"],
                holding_period_days=30,
                risk_tolerance=RiskTolerance.BALANCED,
                liquidity_need=LiquidityNeed.INSTANT,
                minimum_kyc_level=2,
                include_non_production_assets=False,
                demo_mode=True,
                demo_scenario_id="liquidity-first-mmf-vs-real-estate",
                analysis_seed=303,
            ),
            featured_asset_ids=["cpic-estable-mmf", "tokenized-real-estate-demo", "hsk-usdc"],
            analysis_seed=303,
            notes=[
                text_for_locale(
                    locale,
                    "该场景会保留 demo 资产展示，但默认不让它参与正式排名。",
                    "This scenario keeps the demo asset visible while excluding it from the default ranking.",
                ),
            ],
        ),
    ]


def get_demo_scenario(
    scenario_id: str,
    *,
    locale: str = "zh",
) -> DemoScenarioDefinition | None:
    scenario_map = {
        scenario.scenario_id: scenario
        for scenario in build_demo_scenarios(locale=locale)
    }
    return scenario_map.get(scenario_id)


def build_demo_oracle_snapshots(
    chain_config,
    scenario_id: str,
    *,
    network: str = "testnet",
) -> list[OracleSnapshot]:
    price_pairs = {
        "conservative-10000-usdt": [("usdt-usd", "USDT/USD", 1.0001), ("usdc-usd", "USDC/USD", 0.9997)],
        "inflation-hedge-silver": [("usdt-usd", "USDT/USD", 1.0003), ("usdc-usd", "USDC/USD", 0.9999)],
        "liquidity-first-mmf-vs-real-estate": [("usdt-usd", "USDT/USD", 1.0), ("usdc-usd", "USDC/USD", 1.0001)],
    }
    return [
        OracleSnapshot(
            feed_id=feed_id,
            pair=pair,
            network=network,
            source_name="Demo Snapshot",
            source_url="https://docs.hashkeychain.net",
            feed_address=f"demo-{feed_id}",
            explorer_url=address_url(chain_config, network, DEMO_WALLET_ADDRESS),
            price=price,
            decimals=8,
            fetched_at=DEMO_REFERENCE_TIME,
            updated_at=DEMO_REFERENCE_TIME,
            round_id=1,
            note="Official demo snapshot",
            status="demo",
        )
        for feed_id, pair, price in price_pairs.get(scenario_id, [])
    ]


def build_demo_kyc_snapshot(
    chain_config,
    scenario: DemoScenarioDefinition,
    *,
    network: str = "testnet",
    wallet_address: str = "",
) -> KycOnchainResult:
    effective_address = wallet_address or DEMO_WALLET_ADDRESS
    effective_level = scenario.intake_context.minimum_kyc_level
    return KycOnchainResult(
        wallet_address=effective_address,
        network=network,
        contract_address=(
            chain_config.testnet_kyc_sbt_address
            if network == "testnet"
            else chain_config.mainnet_kyc_sbt_address
        ),
        status=KycStatus.APPROVED if effective_level > 0 else KycStatus.NONE,
        is_human=effective_level > 0,
        level=effective_level,
        source_url="https://docs.hashkeychain.net/docs/Build-on-HashKey-Chain/Tools/KYC",
        explorer_url=address_url(chain_config, network, effective_address),
        fetched_at=DEMO_REFERENCE_TIME,
        note="Official demo KYC snapshot",
    )
