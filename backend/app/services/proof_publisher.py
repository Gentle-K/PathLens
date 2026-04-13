from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.config import REPO_ROOT, Settings
from app.domain.rwa import (
    AssetProofSnapshot,
    OnchainAnchorStatus,
    ProofPublishAttempt,
    ProofPublishStatus,
)
from app.services.proof_repository import ProofRepositoryService


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProofPublisherService:
    def __init__(
        self,
        *,
        repository_service: ProofRepositoryService,
        settings: Settings | None = None,
    ) -> None:
        self.repository_service = repository_service
        self.settings = settings or Settings.from_env()

    def publish_snapshot(self, snapshot: AssetProofSnapshot) -> AssetProofSnapshot:
        registry_address = snapshot.registry_address
        if not registry_address:
            self.repository_service.save_publish_attempt(
                ProofPublishAttempt(
                    snapshot_id=snapshot.snapshot_id,
                    status=ProofPublishStatus.SKIPPED,
                    error_message="Asset proof registry is not configured for this network.",
                )
            )
            snapshot.anchor_status = OnchainAnchorStatus(
                status="unconfigured",
                registry_address="",
                note="Asset proof registry is not configured for this network.",
            )
            snapshot.publish_status = ProofPublishStatus.PENDING
            return self.repository_service.save_snapshot(snapshot)

        private_key = (
            self.settings.hashkey_testnet_asset_proof_registry_address
            or self.settings.hashkey_mainnet_asset_proof_registry_address
        )
        has_deployer_key = bool(
            self._env("ASSET_PROOF_REGISTRY_DEPLOYER_PRIVATE_KEY")
            or self._env("PLAN_REGISTRY_DEPLOYER_PRIVATE_KEY")
            or self._env("PRIVATE_KEY")
            or self._env("DEPLOYER_PRIVATE_KEY")
        )
        if not has_deployer_key:
            self.repository_service.save_publish_attempt(
                ProofPublishAttempt(
                    snapshot_id=snapshot.snapshot_id,
                    status=ProofPublishStatus.SKIPPED,
                    error_message="No deployer key configured; snapshot remains pending for manual or later publish.",
                )
            )
            snapshot.anchor_status = OnchainAnchorStatus(
                status="awaiting_publish",
                registry_address=registry_address,
                note="No deployer key configured; snapshot remains pending for later publish.",
            )
            snapshot.publish_status = ProofPublishStatus.PENDING
            return self.repository_service.save_snapshot(snapshot)

        script_path = REPO_ROOT / "scripts" / "publish_asset_proof.mjs"
        if not script_path.exists():
            self.repository_service.save_publish_attempt(
                ProofPublishAttempt(
                    snapshot_id=snapshot.snapshot_id,
                    status=ProofPublishStatus.FAILED,
                    error_message="Missing publish_asset_proof.mjs helper script.",
                )
            )
            snapshot.publish_status = ProofPublishStatus.RETRY
            snapshot.anchor_status = OnchainAnchorStatus(
                status="publish_failed",
                registry_address=registry_address,
                note="Missing publish_asset_proof.mjs helper script.",
            )
            return self.repository_service.save_snapshot(snapshot)

        command = [
            "node",
            str(script_path),
            "--network",
            snapshot.network,
            "--registry",
            registry_address,
            "--asset-id",
            snapshot.asset_id,
            "--snapshot-hash",
            snapshot.snapshot_hash,
            "--snapshot-uri",
            snapshot.snapshot_uri,
            "--proof-type",
            snapshot.proof_type,
            "--effective-at",
            str(int(snapshot.effective_at.timestamp())),
        ]
        try:
            completed = subprocess.run(
                command,
                cwd=REPO_ROOT,
                check=True,
                text=True,
                capture_output=True,
            )
            payload = json.loads(completed.stdout.strip() or "{}")
            snapshot.publish_status = ProofPublishStatus.PUBLISHED
            snapshot.published_at = _utcnow()
            snapshot.onchain_proof_key = str(payload.get("proofKey", ""))
            snapshot.anchor_status = OnchainAnchorStatus(
                status="published",
                proof_key=str(payload.get("proofKey", "")),
                registry_address=registry_address,
                transaction_hash=str(payload.get("transactionHash", "")),
                block_number=payload.get("blockNumber"),
                explorer_url=str(payload.get("explorerUrl", "")),
                recorded_at=snapshot.published_at,
                attester=str(payload.get("attester", "")),
                note="Published to AssetProofRegistry.",
            )
            self.repository_service.save_publish_attempt(
                ProofPublishAttempt(
                    snapshot_id=snapshot.snapshot_id,
                    status=ProofPublishStatus.PUBLISHED,
                    tx_hash=str(payload.get("transactionHash", "")),
                    block_number=payload.get("blockNumber"),
                    published_at=snapshot.published_at,
                )
            )
        except Exception as exc:  # pragma: no cover - exercised in integration paths
            snapshot.publish_status = ProofPublishStatus.RETRY
            snapshot.anchor_status = OnchainAnchorStatus(
                status="publish_failed",
                registry_address=registry_address,
                note=str(exc),
            )
            self.repository_service.save_publish_attempt(
                ProofPublishAttempt(
                    snapshot_id=snapshot.snapshot_id,
                    status=ProofPublishStatus.FAILED,
                    error_message=str(exc),
                )
            )
        return self.repository_service.save_snapshot(snapshot)

    def publish_pending_snapshots(self, limit: int = 50) -> list[AssetProofSnapshot]:
        published: list[AssetProofSnapshot] = []
        for snapshot in self.repository_service.list_pending(limit=limit):
            published.append(self.publish_snapshot(snapshot))
        return published

    @staticmethod
    def _env(key: str) -> str:
        return str(__import__("os").getenv(key, "")).strip()
