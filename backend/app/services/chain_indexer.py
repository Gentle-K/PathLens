from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone

from app.config import REPO_ROOT, Settings
from app.domain.rwa import (
    AttesterRegistryStatus,
    IndexedAssetProofEvent,
    IndexedPlanHistoryItem,
    IndexerStatusItem,
    OnchainAnchorStatus,
    ProofPublishStatus,
)
from app.rwa.explorer_service import tx_url


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_datetime(timestamp: int | float | str | None) -> datetime | None:
    if timestamp in {None, "", 0, "0"}:
        return None
    return datetime.fromtimestamp(float(timestamp), tz=timezone.utc)


class ChainIndexerService:
    def __init__(
        self,
        *,
        repository,
        session_service,
        settings: Settings | None = None,
        ops_job_service=None,
    ) -> None:
        self.repository = repository
        self.session_service = session_service
        self.settings = settings or Settings.from_env()
        self.ops_job_service = ops_job_service

    def run(self, *, chain_config) -> list[IndexerStatusItem]:
        job_run = self.ops_job_service.start_job(job_name="chain_indexer") if self.ops_job_service else None
        processed = 0
        try:
            for network, contract_name, address in self._configured_contracts(chain_config):
                processed += self._index_contract(
                    chain_config=chain_config,
                    network=network,
                    contract_name=contract_name,
                    address=address,
                )
            statuses = self.status_snapshot(chain_config=chain_config)
            if job_run is not None:
                self.ops_job_service.finish_job(job_run, status="success", item_count=processed)
            return statuses
        except Exception as exc:
            if job_run is not None:
                self.ops_job_service.finish_job(
                    job_run,
                    status="failed",
                    item_count=processed,
                    error_message=str(exc),
                )
            raise

    def status_snapshot(self, *, chain_config) -> list[IndexerStatusItem]:
        configured: dict[tuple[str, str], str] = {
            (network, contract_name): address
            for network, contract_name, address in self._configured_contracts(chain_config, include_disabled=True)
        }
        current = {
            (item.network, item.contract_name): item
            for item in self.repository.list_indexer_status()
        }
        statuses: list[IndexerStatusItem] = []
        for (network, contract_name), address in configured.items():
            existing = current.get((network, contract_name))
            if existing is not None:
                statuses.append(existing)
                continue
            statuses.append(
                IndexerStatusItem(
                    network=network,
                    contract_name=contract_name,
                    contract_address=address,
                    status="disabled" if not address else "idle",
                    updated_at=_utcnow(),
                )
            )
        statuses.sort(key=lambda item: (item.network, item.contract_name))
        return statuses

    def list_asset_proof_history(self, *, asset_id: str, network: str) -> list[IndexedAssetProofEvent]:
        return self.repository.list_indexed_proof_events(asset_id=asset_id, network=network)

    def latest_asset_proof(self, *, asset_id: str, network: str) -> IndexedAssetProofEvent | None:
        return self.repository.get_latest_indexed_proof_event(asset_id=asset_id, network=network)

    def list_plan_history(self, *, asset_id: str, network: str) -> list[IndexedPlanHistoryItem]:
        return self.repository.list_indexed_plan_events(asset_id=asset_id, network=network)

    def latest_plan(self, *, asset_id: str, network: str) -> IndexedPlanHistoryItem | None:
        return self.repository.get_latest_indexed_plan_event(asset_id=asset_id, network=network)

    def attach_indexed_anchor(self, *, snapshot, chain_config):
        latest = self.latest_asset_proof(asset_id=snapshot.asset_id, network=snapshot.network)
        if latest is None:
            return snapshot
        indexed_status = OnchainAnchorStatus(
            status="indexed",
            proof_key=latest.proof_key,
            registry_address=latest.contract_address,
            transaction_hash=latest.transaction_hash,
            block_number=latest.block_number,
            explorer_url=tx_url(chain_config, snapshot.network, latest.transaction_hash),
            recorded_at=latest.recorded_at,
            attester=latest.attester,
            note="Indexed from AssetProofRegistry.",
        )
        snapshot.indexed_anchor_status = indexed_status
        snapshot.indexed_at = latest.indexed_at
        snapshot.history_source = "indexer"
        if snapshot.publish_status in {ProofPublishStatus.PENDING, ProofPublishStatus.RETRY}:
            snapshot.publish_status = ProofPublishStatus.PUBLISHED
        if not snapshot.onchain_proof_key:
            snapshot.onchain_proof_key = latest.proof_key
        if snapshot.anchor_status.status not in {"published", "indexed"}:
            snapshot.anchor_status = indexed_status
        return snapshot

    def read_attester_status(self, *, chain_config) -> list[AttesterRegistryStatus]:
        statuses: list[AttesterRegistryStatus] = []
        latest_publish_by_network: dict[str, IndexedAssetProofEvent] = {}
        for item in self.repository.list_indexed_proof_events():
            latest_publish_by_network.setdefault(item.network, item)

        for network, contract_name, address in self._configured_contracts(chain_config, include_disabled=True):
            if contract_name != "asset_proof_registry":
                continue
            if not address:
                statuses.append(
                    AttesterRegistryStatus(
                        network=network,
                        registry_address="",
                        publish_enabled=False,
                    )
                )
                continue
            try:
                payload = self._run_script(
                    mode="status",
                    contract="asset-proof",
                    network=network,
                    address=address,
                )
            except Exception:
                statuses.append(
                    AttesterRegistryStatus(
                        network=network,
                        registry_address=address,
                        publish_enabled=False,
                    )
                )
                continue
            latest_publish = latest_publish_by_network.get(network)
            attesters = list(payload.get("attesters") or [])
            if latest_publish and latest_publish.attester and latest_publish.attester not in attesters:
                attesters.append(latest_publish.attester)
            statuses.append(
                AttesterRegistryStatus(
                    network=network,
                    registry_address=address,
                    owner=str(payload.get("owner", "")),
                    pending_owner=str(payload.get("pendingOwner", "")),
                    publisher_address=str(payload.get("publisherAddress", "")),
                    publisher_authorized=bool(payload.get("publisherAuthorized", False)),
                    publish_enabled=bool(payload.get("publisherAddress")) and bool(payload.get("publisherAuthorized", False)),
                    attesters=attesters,
                    latest_publish_status="indexed" if latest_publish is not None else "",
                    latest_publish_tx_hash=latest_publish.transaction_hash if latest_publish is not None else "",
                    latest_publish_at=latest_publish.indexed_at if latest_publish is not None else None,
                )
            )
        return statuses

    def _configured_contracts(
        self,
        chain_config,
        *,
        include_disabled: bool = False,
    ) -> list[tuple[str, str, str]]:
        mapping = [
            (
                "testnet",
                "asset_proof_registry",
                chain_config.testnet_asset_proof_registry_address or chain_config.asset_proof_registry_address or "",
            ),
            (
                "mainnet",
                "asset_proof_registry",
                chain_config.mainnet_asset_proof_registry_address or chain_config.asset_proof_registry_address or "",
            ),
            (
                "testnet",
                "plan_registry",
                chain_config.testnet_plan_registry_address or chain_config.plan_registry_address or "",
            ),
            (
                "mainnet",
                "plan_registry",
                chain_config.mainnet_plan_registry_address or chain_config.plan_registry_address or "",
            ),
        ]
        return [item for item in mapping if include_disabled or item[2]]

    def _index_contract(
        self,
        *,
        chain_config,
        network: str,
        contract_name: str,
        address: str,
    ) -> int:
        current = self.repository.get_indexer_status(network=network, contract_name=contract_name)
        from_block = 0 if current is None else current.last_indexed_block + 1
        contract_arg = "asset-proof" if contract_name == "asset_proof_registry" else "plan"
        payload = self._run_script(
            mode="index",
            contract=contract_arg,
            network=network,
            address=address,
            from_block=from_block,
        )
        safe_head = int(payload.get("safeHead", 0))
        head_block = int(payload.get("headBlock", 0))
        events = payload.get("events") or []
        processed = 0
        if contract_name == "asset_proof_registry":
            for raw in events:
                event = IndexedAssetProofEvent(
                    event_id=f"{network}:{raw['transactionHash']}:{raw['logIndex']}",
                    asset_id=str(raw.get("assetId", "")),
                    network=network,
                    contract_address=address,
                    proof_key=str(raw.get("proofKey", "")),
                    snapshot_hash=str(raw.get("snapshotHash", "")),
                    snapshot_uri=str(raw.get("snapshotUri", "")),
                    proof_type=str(raw.get("proofType", "")),
                    attester=str(raw.get("attester", "")),
                    transaction_hash=str(raw.get("transactionHash", "")),
                    block_number=int(raw.get("blockNumber", 0)),
                    log_index=int(raw.get("logIndex", 0)),
                    effective_at=_to_datetime(raw.get("effectiveAt")),
                    recorded_at=_to_datetime(raw.get("recordedAt")),
                    indexed_at=_utcnow(),
                )
                self.repository.save_indexed_proof_event(event)
                processed += 1
        else:
            for raw in events:
                session_id = str(raw.get("sessionId", ""))
                asset_id = ""
                if session_id:
                    session = self.session_service.get_session(session_id)
                    if session is not None and session.execution_plan is not None:
                        asset_id = session.execution_plan.target_asset
                event = IndexedPlanHistoryItem(
                    event_id=f"{network}:{raw['transactionHash']}:{raw['logIndex']}",
                    asset_id=asset_id,
                    network=network,
                    contract_address=address,
                    attestation_hash=str(raw.get("attestationHash", "")),
                    report_hash=str(raw.get("reportHash", "")),
                    portfolio_hash=str(raw.get("portfolioHash", "")),
                    submitter=str(raw.get("submitter", "")),
                    session_id=session_id,
                    summary_uri=str(raw.get("summaryUri", "")),
                    transaction_hash=str(raw.get("transactionHash", "")),
                    block_number=int(raw.get("blockNumber", 0)),
                    log_index=int(raw.get("logIndex", 0)),
                    recorded_at=_to_datetime(raw.get("recordedAt")),
                    indexed_at=_utcnow(),
                )
                self.repository.save_indexed_plan_event(event)
                processed += 1

        status = IndexerStatusItem(
            network=network,
            contract_name=contract_name,
            contract_address=address,
            last_indexed_block=safe_head,
            last_safe_head=safe_head,
            chain_head=head_block,
            lag=max(head_block - safe_head, 0),
            status="synced",
            last_error="",
            updated_at=_utcnow(),
        )
        self.repository.save_indexer_status(status)
        return processed

    def _run_script(
        self,
        *,
        mode: str,
        contract: str,
        network: str,
        address: str,
        from_block: int | None = None,
        to_block: int | None = None,
    ) -> dict[str, object]:
        script_path = REPO_ROOT / "scripts" / "read_rwa_chain.mjs"
        command = [
            "node",
            str(script_path),
            "--mode",
            mode,
            "--contract",
            contract,
            "--network",
            network,
            "--address",
            address,
            "--finality-buffer",
            str(getattr(self.settings, "hashkey_indexer_finality_buffer", 2)),
        ]
        if from_block is not None:
            command.extend(["--from-block", str(from_block)])
        if to_block is not None:
            command.extend(["--to-block", str(to_block)])
        completed = subprocess.run(
            command,
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout.strip() or "{}")
