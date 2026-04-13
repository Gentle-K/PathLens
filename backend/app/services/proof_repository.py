from __future__ import annotations

from app.domain.rwa import AssetProofSnapshot, ProofPublishAttempt


class ProofRepositoryService:
    def __init__(self, repository) -> None:
        self.repository = repository

    def save_snapshot(self, snapshot: AssetProofSnapshot) -> AssetProofSnapshot:
        return self.repository.save_proof_snapshot(snapshot)

    def get_latest(self, asset_id: str, network: str) -> AssetProofSnapshot | None:
        return self.repository.get_latest_proof(asset_id, network)

    def find_by_hash(
        self,
        *,
        asset_id: str,
        network: str,
        snapshot_hash: str,
    ) -> AssetProofSnapshot | None:
        return self.repository.find_proof_snapshot(
            asset_id=asset_id,
            network=network,
            snapshot_hash=snapshot_hash,
        )

    def get_snapshot(self, snapshot_id: str) -> AssetProofSnapshot | None:
        return self.repository.get_proof_snapshot(snapshot_id)

    def list_history(
        self,
        asset_id: str,
        network: str,
        limit: int | None = None,
    ) -> list[AssetProofSnapshot]:
        return self.repository.list_proof_history(asset_id, network, limit=limit)

    def list_pending(self, limit: int = 50) -> list[AssetProofSnapshot]:
        return self.repository.list_pending_proof_snapshots(limit=limit)

    def save_publish_attempt(self, attempt: ProofPublishAttempt) -> ProofPublishAttempt:
        return self.repository.save_publish_attempt(attempt)

    def list_publish_attempts(self, snapshot_id: str) -> list[ProofPublishAttempt]:
        return self.repository.list_publish_attempts(snapshot_id)
