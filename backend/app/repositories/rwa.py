from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Iterator

from app.domain.rwa import (
    ContractAnchorSummary,
    IndexedAssetProofEvent,
    IndexedPlanHistoryItem,
    IndexerStatusItem,
    OpsJobRun,
    RwaOpsSummary,
    SourceHealthStatus,
    AssetProofSnapshot,
    ExecutionReceipt,
    IssuerRequestRecord,
    PortfolioAlert,
    PortfolioAlertAck,
    ProofPublishAttempt,
    ProofPublishStatus,
)


class InMemoryRwaRepository:
    def __init__(self) -> None:
        self._proof_snapshots: dict[str, AssetProofSnapshot] = {}
        self._proof_by_key: dict[tuple[str, str, str], str] = {}
        self._latest_proof: dict[tuple[str, str], str] = {}
        self._publish_attempts: dict[str, ProofPublishAttempt] = {}
        self._execution_receipts: dict[str, ExecutionReceipt] = {}
        self._issuer_requests: dict[str, IssuerRequestRecord] = {}
        self._alerts: dict[str, PortfolioAlert] = {}
        self._alert_states: dict[tuple[str, str], PortfolioAlertAck] = {}
        self._indexer_status: dict[tuple[str, str], IndexerStatusItem] = {}
        self._indexed_proof_events: dict[str, IndexedAssetProofEvent] = {}
        self._indexed_plan_events: dict[str, IndexedPlanHistoryItem] = {}
        self._ops_job_runs: dict[str, OpsJobRun] = {}

    def save_proof_snapshot(self, snapshot: AssetProofSnapshot) -> AssetProofSnapshot:
        key = (snapshot.asset_id, snapshot.network, snapshot.snapshot_hash)
        existing_id = self._proof_by_key.get(key)
        if existing_id:
            snapshot.snapshot_id = existing_id
            self._proof_snapshots[existing_id] = deepcopy(snapshot)
            self._latest_proof[(snapshot.asset_id, snapshot.network)] = existing_id
            return deepcopy(snapshot)
        self._proof_snapshots[snapshot.snapshot_id] = deepcopy(snapshot)
        self._proof_by_key[key] = snapshot.snapshot_id
        self._latest_proof[(snapshot.asset_id, snapshot.network)] = snapshot.snapshot_id
        return deepcopy(snapshot)

    def get_latest_proof(self, asset_id: str, network: str) -> AssetProofSnapshot | None:
        snapshot_id = self._latest_proof.get((asset_id, network))
        if snapshot_id is None:
            return None
        snapshot = self._proof_snapshots.get(snapshot_id)
        return deepcopy(snapshot) if snapshot else None

    def get_proof_snapshot(self, snapshot_id: str) -> AssetProofSnapshot | None:
        snapshot = self._proof_snapshots.get(snapshot_id)
        return deepcopy(snapshot) if snapshot else None

    def find_proof_snapshot(
        self,
        *,
        asset_id: str,
        network: str,
        snapshot_hash: str,
    ) -> AssetProofSnapshot | None:
        snapshot_id = self._proof_by_key.get((asset_id, network, snapshot_hash))
        if snapshot_id is None:
            return None
        snapshot = self._proof_snapshots.get(snapshot_id)
        return deepcopy(snapshot) if snapshot else None

    def list_proof_history(
        self,
        asset_id: str,
        network: str,
        limit: int | None = None,
    ) -> list[AssetProofSnapshot]:
        rows = [
            snapshot
            for snapshot in self._proof_snapshots.values()
            if snapshot.asset_id == asset_id and snapshot.network == network
        ]
        rows.sort(key=lambda item: (item.effective_at, item.timeline_version), reverse=True)
        if limit is not None:
            rows = rows[:limit]
        return [deepcopy(item) for item in rows]

    def list_pending_proof_snapshots(self, limit: int = 50) -> list[AssetProofSnapshot]:
        rows = [
            snapshot
            for snapshot in self._proof_snapshots.values()
            if snapshot.publish_status in {ProofPublishStatus.PENDING, ProofPublishStatus.RETRY}
        ]
        rows.sort(key=lambda item: item.effective_at)
        return [deepcopy(item) for item in rows[:limit]]

    def save_publish_attempt(self, attempt: ProofPublishAttempt) -> ProofPublishAttempt:
        self._publish_attempts[attempt.attempt_id] = deepcopy(attempt)
        return deepcopy(attempt)

    def list_publish_attempts(self, snapshot_id: str) -> list[ProofPublishAttempt]:
        rows = [
            attempt for attempt in self._publish_attempts.values() if attempt.snapshot_id == snapshot_id
        ]
        rows.sort(key=lambda item: item.created_at, reverse=True)
        return [deepcopy(item) for item in rows]

    def save_execution_receipt(self, receipt: ExecutionReceipt) -> ExecutionReceipt:
        self._execution_receipts[receipt.receipt_id] = deepcopy(receipt)
        return deepcopy(receipt)

    def get_execution_receipt(self, receipt_id: str) -> ExecutionReceipt | None:
        receipt = self._execution_receipts.get(receipt_id)
        return deepcopy(receipt) if receipt else None

    def list_execution_receipts(
        self,
        *,
        session_id: str = "",
        asset_id: str = "",
    ) -> list[ExecutionReceipt]:
        rows = list(self._execution_receipts.values())
        if session_id:
            rows = [item for item in rows if item.session_id == session_id]
        if asset_id:
            rows = [item for item in rows if item.asset_id == asset_id]
        rows.sort(key=lambda item: item.updated_at, reverse=True)
        return [deepcopy(item) for item in rows]

    def save_issuer_request(self, request: IssuerRequestRecord) -> IssuerRequestRecord:
        self._issuer_requests[request.request_id] = deepcopy(request)
        return deepcopy(request)

    def get_issuer_request(self, request_id: str) -> IssuerRequestRecord | None:
        request = self._issuer_requests.get(request_id)
        return deepcopy(request) if request else None

    def list_issuer_requests(self, *, receipt_id: str = "") -> list[IssuerRequestRecord]:
        rows = list(self._issuer_requests.values())
        if receipt_id:
            rows = [item for item in rows if item.receipt_id == receipt_id]
        rows.sort(key=lambda item: item.last_synced_at, reverse=True)
        return [deepcopy(item) for item in rows]

    def save_alert_event(self, alert: PortfolioAlert) -> PortfolioAlert:
        self._alerts[alert.alert_id] = deepcopy(alert)
        return deepcopy(alert)

    def get_alert(self, alert_id: str) -> PortfolioAlert | None:
        alert = self._alerts.get(alert_id)
        return deepcopy(alert) if alert else None

    def find_alert_by_dedupe_key(self, *, address: str, dedupe_key: str) -> PortfolioAlert | None:
        for alert in self._alerts.values():
            if alert.address == address and alert.dedupe_key == dedupe_key:
                return deepcopy(alert)
        return None

    def list_alerts(self, *, address: str, include_resolved: bool = True) -> list[PortfolioAlert]:
        rows = [alert for alert in self._alerts.values() if alert.address == address]
        if not include_resolved:
            rows = [item for item in rows if item.status != "resolved"]
        rows.sort(key=lambda item: item.detected_at, reverse=True)
        hydrated = [self._hydrate_alert_state(item) for item in rows]
        return [deepcopy(item) for item in hydrated]

    def save_alert_state(self, state: PortfolioAlertAck) -> PortfolioAlertAck:
        self._alert_states[(state.address, state.alert_id)] = deepcopy(state)
        return deepcopy(state)

    def get_alert_state(self, *, address: str, alert_id: str) -> PortfolioAlertAck | None:
        state = self._alert_states.get((address, alert_id))
        return deepcopy(state) if state else None

    def _hydrate_alert_state(self, alert: PortfolioAlert) -> PortfolioAlert:
        state = self._alert_states.get((alert.address, alert.alert_id))
        hydrated = deepcopy(alert)
        if state is not None:
            hydrated.acked = state.acked
            hydrated.acknowledged_at = state.acknowledged_at
            hydrated.read = state.read
            hydrated.read_at = state.read_at
        return hydrated

    def save_indexer_status(self, status: IndexerStatusItem) -> IndexerStatusItem:
        self._indexer_status[(status.network, status.contract_name)] = deepcopy(status)
        return deepcopy(status)

    def list_indexer_status(self) -> list[IndexerStatusItem]:
        rows = list(self._indexer_status.values())
        rows.sort(key=lambda item: (item.network, item.contract_name))
        return [deepcopy(item) for item in rows]

    def get_indexer_status(self, *, network: str, contract_name: str) -> IndexerStatusItem | None:
        status = self._indexer_status.get((network, contract_name))
        return deepcopy(status) if status else None

    def save_indexed_proof_event(self, event: IndexedAssetProofEvent) -> IndexedAssetProofEvent:
        self._indexed_proof_events[event.event_id] = deepcopy(event)
        return deepcopy(event)

    def list_indexed_proof_events(
        self,
        *,
        asset_id: str = "",
        network: str = "",
    ) -> list[IndexedAssetProofEvent]:
        rows = list(self._indexed_proof_events.values())
        if asset_id:
            rows = [item for item in rows if item.asset_id == asset_id]
        if network:
            rows = [item for item in rows if item.network == network]
        rows.sort(key=lambda item: (item.block_number, item.log_index), reverse=True)
        return [deepcopy(item) for item in rows]

    def get_latest_indexed_proof_event(
        self,
        *,
        asset_id: str,
        network: str,
    ) -> IndexedAssetProofEvent | None:
        rows = self.list_indexed_proof_events(asset_id=asset_id, network=network)
        return rows[0] if rows else None

    def save_indexed_plan_event(self, event: IndexedPlanHistoryItem) -> IndexedPlanHistoryItem:
        self._indexed_plan_events[event.event_id] = deepcopy(event)
        return deepcopy(event)

    def list_indexed_plan_events(
        self,
        *,
        asset_id: str = "",
        network: str = "",
    ) -> list[IndexedPlanHistoryItem]:
        rows = list(self._indexed_plan_events.values())
        if asset_id:
            rows = [item for item in rows if item.asset_id == asset_id]
        if network:
            rows = [item for item in rows if item.network == network]
        rows.sort(key=lambda item: (item.block_number, item.log_index), reverse=True)
        return [deepcopy(item) for item in rows]

    def get_latest_indexed_plan_event(
        self,
        *,
        asset_id: str,
        network: str,
    ) -> IndexedPlanHistoryItem | None:
        rows = self.list_indexed_plan_events(asset_id=asset_id, network=network)
        return rows[0] if rows else None

    def save_ops_job_run(self, job_run: OpsJobRun) -> OpsJobRun:
        self._ops_job_runs[job_run.job_run_id] = deepcopy(job_run)
        return deepcopy(job_run)

    def list_ops_job_runs(self, *, limit: int = 20) -> list[OpsJobRun]:
        rows = sorted(
            self._ops_job_runs.values(),
            key=lambda item: item.started_at,
            reverse=True,
        )
        return [deepcopy(item) for item in rows[:limit]]


class SQLiteRwaRepository:
    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _open_connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = self._open_connection()
        try:
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS proof_snapshots (
                    snapshot_id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    snapshot_hash TEXT NOT NULL,
                    snapshot_uri TEXT NOT NULL,
                    proof_type TEXT NOT NULL,
                    effective_at TEXT NOT NULL,
                    published_at TEXT,
                    attester TEXT NOT NULL,
                    publish_status TEXT NOT NULL,
                    onchain_proof_key TEXT NOT NULL,
                    registry_address TEXT NOT NULL,
                    oracle_freshness TEXT NOT NULL,
                    kyc_policy_summary TEXT NOT NULL,
                    source_confidence REAL NOT NULL,
                    unavailable_reasons_json TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    UNIQUE(asset_id, network, snapshot_hash)
                );
                CREATE INDEX IF NOT EXISTS idx_proof_snapshots_asset_network_effective
                ON proof_snapshots (asset_id, network, effective_at DESC);

                CREATE TABLE IF NOT EXISTS asset_latest_proof (
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    snapshot_id TEXT NOT NULL,
                    PRIMARY KEY (asset_id, network)
                );

                CREATE TABLE IF NOT EXISTS proof_publish_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    snapshot_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    tx_hash TEXT NOT NULL,
                    block_number INTEGER,
                    error_message TEXT NOT NULL,
                    published_at TEXT,
                    created_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_proof_publish_attempts_snapshot
                ON proof_publish_attempts (snapshot_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS execution_receipts (
                    receipt_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    asset_id TEXT NOT NULL,
                    adapter_kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    settlement_status TEXT NOT NULL,
                    external_request_id TEXT NOT NULL,
                    redirect_url TEXT NOT NULL,
                    tx_hash TEXT NOT NULL,
                    block_number INTEGER,
                    wallet_address TEXT NOT NULL,
                    safe_address TEXT NOT NULL,
                    failure_reason TEXT NOT NULL,
                    submitted_at TEXT,
                    updated_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_execution_receipts_session_updated
                ON execution_receipts (session_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS issuer_requests (
                    request_id TEXT PRIMARY KEY,
                    receipt_id TEXT NOT NULL,
                    asset_id TEXT NOT NULL,
                    issuer_case_id TEXT NOT NULL,
                    redirect_url TEXT NOT NULL,
                    issuer_status TEXT NOT NULL,
                    last_synced_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_issuer_requests_receipt
                ON issuer_requests (receipt_id, last_synced_at DESC);

                CREATE TABLE IF NOT EXISTS portfolio_alert_events (
                    alert_id TEXT PRIMARY KEY,
                    address TEXT NOT NULL,
                    asset_id TEXT NOT NULL,
                    alert_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    title TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    source_ref TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    dedupe_key TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detected_at TEXT NOT NULL,
                    resolved_at TEXT,
                    payload_json TEXT NOT NULL,
                    UNIQUE(address, dedupe_key)
                );
                CREATE INDEX IF NOT EXISTS idx_portfolio_alert_events_address_detected
                ON portfolio_alert_events (address, detected_at DESC);

                CREATE TABLE IF NOT EXISTS portfolio_alert_states (
                    address TEXT NOT NULL,
                    alert_id TEXT NOT NULL,
                    acked INTEGER NOT NULL DEFAULT 0,
                    acknowledged_at TEXT,
                    read INTEGER NOT NULL DEFAULT 0,
                    read_at TEXT,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (address, alert_id)
                );

                CREATE TABLE IF NOT EXISTS chain_index_cursors (
                    network TEXT NOT NULL,
                    contract_name TEXT NOT NULL,
                    contract_address TEXT NOT NULL,
                    last_indexed_block INTEGER NOT NULL DEFAULT 0,
                    last_safe_head INTEGER NOT NULL DEFAULT 0,
                    chain_head INTEGER NOT NULL DEFAULT 0,
                    lag INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'idle',
                    last_error TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (network, contract_name)
                );

                CREATE TABLE IF NOT EXISTS indexed_asset_proof_events (
                    event_id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    contract_address TEXT NOT NULL,
                    proof_key TEXT NOT NULL,
                    transaction_hash TEXT NOT NULL,
                    block_number INTEGER NOT NULL,
                    log_index INTEGER NOT NULL,
                    indexed_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    UNIQUE(network, contract_address, transaction_hash, log_index)
                );
                CREATE INDEX IF NOT EXISTS idx_indexed_asset_proof_events_asset
                ON indexed_asset_proof_events (asset_id, network, block_number DESC, log_index DESC);

                CREATE TABLE IF NOT EXISTS indexed_asset_proof_latest (
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (asset_id, network)
                );

                CREATE TABLE IF NOT EXISTS indexed_plan_events (
                    event_id TEXT PRIMARY KEY,
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    contract_address TEXT NOT NULL,
                    attestation_hash TEXT NOT NULL,
                    transaction_hash TEXT NOT NULL,
                    block_number INTEGER NOT NULL,
                    log_index INTEGER NOT NULL,
                    indexed_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    UNIQUE(network, contract_address, transaction_hash, log_index)
                );
                CREATE INDEX IF NOT EXISTS idx_indexed_plan_events_asset
                ON indexed_plan_events (asset_id, network, block_number DESC, log_index DESC);

                CREATE TABLE IF NOT EXISTS indexed_plan_latest (
                    asset_id TEXT NOT NULL,
                    network TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (asset_id, network)
                );

                CREATE TABLE IF NOT EXISTS ops_job_runs (
                    job_run_id TEXT PRIMARY KEY,
                    job_name TEXT NOT NULL,
                    network TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    item_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ops_job_runs_started
                ON ops_job_runs (started_at DESC);
                """
            )
            connection.commit()

    def save_proof_snapshot(self, snapshot: AssetProofSnapshot) -> AssetProofSnapshot:
        existing = self.find_proof_snapshot(
            asset_id=snapshot.asset_id,
            network=snapshot.network,
            snapshot_hash=snapshot.snapshot_hash,
        )
        snapshot_id = existing.snapshot_id if existing is not None else snapshot.snapshot_id

        snapshot.snapshot_id = snapshot_id
        payload_json = snapshot.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO proof_snapshots (
                    snapshot_id, asset_id, network, snapshot_hash, snapshot_uri, proof_type,
                    effective_at, published_at, attester, publish_status, onchain_proof_key,
                    registry_address, oracle_freshness, kyc_policy_summary, source_confidence,
                    unavailable_reasons_json, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(snapshot_id) DO UPDATE SET
                    asset_id = excluded.asset_id,
                    network = excluded.network,
                    snapshot_hash = excluded.snapshot_hash,
                    snapshot_uri = excluded.snapshot_uri,
                    proof_type = excluded.proof_type,
                    effective_at = excluded.effective_at,
                    published_at = excluded.published_at,
                    attester = excluded.attester,
                    publish_status = excluded.publish_status,
                    onchain_proof_key = excluded.onchain_proof_key,
                    registry_address = excluded.registry_address,
                    oracle_freshness = excluded.oracle_freshness,
                    kyc_policy_summary = excluded.kyc_policy_summary,
                    source_confidence = excluded.source_confidence,
                    unavailable_reasons_json = excluded.unavailable_reasons_json,
                    payload_json = excluded.payload_json
                """,
                (
                    snapshot_id,
                    snapshot.asset_id,
                    snapshot.network,
                    snapshot.snapshot_hash,
                    snapshot.snapshot_uri,
                    snapshot.proof_type,
                    snapshot.effective_at.isoformat(),
                    snapshot.published_at.isoformat() if snapshot.published_at else None,
                    snapshot.attester,
                    snapshot.publish_status.value,
                    snapshot.onchain_proof_key,
                    snapshot.registry_address,
                    snapshot.oracle_freshness,
                    snapshot.kyc_policy_summary,
                    snapshot.source_confidence,
                    str(snapshot.unavailable_reasons),
                    payload_json,
                ),
            )
            connection.commit()
        self._set_latest_proof(snapshot.asset_id, snapshot.network, snapshot_id)
        return AssetProofSnapshot.model_validate_json(payload_json)

    def _set_latest_proof(self, asset_id: str, network: str, snapshot_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO asset_latest_proof (asset_id, network, snapshot_id)
                VALUES (?, ?, ?)
                ON CONFLICT(asset_id, network) DO UPDATE SET
                    snapshot_id = excluded.snapshot_id
                """,
                (asset_id, network, snapshot_id),
            )
            connection.commit()

    def get_latest_proof(self, asset_id: str, network: str) -> AssetProofSnapshot | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT p.payload_json
                FROM asset_latest_proof latest
                JOIN proof_snapshots p ON p.snapshot_id = latest.snapshot_id
                WHERE latest.asset_id = ? AND latest.network = ?
                """,
                (asset_id, network),
            ).fetchone()
        if row is None:
            return None
        return AssetProofSnapshot.model_validate_json(row["payload_json"])

    def get_proof_snapshot(self, snapshot_id: str) -> AssetProofSnapshot | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM proof_snapshots WHERE snapshot_id = ?",
                (snapshot_id,),
            ).fetchone()
        if row is None:
            return None
        return AssetProofSnapshot.model_validate_json(row["payload_json"])

    def find_proof_snapshot(
        self,
        *,
        asset_id: str,
        network: str,
        snapshot_hash: str,
    ) -> AssetProofSnapshot | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json FROM proof_snapshots
                WHERE asset_id = ? AND network = ? AND snapshot_hash = ?
                """,
                (asset_id, network, snapshot_hash),
            ).fetchone()
        if row is None:
            return None
        return AssetProofSnapshot.model_validate_json(row["payload_json"])

    def list_proof_history(
        self,
        asset_id: str,
        network: str,
        limit: int | None = None,
    ) -> list[AssetProofSnapshot]:
        sql = """
            SELECT payload_json
            FROM proof_snapshots
            WHERE asset_id = ? AND network = ?
            ORDER BY effective_at DESC, rowid DESC
        """
        params: list[object] = [asset_id, network]
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        return [AssetProofSnapshot.model_validate_json(row["payload_json"]) for row in rows]

    def list_pending_proof_snapshots(self, limit: int = 50) -> list[AssetProofSnapshot]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM proof_snapshots
                WHERE publish_status IN (?, ?)
                ORDER BY effective_at ASC
                LIMIT ?
                """,
                (ProofPublishStatus.PENDING.value, ProofPublishStatus.RETRY.value, limit),
            ).fetchall()
        return [AssetProofSnapshot.model_validate_json(row["payload_json"]) for row in rows]

    def save_publish_attempt(self, attempt: ProofPublishAttempt) -> ProofPublishAttempt:
        payload_json = attempt.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO proof_publish_attempts (
                    attempt_id, snapshot_id, status, tx_hash, block_number,
                    error_message, published_at, created_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(attempt_id) DO UPDATE SET
                    status = excluded.status,
                    tx_hash = excluded.tx_hash,
                    block_number = excluded.block_number,
                    error_message = excluded.error_message,
                    published_at = excluded.published_at,
                    created_at = excluded.created_at,
                    payload_json = excluded.payload_json
                """,
                (
                    attempt.attempt_id,
                    attempt.snapshot_id,
                    attempt.status.value,
                    attempt.tx_hash,
                    attempt.block_number,
                    attempt.error_message,
                    attempt.published_at.isoformat() if attempt.published_at else None,
                    attempt.created_at.isoformat(),
                    payload_json,
                ),
            )
            connection.commit()
        return ProofPublishAttempt.model_validate_json(payload_json)

    def list_publish_attempts(self, snapshot_id: str) -> list[ProofPublishAttempt]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM proof_publish_attempts
                WHERE snapshot_id = ?
                ORDER BY created_at DESC
                """,
                (snapshot_id,),
            ).fetchall()
        return [ProofPublishAttempt.model_validate_json(row["payload_json"]) for row in rows]

    def save_execution_receipt(self, receipt: ExecutionReceipt) -> ExecutionReceipt:
        payload_json = receipt.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO execution_receipts (
                    receipt_id, session_id, asset_id, adapter_kind, status, settlement_status,
                    external_request_id, redirect_url, tx_hash, block_number, wallet_address,
                    safe_address, failure_reason, submitted_at, updated_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(receipt_id) DO UPDATE SET
                    session_id = excluded.session_id,
                    asset_id = excluded.asset_id,
                    adapter_kind = excluded.adapter_kind,
                    status = excluded.status,
                    settlement_status = excluded.settlement_status,
                    external_request_id = excluded.external_request_id,
                    redirect_url = excluded.redirect_url,
                    tx_hash = excluded.tx_hash,
                    block_number = excluded.block_number,
                    wallet_address = excluded.wallet_address,
                    safe_address = excluded.safe_address,
                    failure_reason = excluded.failure_reason,
                    submitted_at = excluded.submitted_at,
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json
                """,
                (
                    receipt.receipt_id,
                    receipt.session_id,
                    receipt.asset_id,
                    receipt.adapter_kind.value,
                    receipt.status.value,
                    receipt.settlement_status.value,
                    receipt.external_request_id,
                    receipt.redirect_url,
                    receipt.tx_hash,
                    receipt.block_number,
                    receipt.wallet_address,
                    receipt.safe_address,
                    receipt.failure_reason,
                    receipt.submitted_at.isoformat() if receipt.submitted_at else None,
                    receipt.updated_at.isoformat(),
                    payload_json,
                ),
            )
            connection.commit()
        return ExecutionReceipt.model_validate_json(payload_json)

    def get_execution_receipt(self, receipt_id: str) -> ExecutionReceipt | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM execution_receipts WHERE receipt_id = ?",
                (receipt_id,),
            ).fetchone()
        if row is None:
            return None
        return ExecutionReceipt.model_validate_json(row["payload_json"])

    def list_execution_receipts(
        self,
        *,
        session_id: str = "",
        asset_id: str = "",
    ) -> list[ExecutionReceipt]:
        sql = "SELECT payload_json FROM execution_receipts WHERE 1=1"
        params: list[object] = []
        if session_id:
            sql += " AND session_id = ?"
            params.append(session_id)
        if asset_id:
            sql += " AND asset_id = ?"
            params.append(asset_id)
        sql += " ORDER BY updated_at DESC"
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        return [ExecutionReceipt.model_validate_json(row["payload_json"]) for row in rows]

    def save_issuer_request(self, request: IssuerRequestRecord) -> IssuerRequestRecord:
        payload_json = request.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO issuer_requests (
                    request_id, receipt_id, asset_id, issuer_case_id,
                    redirect_url, issuer_status, last_synced_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(request_id) DO UPDATE SET
                    receipt_id = excluded.receipt_id,
                    asset_id = excluded.asset_id,
                    issuer_case_id = excluded.issuer_case_id,
                    redirect_url = excluded.redirect_url,
                    issuer_status = excluded.issuer_status,
                    last_synced_at = excluded.last_synced_at,
                    payload_json = excluded.payload_json
                """,
                (
                    request.request_id,
                    request.receipt_id,
                    request.asset_id,
                    request.issuer_case_id,
                    request.redirect_url,
                    request.issuer_status,
                    request.last_synced_at.isoformat(),
                    payload_json,
                ),
            )
            connection.commit()
        return IssuerRequestRecord.model_validate_json(payload_json)

    def get_issuer_request(self, request_id: str) -> IssuerRequestRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM issuer_requests WHERE request_id = ?",
                (request_id,),
            ).fetchone()
        if row is None:
            return None
        return IssuerRequestRecord.model_validate_json(row["payload_json"])

    def list_issuer_requests(self, *, receipt_id: str = "") -> list[IssuerRequestRecord]:
        sql = "SELECT payload_json FROM issuer_requests WHERE 1=1"
        params: list[object] = []
        if receipt_id:
            sql += " AND receipt_id = ?"
            params.append(receipt_id)
        sql += " ORDER BY last_synced_at DESC"
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        return [IssuerRequestRecord.model_validate_json(row["payload_json"]) for row in rows]

    def save_alert_event(self, alert: PortfolioAlert) -> PortfolioAlert:
        payload_json = alert.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO portfolio_alert_events (
                    alert_id, address, asset_id, alert_type, severity, title,
                    detail, source_ref, source_url, dedupe_key, status,
                    detected_at, resolved_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(address, dedupe_key) DO UPDATE SET
                    severity = excluded.severity,
                    title = excluded.title,
                    detail = excluded.detail,
                    source_ref = excluded.source_ref,
                    source_url = excluded.source_url,
                    status = excluded.status,
                    detected_at = excluded.detected_at,
                    resolved_at = excluded.resolved_at,
                    payload_json = excluded.payload_json
                """,
                (
                    alert.alert_id,
                    alert.address,
                    alert.asset_id,
                    alert.alert_type,
                    alert.severity,
                    alert.title,
                    alert.detail,
                    alert.source_ref,
                    alert.source_url,
                    alert.dedupe_key,
                    alert.status.value if hasattr(alert.status, "value") else str(alert.status),
                    alert.detected_at.isoformat(),
                    alert.resolved_at.isoformat() if alert.resolved_at else None,
                    payload_json,
                ),
            )
            connection.commit()
        stored = self.find_alert_by_dedupe_key(address=alert.address, dedupe_key=alert.dedupe_key)
        return stored or PortfolioAlert.model_validate_json(payload_json)

    def get_alert(self, alert_id: str) -> PortfolioAlert | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM portfolio_alert_events WHERE alert_id = ?",
                (alert_id,),
            ).fetchone()
        if row is None:
            return None
        alert = PortfolioAlert.model_validate_json(row["payload_json"])
        return self._hydrate_alert_state(alert)

    def find_alert_by_dedupe_key(self, *, address: str, dedupe_key: str) -> PortfolioAlert | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM portfolio_alert_events
                WHERE address = ? AND dedupe_key = ?
                """,
                (address, dedupe_key),
            ).fetchone()
        if row is None:
            return None
        alert = PortfolioAlert.model_validate_json(row["payload_json"])
        return self._hydrate_alert_state(alert)

    def list_alerts(self, *, address: str, include_resolved: bool = True) -> list[PortfolioAlert]:
        sql = "SELECT payload_json FROM portfolio_alert_events WHERE address = ?"
        params: list[object] = [address]
        if not include_resolved:
            sql += " AND status != ?"
            params.append("resolved")
        sql += " ORDER BY detected_at DESC"
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        alerts = [PortfolioAlert.model_validate_json(row["payload_json"]) for row in rows]
        return [self._hydrate_alert_state(item) for item in alerts]

    def save_alert_state(self, state: PortfolioAlertAck) -> PortfolioAlertAck:
        payload_json = state.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO portfolio_alert_states (
                    address, alert_id, acked, acknowledged_at, read, read_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(address, alert_id) DO UPDATE SET
                    acked = excluded.acked,
                    acknowledged_at = excluded.acknowledged_at,
                    read = excluded.read,
                    read_at = excluded.read_at,
                    payload_json = excluded.payload_json
                """,
                (
                    state.address,
                    state.alert_id,
                    1 if state.acked else 0,
                    state.acknowledged_at.isoformat() if state.acknowledged_at else None,
                    1 if state.read else 0,
                    state.read_at.isoformat() if state.read_at else None,
                    payload_json,
                ),
            )
            connection.commit()
        return PortfolioAlertAck.model_validate_json(payload_json)

    def get_alert_state(self, *, address: str, alert_id: str) -> PortfolioAlertAck | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM portfolio_alert_states
                WHERE address = ? AND alert_id = ?
                """,
                (address, alert_id),
            ).fetchone()
        if row is None:
            return None
        return PortfolioAlertAck.model_validate_json(row["payload_json"])

    def _hydrate_alert_state(self, alert: PortfolioAlert) -> PortfolioAlert:
        state = self.get_alert_state(address=alert.address, alert_id=alert.alert_id)
        if state is None:
            return alert
        alert.acked = state.acked
        alert.acknowledged_at = state.acknowledged_at
        alert.read = state.read
        alert.read_at = state.read_at
        return alert

    def save_indexer_status(self, status: IndexerStatusItem) -> IndexerStatusItem:
        payload_json = status.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO chain_index_cursors (
                    network, contract_name, contract_address, last_indexed_block,
                    last_safe_head, chain_head, lag, status, last_error, updated_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(network, contract_name) DO UPDATE SET
                    contract_address = excluded.contract_address,
                    last_indexed_block = excluded.last_indexed_block,
                    last_safe_head = excluded.last_safe_head,
                    chain_head = excluded.chain_head,
                    lag = excluded.lag,
                    status = excluded.status,
                    last_error = excluded.last_error,
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json
                """,
                (
                    status.network,
                    status.contract_name,
                    status.contract_address,
                    status.last_indexed_block,
                    status.last_safe_head,
                    status.chain_head,
                    status.lag,
                    status.status,
                    status.last_error,
                    status.updated_at.isoformat(),
                    payload_json,
                ),
            )
            connection.commit()
        return IndexerStatusItem.model_validate_json(payload_json)

    def list_indexer_status(self) -> list[IndexerStatusItem]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM chain_index_cursors ORDER BY network, contract_name"
            ).fetchall()
        return [IndexerStatusItem.model_validate_json(row["payload_json"]) for row in rows]

    def get_indexer_status(self, *, network: str, contract_name: str) -> IndexerStatusItem | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM chain_index_cursors
                WHERE network = ? AND contract_name = ?
                """,
                (network, contract_name),
            ).fetchone()
        if row is None:
            return None
        return IndexerStatusItem.model_validate_json(row["payload_json"])

    def save_indexed_proof_event(self, event: IndexedAssetProofEvent) -> IndexedAssetProofEvent:
        payload_json = event.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO indexed_asset_proof_events (
                    event_id, asset_id, network, contract_address, proof_key,
                    transaction_hash, block_number, log_index, indexed_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    asset_id = excluded.asset_id,
                    network = excluded.network,
                    contract_address = excluded.contract_address,
                    proof_key = excluded.proof_key,
                    transaction_hash = excluded.transaction_hash,
                    block_number = excluded.block_number,
                    log_index = excluded.log_index,
                    indexed_at = excluded.indexed_at,
                    payload_json = excluded.payload_json
                """,
                (
                    event.event_id,
                    event.asset_id,
                    event.network,
                    event.contract_address,
                    event.proof_key,
                    event.transaction_hash,
                    event.block_number,
                    event.log_index,
                    event.indexed_at.isoformat(),
                    payload_json,
                ),
            )
            connection.execute(
                """
                INSERT INTO indexed_asset_proof_latest (asset_id, network, event_id, payload_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(asset_id, network) DO UPDATE SET
                    event_id = excluded.event_id,
                    payload_json = excluded.payload_json
                """,
                (event.asset_id, event.network, event.event_id, payload_json),
            )
            connection.commit()
        return IndexedAssetProofEvent.model_validate_json(payload_json)

    def list_indexed_proof_events(
        self,
        *,
        asset_id: str = "",
        network: str = "",
    ) -> list[IndexedAssetProofEvent]:
        sql = "SELECT payload_json FROM indexed_asset_proof_events WHERE 1=1"
        params: list[object] = []
        if asset_id:
            sql += " AND asset_id = ?"
            params.append(asset_id)
        if network:
            sql += " AND network = ?"
            params.append(network)
        sql += " ORDER BY block_number DESC, log_index DESC"
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        return [IndexedAssetProofEvent.model_validate_json(row["payload_json"]) for row in rows]

    def get_latest_indexed_proof_event(
        self,
        *,
        asset_id: str,
        network: str,
    ) -> IndexedAssetProofEvent | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM indexed_asset_proof_latest
                WHERE asset_id = ? AND network = ?
                """,
                (asset_id, network),
            ).fetchone()
        if row is None:
            return None
        return IndexedAssetProofEvent.model_validate_json(row["payload_json"])

    def save_indexed_plan_event(self, event: IndexedPlanHistoryItem) -> IndexedPlanHistoryItem:
        payload_json = event.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO indexed_plan_events (
                    event_id, asset_id, network, contract_address, attestation_hash,
                    transaction_hash, block_number, log_index, indexed_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    asset_id = excluded.asset_id,
                    network = excluded.network,
                    contract_address = excluded.contract_address,
                    attestation_hash = excluded.attestation_hash,
                    transaction_hash = excluded.transaction_hash,
                    block_number = excluded.block_number,
                    log_index = excluded.log_index,
                    indexed_at = excluded.indexed_at,
                    payload_json = excluded.payload_json
                """,
                (
                    event.event_id,
                    event.asset_id,
                    event.network,
                    event.contract_address,
                    event.attestation_hash,
                    event.transaction_hash,
                    event.block_number,
                    event.log_index,
                    event.indexed_at.isoformat(),
                    payload_json,
                ),
            )
            if event.asset_id:
                connection.execute(
                    """
                    INSERT INTO indexed_plan_latest (asset_id, network, event_id, payload_json)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(asset_id, network) DO UPDATE SET
                        event_id = excluded.event_id,
                        payload_json = excluded.payload_json
                    """,
                    (event.asset_id, event.network, event.event_id, payload_json),
                )
            connection.commit()
        return IndexedPlanHistoryItem.model_validate_json(payload_json)

    def list_indexed_plan_events(
        self,
        *,
        asset_id: str = "",
        network: str = "",
    ) -> list[IndexedPlanHistoryItem]:
        sql = "SELECT payload_json FROM indexed_plan_events WHERE 1=1"
        params: list[object] = []
        if asset_id:
            sql += " AND asset_id = ?"
            params.append(asset_id)
        if network:
            sql += " AND network = ?"
            params.append(network)
        sql += " ORDER BY block_number DESC, log_index DESC"
        with self._connect() as connection:
            rows = connection.execute(sql, tuple(params)).fetchall()
        return [IndexedPlanHistoryItem.model_validate_json(row["payload_json"]) for row in rows]

    def get_latest_indexed_plan_event(
        self,
        *,
        asset_id: str,
        network: str,
    ) -> IndexedPlanHistoryItem | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM indexed_plan_latest
                WHERE asset_id = ? AND network = ?
                """,
                (asset_id, network),
            ).fetchone()
        if row is None:
            return None
        return IndexedPlanHistoryItem.model_validate_json(row["payload_json"])

    def save_ops_job_run(self, job_run: OpsJobRun) -> OpsJobRun:
        payload_json = job_run.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO ops_job_runs (
                    job_run_id, job_name, network, status, started_at,
                    finished_at, item_count, error_message, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_run_id) DO UPDATE SET
                    job_name = excluded.job_name,
                    network = excluded.network,
                    status = excluded.status,
                    started_at = excluded.started_at,
                    finished_at = excluded.finished_at,
                    item_count = excluded.item_count,
                    error_message = excluded.error_message,
                    payload_json = excluded.payload_json
                """,
                (
                    job_run.job_run_id,
                    job_run.job_name,
                    job_run.network,
                    job_run.status,
                    job_run.started_at.isoformat(),
                    job_run.finished_at.isoformat() if job_run.finished_at else None,
                    job_run.item_count,
                    job_run.error_message,
                    payload_json,
                ),
            )
            connection.commit()
        return OpsJobRun.model_validate_json(payload_json)

    def list_ops_job_runs(self, *, limit: int = 20) -> list[OpsJobRun]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM ops_job_runs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [OpsJobRun.model_validate_json(row["payload_json"]) for row in rows]
