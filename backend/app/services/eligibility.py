from __future__ import annotations

from app.domain.rwa import (
    AssetTemplate,
    EligibilityDecision,
    EligibilityStatus,
    KycOnchainResult,
)


def _normalize(value: str) -> str:
    return value.strip().lower()


class EligibilityService:
    def evaluate_asset(
        self,
        asset: AssetTemplate,
        *,
        kyc_snapshot: KycOnchainResult | None = None,
        kyc_level: int | None = None,
        investor_type: str = "",
        jurisdiction: str = "",
        ticket_size: float = 0.0,
        source_asset: str = "",
        source_chain: str = "",
    ) -> EligibilityDecision:
        reasons: list[str] = []
        missing_requirements: list[str] = []
        next_actions: list[str] = []

        effective_kyc = (
            kyc_snapshot.level
            if kyc_snapshot is not None and kyc_snapshot.status != kyc_snapshot.status.UNAVAILABLE
            else max(0, kyc_level or 0)
        )
        required_kyc = asset.required_kyc_level
        if required_kyc is None:
            required_kyc = asset.requires_kyc_level

        if required_kyc and effective_kyc < required_kyc:
            reasons.append(f"KYC level L{required_kyc} is required.")
            missing_requirements.append(f"Upgrade KYC to at least L{required_kyc}.")
            next_actions.append("Complete the required wallet KYC / SBT process.")

        normalized_investor_type = _normalize(investor_type)
        if asset.eligible_investor_types:
            allowed = {_normalize(item) for item in asset.eligible_investor_types}
            if not normalized_investor_type:
                reasons.append("Investor type is required for this asset.")
                missing_requirements.append(
                    f"Declare one of: {', '.join(asset.eligible_investor_types)}."
                )
                next_actions.append("Confirm the investor classification before execution.")
            elif normalized_investor_type not in allowed:
                reasons.append(
                    f"Investor type '{investor_type}' is not eligible for this asset."
                )
                missing_requirements.append(
                    f"Eligible types: {', '.join(asset.eligible_investor_types)}."
                )

        normalized_jurisdiction = _normalize(jurisdiction)
        restricted = {_normalize(item) for item in asset.restricted_jurisdictions}
        if normalized_jurisdiction and normalized_jurisdiction in restricted:
            reasons.append(f"Jurisdiction '{jurisdiction}' is restricted.")
            missing_requirements.append("Choose an asset without this jurisdiction restriction.")
        elif asset.restricted_jurisdictions and not normalized_jurisdiction:
            reasons.append("Jurisdiction is required for this asset.")
            missing_requirements.append("Provide the operating jurisdiction.")
            next_actions.append("Confirm the investing jurisdiction before execution.")

        minimum_subscription = (
            asset.min_subscription_amount or asset.minimum_ticket_usd
        )
        if minimum_subscription and ticket_size and ticket_size < minimum_subscription:
            reasons.append(
                f"Minimum subscription is {minimum_subscription:.2f} {asset.settlement_asset}."
            )
            missing_requirements.append(
                f"Increase ticket size to at least {minimum_subscription:.2f}."
            )

        normalized_source_asset = _normalize(source_asset)
        if normalized_source_asset and normalized_source_asset != _normalize(asset.settlement_asset):
            reasons.append(
                f"Source asset '{source_asset}' differs from settlement asset '{asset.settlement_asset}'."
            )
            next_actions.append(
                f"Swap or bridge into {asset.settlement_asset} before subscribing."
            )

        normalized_source_chain = _normalize(source_chain)
        bridge_support = {_normalize(item) for item in asset.bridge_support}
        if normalized_source_chain and normalized_source_chain not in {"", "hashkey", "hashkey chain"}:
            if bridge_support and normalized_source_chain not in bridge_support:
                reasons.append(
                    f"Source chain '{source_chain}' is not listed in bridge support."
                )
                missing_requirements.append("Use a supported bridge path or settle on HashKey Chain first.")
            elif not bridge_support:
                reasons.append(
                    "Bridge support is not confirmed for the requested source chain."
                )
                next_actions.append("Review bridge availability before execution.")

        if any(
            item.startswith("Upgrade KYC")
            or item.startswith("Eligible types")
            or item.startswith("Choose an asset")
            or item.startswith("Increase ticket size")
            or item.startswith("Use a supported bridge path")
            for item in missing_requirements
        ):
            status = EligibilityStatus.BLOCKED
        elif reasons or next_actions:
            status = EligibilityStatus.CONDITIONAL
        else:
            status = EligibilityStatus.ELIGIBLE

        if status == EligibilityStatus.ELIGIBLE:
            reasons.append("Wallet, investor profile, and ticket size satisfy current checks.")

        return EligibilityDecision(
            asset_id=asset.asset_id,
            asset_name=asset.name,
            chain_id=asset.chain_id,
            contract_address=asset.contract_address,
            status=status,
            reasons=reasons,
            missing_requirements=missing_requirements,
            next_actions=next_actions,
        )

    def evaluate_catalog(
        self,
        assets: list[AssetTemplate],
        *,
        kyc_snapshot: KycOnchainResult | None = None,
        kyc_level: int | None = None,
        investor_type: str = "",
        jurisdiction: str = "",
        ticket_size: float = 0.0,
        source_asset: str = "",
        source_chain: str = "",
    ) -> list[tuple[AssetTemplate, EligibilityDecision]]:
        return [
            (
                asset,
                self.evaluate_asset(
                    asset,
                    kyc_snapshot=kyc_snapshot,
                    kyc_level=kyc_level,
                    investor_type=investor_type,
                    jurisdiction=jurisdiction,
                    ticket_size=ticket_size,
                    source_asset=source_asset,
                    source_chain=source_chain,
                ),
            )
            for asset in assets
        ]
