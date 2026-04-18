from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Iterator

from app.stocks.models import TradingWorkspace


class InMemoryStocksRepository:
    def __init__(self) -> None:
        self._workspaces: dict[str, TradingWorkspace] = {}

    def get_workspace(self, owner_client_id: str) -> TradingWorkspace | None:
        workspace = self._workspaces.get(owner_client_id)
        return deepcopy(workspace) if workspace else None

    def save_workspace(self, workspace: TradingWorkspace) -> TradingWorkspace:
        self._workspaces[workspace.owner_client_id] = deepcopy(workspace)
        return deepcopy(workspace)


class SQLiteStocksRepository:
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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_workspaces (
                    owner_client_id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def get_workspace(self, owner_client_id: str) -> TradingWorkspace | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM stock_workspaces
                WHERE owner_client_id = ?
                """,
                (owner_client_id,),
            ).fetchone()
        if row is None:
            return None
        return TradingWorkspace.model_validate_json(row["payload_json"])

    def save_workspace(self, workspace: TradingWorkspace) -> TradingWorkspace:
        payload_json = workspace.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO stock_workspaces (owner_client_id, updated_at, payload_json)
                VALUES (?, ?, ?)
                ON CONFLICT(owner_client_id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json
                """,
                (workspace.owner_client_id, workspace.updated_at, payload_json),
            )
            connection.commit()
        return TradingWorkspace.model_validate_json(payload_json)

