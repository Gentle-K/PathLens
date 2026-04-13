import unittest

from app.domain.rwa import AssetTemplate, AssetType, KycOnchainResult, KycStatus
from app.services.eligibility import EligibilityService


def _asset(**overrides) -> AssetTemplate:
    payload = {
        "asset_id": "cpic-estable-mmf",
        "symbol": "MMF",
        "name": "CPIC Estable MMF",
        "asset_type": AssetType.MMF,
        "description": "Tokenized money-market fund sleeve.",
        "chain_id": 177,
        "required_kyc_level": 2,
        "eligible_investor_types": ["professional"],
        "restricted_jurisdictions": ["us"],
        "min_subscription_amount": 5000,
        "settlement_asset": "USDT",
        "bridge_support": ["ethereum"],
    }
    payload.update(overrides)
    return AssetTemplate(**payload)


class EligibilityServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = EligibilityService()

    def test_marks_asset_eligible_when_wallet_profile_matches(self):
        decision = self.service.evaluate_asset(
            _asset(),
            kyc_snapshot=KycOnchainResult(
                wallet_address="0xabc",
                network="testnet",
                status=KycStatus.APPROVED,
                level=2,
                is_human=True,
            ),
            investor_type="professional",
            jurisdiction="hk",
            ticket_size=10000,
            source_asset="USDT",
            source_chain="hashkey",
        )

        self.assertEqual("eligible", decision.status.value)
        self.assertIn("satisfy current checks", decision.reasons[0].lower())

    def test_blocks_asset_when_kyc_and_ticket_size_fail(self):
        decision = self.service.evaluate_asset(
            _asset(),
            kyc_level=0,
            investor_type="professional",
            jurisdiction="hk",
            ticket_size=1000,
            source_asset="USDT",
            source_chain="hashkey",
        )

        self.assertEqual("blocked", decision.status.value)
        self.assertTrue(any("Upgrade KYC" in item for item in decision.missing_requirements))
        self.assertTrue(any("Increase ticket size" in item for item in decision.missing_requirements))

    def test_marks_route_conditional_when_swap_or_bridge_is_required(self):
        decision = self.service.evaluate_asset(
            _asset(
                required_kyc_level=0,
                eligible_investor_types=[],
                restricted_jurisdictions=[],
                min_subscription_amount=0,
                settlement_asset="USDC",
                bridge_support=[],
            ),
            kyc_level=1,
            ticket_size=10000,
            source_asset="USDT",
            source_chain="arbitrum",
        )

        self.assertEqual("conditional", decision.status.value)
        self.assertTrue(any("Swap or bridge into USDC" in item for item in decision.next_actions))
        self.assertTrue(any("Bridge support is not confirmed" in item for item in decision.reasons))
