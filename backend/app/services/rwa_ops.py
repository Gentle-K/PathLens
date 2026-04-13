from __future__ import annotations

from app.domain.rwa import (
    ContractAnchorSummary,
    DebugOperationReceipt,
    ProofPublishStatus,
    RwaOpsSummary,
    SourceHealthStatus,
)
from app.services.ops_jobs import OpsJobService
from app.domain.rwa import utcnow


class RwaOpsService:
    def __init__(
        self,
        *,
        proof_service,
        proof_repository_service,
        proof_publisher_service,
        execution_status_sync_service,
        execution_receipts_service,
        chain_indexer_service,
        ops_job_service: OpsJobService,
    ) -> None:
        self.proof_service = proof_service
        self.proof_repository_service = proof_repository_service
        self.proof_publisher_service = proof_publisher_service
        self.execution_status_sync_service = execution_status_sync_service
        self.execution_receipts_service = execution_receipts_service
        self.chain_indexer_service = chain_indexer_service
        self.ops_job_service = ops_job_service

    def build_summary(
        self,
        *,
        assets,
        chain_config,
        network: str,
    ) -> RwaOpsSummary:
        live_assets = [
            asset
            for asset in assets
            if self.proof_service.is_registry_asset(asset)
        ]
        snapshots = [
            self.chain_indexer_service.attach_indexed_anchor(
                snapshot=self.proof_service.build_asset_proof(
                    asset,
                    chain_config,
                    network=network,
                ),
                chain_config=chain_config,
            )
            for asset in live_assets
        ]
        proof_queue = sorted(
            snapshots,
            key=lambda item: (
                0
                if item.publish_status in {ProofPublishStatus.RETRY, ProofPublishStatus.FAILED}
                else (1 if item.publish_status == ProofPublishStatus.PENDING else 2),
                item.asset_id,
            ),
        )
        source_health = [
            SourceHealthStatus(
                asset_id=snapshot.asset_id,
                asset_name=snapshot.asset_name,
                network=snapshot.network,
                visibility_role=snapshot.visibility_role,
                live_asset=snapshot.live_asset,
                proof_freshness_bucket=snapshot.proof_freshness.bucket,
                proof_freshness_label=snapshot.proof_freshness.label,
                oracle_freshness=snapshot.oracle_freshness,
                kyc_policy_summary=snapshot.kyc_policy_summary,
                source_confidence=snapshot.source_confidence,
                publish_status=snapshot.publish_status,
                unavailable_reasons=list(snapshot.unavailable_reasons),
            )
            for snapshot in snapshots
        ]
        contract_anchors: list[ContractAnchorSummary] = []
        for snapshot in snapshots:
            latest_proof = self.chain_indexer_service.latest_asset_proof(
                asset_id=snapshot.asset_id,
                network=network,
            )
            latest_plan = self.chain_indexer_service.latest_plan(
                asset_id=snapshot.asset_id,
                network=network,
            )
            history_count = len(
                self.chain_indexer_service.list_asset_proof_history(
                    asset_id=snapshot.asset_id,
                    network=network,
                )
            )
            contract_anchors.append(
                ContractAnchorSummary(
                    asset_id=snapshot.asset_id,
                    asset_name=snapshot.asset_name,
                    network=network,
                    visibility_role=snapshot.visibility_role,
                    is_live=snapshot.live_asset,
                    latest_proof_key=latest_proof.proof_key if latest_proof else snapshot.onchain_proof_key,
                    latest_snapshot_hash=latest_proof.snapshot_hash if latest_proof else snapshot.snapshot_hash,
                    latest_publish_status=(
                        "indexed"
                        if latest_proof is not None
                        else snapshot.publish_status.value
                    ),
                    latest_tx_hash=(
                        latest_proof.transaction_hash
                        if latest_proof is not None
                        else snapshot.anchor_status.transaction_hash
                    ),
                    latest_block_number=(
                        latest_proof.block_number
                        if latest_proof is not None
                        else snapshot.anchor_status.block_number
                    ),
                    latest_indexed_at=latest_proof.indexed_at if latest_proof is not None else snapshot.indexed_at,
                    proof_history_count=history_count,
                    latest_plan_key=latest_plan.attestation_hash if latest_plan is not None else "",
                    latest_plan_session_id=latest_plan.session_id if latest_plan is not None else "",
                    latest_plan_tx_hash=latest_plan.transaction_hash if latest_plan is not None else "",
                    latest_plan_block_number=latest_plan.block_number if latest_plan is not None else None,
                    latest_plan_indexed_at=latest_plan.indexed_at if latest_plan is not None else None,
                )
            )

        indexer_health = [
            item
            for item in self.chain_indexer_service.status_snapshot(chain_config=chain_config)
            if item.network == network
        ]
        jobs = self.ops_job_service.list_jobs(limit=20)
        return RwaOpsSummary(
            pending_publish_count=sum(1 for item in snapshots if item.publish_status == ProofPublishStatus.PENDING),
            failed_publish_count=sum(
                1 for item in snapshots if item.publish_status in {ProofPublishStatus.RETRY, ProofPublishStatus.FAILED}
            ),
            stale_proof_count=sum(
                1
                for item in snapshots
                if item.proof_freshness.bucket in {"stale", "unavailable"} or item.oracle_freshness == "stale"
            ),
            max_indexer_lag=max((item.lag for item in indexer_health), default=0),
            failed_job_count=sum(1 for item in jobs if item.status == "failed"),
            proof_queue=proof_queue,
            attester_status=[
                item
                for item in self.chain_indexer_service.read_attester_status(chain_config=chain_config)
                if item.network == network
            ],
            source_health=source_health,
            job_health=jobs,
            indexer_health=indexer_health,
            contract_anchors=contract_anchors,
        )

    def refresh_live_proofs(
        self,
        *,
        assets,
        chain_config,
        network: str,
    ) -> DebugOperationReceipt:
        job_run = self.ops_job_service.start_job(job_name="proof_refresh", network=network)
        try:
            refreshed = self.proof_service.refresh_live_asset_proofs(
                assets=assets,
                chain_config=chain_config,
                network=network,
            )
            finished = self.ops_job_service.finish_job(
                job_run,
                status="success",
                item_count=len(refreshed),
            )
            return self.ops_job_service.to_receipt(finished)
        except Exception as exc:
            finished = self.ops_job_service.finish_job(
                job_run,
                status="failed",
                error_message=str(exc),
            )
            return self.ops_job_service.to_receipt(finished)

    def retry_failed_publishes(self, *, network: str) -> DebugOperationReceipt:
        job_run = self.ops_job_service.start_job(job_name="proof_publish_retry", network=network)
        try:
            pending = [
                snapshot
                for snapshot in self.proof_repository_service.list_pending(limit=50)
                if snapshot.network == network and snapshot.publish_status in {ProofPublishStatus.RETRY, ProofPublishStatus.PENDING}
            ]
            published = [self.proof_publisher_service.publish_snapshot(snapshot) for snapshot in pending]
            finished = self.ops_job_service.finish_job(
                job_run,
                status="success",
                item_count=len(published),
            )
            return self.ops_job_service.to_receipt(finished)
        except Exception as exc:
            finished = self.ops_job_service.finish_job(
                job_run,
                status="failed",
                error_message=str(exc),
            )
            return self.ops_job_service.to_receipt(finished)

    def manual_publish_snapshot(self, *, snapshot_id: str) -> DebugOperationReceipt:
        snapshot = self.proof_repository_service.get_snapshot(snapshot_id)
        job_run = self.ops_job_service.start_job(
            job_name="proof_publish_manual",
            network=snapshot.network if snapshot else "",
            metadata={"snapshot_id": snapshot_id},
        )
        try:
            if snapshot is None:
                raise ValueError("Proof snapshot not found.")
            self.proof_publisher_service.publish_snapshot(snapshot)
            finished = self.ops_job_service.finish_job(job_run, status="success", item_count=1)
            return self.ops_job_service.to_receipt(finished)
        except Exception as exc:
            finished = self.ops_job_service.finish_job(
                job_run,
                status="failed",
                error_message=str(exc),
            )
            return self.ops_job_service.to_receipt(finished)

    def sync_execution_status(self) -> DebugOperationReceipt:
        job_run = self.ops_job_service.start_job(job_name="execution_status_sync")
        try:
            receipts = self.execution_receipts_service.list_receipts()
            synced = []
            for receipt in receipts:
                updated = self.execution_status_sync_service.sync_receipt(receipt.receipt_id)
                if updated is not None:
                    synced.append(updated)
            finished = self.ops_job_service.finish_job(
                job_run,
                status="success",
                item_count=len(synced),
            )
            return self.ops_job_service.to_receipt(finished)
        except Exception as exc:
            finished = self.ops_job_service.finish_job(
                job_run,
                status="failed",
                error_message=str(exc),
            )
            return self.ops_job_service.to_receipt(finished)

    def run_indexer(self, *, chain_config) -> DebugOperationReceipt:
        try:
            statuses = self.chain_indexer_service.run(chain_config=chain_config)
            status = "success" if all(item.status != "failed" for item in statuses) else "failed"
            last_job = self.ops_job_service.list_jobs(limit=1)
            if last_job and last_job[0].job_name == "chain_indexer":
                return self.ops_job_service.to_receipt(last_job[0])
            return DebugOperationReceipt(
                operation_id="chain-indexer",
                status=status,
                started_at=utcnow(),
                finished_at=utcnow(),
                item_count=len(statuses),
            )
        except Exception as exc:
            last_job = self.ops_job_service.list_jobs(limit=1)
            if last_job and last_job[0].job_name == "chain_indexer":
                return self.ops_job_service.to_receipt(last_job[0])
            return DebugOperationReceipt(
                operation_id="chain-indexer",
                status="failed",
                started_at=utcnow(),
                finished_at=utcnow(),
                error_message=str(exc),
            )
