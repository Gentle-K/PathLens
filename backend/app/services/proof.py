from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from app.domain.rwa import (
    AssetProofHistoryItem,
    AssetProofSnapshot,
    AssetTemplate,
    ExecutionAdapterKind,
    ExecutionReadiness,
    HashKeyChainConfig,
    LiveReadiness,
    OnchainAnchorStatus,
    ProofFreshnessState,
    ProofPublishStatus,
    ProofSourceRef,
    ProofStatusCard,
    RedemptionWindow,
    TruthLevel,
)
from app.rwa.explorer_service import address_url, kyc_docs_url, oracle_docs_url, token_url
from app.services.proof_repository import ProofRepositoryService


LIVE_PROOF_ASSET_IDS = {
    "hsk-usdt",
    "hsk-usdc",
    "cpic-estable-mmf",
    "hk-regulated-silver",
}
PROOF_STALE_AFTER_HOURS = 24 * 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_payload(payload: object) -> str:
    return hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            ensure_ascii=False,
            default=str,
        ).encode("utf-8")
    ).hexdigest()


class ProofService:
    def __init__(
        self,
        *,
        repository_service: ProofRepositoryService,
        publisher_service=None,
    ) -> None:
        self.repository_service = repository_service
        self.publisher_service = publisher_service

    def resolve_execution_adapter(self, asset: AssetTemplate) -> ExecutionAdapterKind:
        if not self.is_registry_asset(asset):
            return ExecutionAdapterKind.VIEW_ONLY
        if asset.live_readiness in {LiveReadiness.DEMO_ONLY, LiveReadiness.BENCHMARK_ONLY}:
            return ExecutionAdapterKind.VIEW_ONLY
        if asset.execution_style == "erc20" and asset.contract_address:
            return ExecutionAdapterKind.DIRECT_CONTRACT
        if asset.execution_style == "issuer_portal":
            return ExecutionAdapterKind.ISSUER_PORTAL
        return ExecutionAdapterKind.VIEW_ONLY

    def resolve_execution_readiness(
        self,
        asset: AssetTemplate,
        *,
        blocked: bool = False,
    ) -> ExecutionReadiness:
        if blocked:
            return ExecutionReadiness.BLOCKED

        adapter_kind = self.resolve_execution_adapter(asset)
        if adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            return ExecutionReadiness.READY
        if adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            return ExecutionReadiness.REQUIRES_ISSUER
        return ExecutionReadiness.VIEW_ONLY

    @staticmethod
    def is_registry_asset(asset: AssetTemplate) -> bool:
        return asset.asset_id in LIVE_PROOF_ASSET_IDS

    @staticmethod
    def visibility_role(asset: AssetTemplate) -> str:
        if asset.live_readiness == LiveReadiness.DEMO_ONLY:
            return "demo_only"
        if asset.live_readiness == LiveReadiness.BENCHMARK_ONLY or asset.truth_level == TruthLevel.BENCHMARK_REFERENCE:
            return "benchmark_only"
        return "live"

    def registry_address(
        self,
        chain_config: HashKeyChainConfig,
        network: str,
    ) -> str:
        normalized = network.strip().lower()
        if normalized == "testnet":
            return (
                chain_config.testnet_asset_proof_registry_address
                or chain_config.asset_proof_registry_address
            )
        return (
            chain_config.mainnet_asset_proof_registry_address
            or chain_config.asset_proof_registry_address
        )

    def build_redemption_window(self, asset: AssetTemplate) -> RedemptionWindow:
        if asset.live_readiness == LiveReadiness.DEMO_ONLY:
            return RedemptionWindow(
                label="Demo only",
                window_type="demo_only",
                settlement_days=asset.redemption_days,
                detail="This asset stays visible for comparison only and should not be treated as executable.",
                next_window="",
                status="demo_only",
            )
        if asset.live_readiness == LiveReadiness.BENCHMARK_ONLY:
            return RedemptionWindow(
                label=asset.redemption_window or "Benchmark only",
                window_type="benchmark_only",
                settlement_days=asset.redemption_days,
                detail="This asset remains visible as a benchmark reference and is not part of the live RWA submit path.",
                next_window="",
                status="benchmark_only",
            )
        if asset.execution_style == "issuer_portal":
            label = asset.redemption_window or f"T+{asset.redemption_days or 2}"
            return RedemptionWindow(
                label=label,
                window_type="scheduled",
                settlement_days=asset.redemption_days,
                detail=asset.redemption_custody_note
                or "Redemption depends on issuer workflow and manual confirmation.",
                next_window=asset.redemption_window or label,
                status="scheduled",
            )

        label = asset.redemption_window or (f"T+{asset.redemption_days}" if asset.redemption_days else "T+0")
        return RedemptionWindow(
            label=label,
            window_type="instant" if asset.redemption_days == 0 else "scheduled",
            settlement_days=asset.redemption_days,
            detail=asset.redemption_custody_note or "Token can be monitored directly onchain.",
            next_window=asset.redemption_window or label,
            status="open" if asset.redemption_days == 0 else "scheduled",
        )

    def build_proof_sources(
        self,
        asset: AssetTemplate,
        chain_config: HashKeyChainConfig,
        network: str,
    ) -> list[ProofSourceRef]:
        refs: list[ProofSourceRef] = []
        seen: set[str] = set()

        def add_ref(
            *,
            title: str,
            source_name: str,
            source_url: str,
            source_kind: str = "official",
            source_tier: str = "official",
            summary: str = "",
            is_primary: bool = False,
            status: str = "available",
            unavailable_reason: str = "",
            confidence: float = 0.5,
        ) -> None:
            key = source_url.strip()
            if not key or key in seen:
                return
            seen.add(key)
            refs.append(
                ProofSourceRef(
                    ref_id=_hash_payload({"asset_id": asset.asset_id, "source_url": key})[:16],
                    title=title,
                    source_name=source_name,
                    source_url=source_url,
                    source_kind=source_kind,
                    source_tier=source_tier,
                    freshness_date=_utcnow().date().isoformat(),
                    summary=summary,
                    status=status,
                    unavailable_reason=unavailable_reason,
                    is_primary=is_primary,
                    confidence=confidence,
                )
            )

        if asset.primary_source_url:
            add_ref(
                title=f"{asset.name} primary disclosure",
                source_name=asset.issuer or "Issuer disclosure",
                source_url=asset.primary_source_url,
                source_kind="issuer",
                source_tier="official",
                summary=asset.status_explanation or asset.description,
                is_primary=True,
                confidence=0.9,
            )

        for url in asset.evidence_urls:
            add_ref(
                title=f"{asset.name} supporting reference",
                source_name="HashKey ecosystem reference",
                source_url=url,
                source_kind="official",
                source_tier="official",
                summary=asset.truth_level_explanation or asset.fit_summary,
                confidence=0.8,
            )

        if asset.contract_address:
            add_ref(
                title=f"{asset.symbol} contract",
                source_name="HashKey explorer",
                source_url=token_url(chain_config, network, asset.contract_address),
                source_kind="onchain",
                source_tier="verifiable",
                summary="Contract-level reference used in the proof snapshot.",
                confidence=1.0,
            )

        if asset.oracle_count:
            add_ref(
                title=f"{asset.symbol} oracle policy",
                source_name="HashKey oracle docs",
                source_url=oracle_docs_url(chain_config),
                source_kind="oracle",
                source_tier="official",
                summary="Reference for the oracle source or pricing policy used by this asset.",
                confidence=0.85,
            )

        if asset.requires_kyc_level:
            add_ref(
                title=f"{asset.symbol} KYC policy",
                source_name="HashKey KYC docs",
                source_url=kyc_docs_url(chain_config),
                source_kind="compliance",
                source_tier="official",
                summary=asset.holder_eligibility_note or "Investor access is gated by KYC or whitelist policy.",
                confidence=0.85,
            )

        return refs

    def build_proof_freshness(
        self,
        asset: AssetTemplate,
        *,
        registry_address: str,
        has_sources: bool,
    ) -> ProofFreshnessState:
        checked_at = _utcnow()
        reason = ""
        bucket = "aging"
        label = "Aging"

        if asset.live_readiness == LiveReadiness.DEMO_ONLY:
            bucket = "unavailable"
            label = "Demo only"
            reason = "This asset is intentionally excluded from live proof and execution."
        elif asset.live_readiness == LiveReadiness.BENCHMARK_ONLY:
            bucket = "aging"
            label = "Benchmark only"
            reason = "This asset stays visible as a benchmark reference and is not treated as a live executable RWA."
        elif not has_sources:
            bucket = "unavailable"
            label = "Unavailable"
            reason = "No disclosure or onchain source is available for a proof snapshot."
        elif registry_address and asset.onchain_verified:
            bucket = "fresh"
            label = "Fresh"
            reason = "Snapshot is anchored to an onchain-verifiable asset reference."
        elif asset.onchain_verified or asset.issuer_disclosed:
            bucket = "aging"
            label = "Aging"
            reason = "Snapshot is derived from current contract metadata and issuer disclosure references."
        else:
            bucket = "stale"
            label = "Stale"
            reason = "Asset facts are incomplete and need refreshed issuer or protocol evidence."

        return ProofFreshnessState(
            bucket=bucket,
            label=label,
            checked_at=checked_at,
            stale_after_hours=PROOF_STALE_AFTER_HOURS,
            age_hours=0.0,
            reason=reason,
        )

    @staticmethod
    def _source_confidence(source_refs: list[ProofSourceRef]) -> float:
        if not source_refs:
            return 0.0
        return round(sum(item.confidence for item in source_refs) / len(source_refs), 3)

    @staticmethod
    def _oracle_freshness(asset: AssetTemplate) -> str:
        if asset.last_oracle_timestamp is None:
            return "unavailable"
        age_hours = max((_utcnow() - asset.last_oracle_timestamp).total_seconds() / 3600, 0.0)
        if age_hours <= 24:
            return "fresh"
        if age_hours <= PROOF_STALE_AFTER_HOURS:
            return "aging"
        return "stale"

    @staticmethod
    def _kyc_policy_summary(asset: AssetTemplate) -> str:
        if asset.requires_kyc_level is None:
            return "Open access"
        return asset.holder_eligibility_note or f"KYC level {asset.requires_kyc_level}+ required"

    def _build_onchain_anchor_status(
        self,
        *,
        registry_address: str,
        snapshot: AssetProofSnapshot | None,
    ) -> OnchainAnchorStatus:
        if snapshot is not None:
            return snapshot.anchor_status
        if registry_address:
            return OnchainAnchorStatus(
                status="pending",
                registry_address=registry_address,
                note="Snapshot is eligible for onchain anchoring once published.",
            )
        return OnchainAnchorStatus(
            status="unconfigured",
            registry_address="",
            note="Asset proof registry is not configured for this network.",
        )

    def _build_snapshot(
        self,
        asset: AssetTemplate,
        chain_config: HashKeyChainConfig,
        *,
        network: str,
        previous_snapshot: AssetProofSnapshot | None = None,
    ) -> AssetProofSnapshot:
        registry_address = self.registry_address(chain_config, network)
        adapter_kind = self.resolve_execution_adapter(asset)
        readiness = self.resolve_execution_readiness(asset)
        source_refs = self.build_proof_sources(asset, chain_config, network)
        freshness = self.build_proof_freshness(
            asset,
            registry_address=registry_address,
            has_sources=bool(source_refs),
        )
        redemption_window = self.build_redemption_window(asset)
        included_in_registry = bool(registry_address and self.is_registry_asset(asset))
        unavailable_reasons: list[str] = []

        if not self.is_registry_asset(asset):
            unavailable_reasons.append("Asset is outside the v1 HashKey proof registry scope.")
        if asset.live_readiness == LiveReadiness.DEMO_ONLY:
            unavailable_reasons.append("Asset is demo-only and intentionally blocked from live execution.")
        if asset.live_readiness == LiveReadiness.BENCHMARK_ONLY:
            unavailable_reasons.append("Asset is benchmark-only and intentionally blocked from live execution.")
        if adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            unavailable_reasons.append("Execution depends on issuer or platform approval, not a public direct contract.")
        if adapter_kind == ExecutionAdapterKind.VIEW_ONLY:
            unavailable_reasons.append("Asset is reference-only in the current execution stack.")
        if not registry_address and self.is_registry_asset(asset):
            unavailable_reasons.append("Asset proof registry is not configured for this network yet.")

        status_cards = [
            ProofStatusCard(
                key="authenticity",
                label="真实性证明",
                status="verified"
                if asset.truth_level == TruthLevel.ONCHAIN_VERIFIED
                else (
                    "demo_only"
                    if asset.truth_level == TruthLevel.DEMO_ONLY
                    else ("benchmark_only" if asset.truth_level == TruthLevel.BENCHMARK_REFERENCE else "partial")
                ),
                detail=asset.truth_level_explanation or asset.status_explanation or asset.description,
            ),
            ProofStatusCard(
                key="eligibility",
                label="准入资格",
                status="permissioned" if asset.requires_kyc_level else "open",
                detail=asset.holder_eligibility_note
                or ("Requires KYC or whitelist review." if asset.requires_kyc_level else "Open wallet access."),
            ),
            ProofStatusCard(
                key="execution",
                label="执行方式",
                status=readiness.value,
                detail=asset.transfer_compliance_note
                or asset.status_explanation
                or "Execution route is derived from asset metadata and current live-readiness.",
            ),
            ProofStatusCard(
                key="redemption",
                label="流动性 / 赎回窗口",
                status=redemption_window.status,
                detail=redemption_window.detail,
            ),
            ProofStatusCard(
                key="monitoring",
                label="投后监控健康度",
                status=freshness.bucket,
                detail=freshness.reason,
            ),
        ]

        snapshot_payload = {
            "asset_id": asset.asset_id,
            "network": network,
            "truth_level": asset.truth_level.value,
            "live_readiness": asset.live_readiness.value,
            "execution_adapter_kind": adapter_kind.value,
            "execution_readiness": readiness.value,
            "required_kyc_level": asset.requires_kyc_level,
            "contract_address": asset.contract_address,
            "primary_source_url": asset.primary_source_url,
            "evidence_urls": asset.evidence_urls,
            "registry_address": registry_address,
            "redemption_window": redemption_window.model_dump(mode="json"),
            "oracle_freshness": self._oracle_freshness(asset),
            "kyc_policy_summary": self._kyc_policy_summary(asset),
        }
        snapshot_hash = _hash_payload(snapshot_payload)
        timeline_version = (
            (previous_snapshot.timeline_version + 1)
            if previous_snapshot is not None and previous_snapshot.snapshot_hash != snapshot_hash
            else (previous_snapshot.timeline_version if previous_snapshot is not None else 1)
        )
        anchor_status = self._build_onchain_anchor_status(
            registry_address=registry_address,
            snapshot=previous_snapshot if previous_snapshot and previous_snapshot.snapshot_hash == snapshot_hash else None,
        )
        publish_status = (
            previous_snapshot.publish_status
            if previous_snapshot is not None and previous_snapshot.snapshot_hash == snapshot_hash
            else ProofPublishStatus.PENDING
        )

        return AssetProofSnapshot(
            snapshot_id=(
                previous_snapshot.snapshot_id
                if previous_snapshot is not None and previous_snapshot.snapshot_hash == snapshot_hash
                else str(uuid4())
            ),
            asset_id=asset.asset_id,
            asset_name=asset.name,
            asset_symbol=asset.symbol,
            network=network,
            live_asset=self.is_registry_asset(asset),
            included_in_registry=included_in_registry,
            snapshot_hash=snapshot_hash,
            snapshot_uri=f"hashkey://asset-proof/{asset.asset_id}/{snapshot_hash[:24]}",
            proof_type="onchain_registry_anchor" if included_in_registry else "offchain_snapshot",
            effective_at=previous_snapshot.effective_at if previous_snapshot and previous_snapshot.snapshot_hash == snapshot_hash else _utcnow(),
            published_at=previous_snapshot.published_at if previous_snapshot and previous_snapshot.snapshot_hash == snapshot_hash else None,
            attester="genius-actuary-proof-service",
            registry_address=registry_address,
            registry_explorer_url=(
                address_url(chain_config, network, registry_address) if registry_address else ""
            ),
            anchor_status=anchor_status,
            timeline_version=timeline_version,
            publish_status=publish_status,
            onchain_proof_key=previous_snapshot.onchain_proof_key if previous_snapshot and previous_snapshot.snapshot_hash == snapshot_hash else "",
            execution_adapter_kind=adapter_kind,
            execution_readiness=readiness,
            truth_level=asset.truth_level,
            live_readiness=asset.live_readiness,
            required_kyc_level=asset.requires_kyc_level,
            proof_freshness=freshness,
            oracle_freshness=self._oracle_freshness(asset),
            kyc_policy_summary=self._kyc_policy_summary(asset),
            source_confidence=self._source_confidence(source_refs),
            redemption_window=redemption_window,
            status_cards=status_cards,
            proof_source_refs=source_refs,
            unavailable_reasons=unavailable_reasons,
            monitoring_notes=[
                note
                for note in [
                    asset.status_explanation,
                    asset.truth_level_explanation,
                    asset.redemption_custody_note,
                ]
                if note
            ],
            primary_action_url=(asset.action_links[0].url if asset.action_links else ""),
            visibility_role=self.visibility_role(asset),
            is_executable=readiness != ExecutionReadiness.VIEW_ONLY,
        )

    def build_asset_proof(
        self,
        asset: AssetTemplate,
        chain_config: HashKeyChainConfig,
        *,
        network: str,
    ) -> AssetProofSnapshot:
        previous = self.repository_service.get_latest(asset.asset_id, network)
        candidate = self._build_snapshot(
            asset,
            chain_config,
            network=network,
            previous_snapshot=previous,
        )
        if previous is not None and previous.snapshot_hash == candidate.snapshot_hash:
            return previous
        return self.repository_service.save_snapshot(candidate)

    def list_proof_history(
        self,
        *,
        asset_id: str,
        network: str,
        limit: int | None = None,
    ) -> list[AssetProofHistoryItem]:
        return [
            snapshot.to_history_item()
            for snapshot in self.repository_service.list_history(asset_id, network, limit=limit)
        ]

    def refresh_live_asset_proofs(
        self,
        *,
        assets: list[AssetTemplate],
        chain_config: HashKeyChainConfig,
        network: str,
    ) -> list[AssetProofSnapshot]:
        refreshed: list[AssetProofSnapshot] = []
        for asset in assets:
            if asset.asset_id not in LIVE_PROOF_ASSET_IDS:
                continue
            snapshot = self.build_asset_proof(asset, chain_config, network=network)
            if self.publisher_service is not None and snapshot.publish_status in {
                ProofPublishStatus.PENDING,
                ProofPublishStatus.RETRY,
            }:
                snapshot = self.publisher_service.publish_snapshot(snapshot)
            refreshed.append(snapshot)
        return refreshed

    def latest_with_timeline(
        self,
        asset: AssetTemplate,
        chain_config: HashKeyChainConfig,
        *,
        network: str,
        preview_limit: int = 5,
    ) -> tuple[AssetProofSnapshot, list[AssetProofHistoryItem]]:
        latest = self.build_asset_proof(asset, chain_config, network=network)
        history = self.list_proof_history(asset_id=asset.asset_id, network=network, limit=preview_limit)
        return latest, history
