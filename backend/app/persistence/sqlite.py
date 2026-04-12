from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.domain.models import AnalysisSession, AuditLogEntry
from app.persistence.base import SessionRepository


class SQLiteSessionRepository(SessionRepository):
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
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    owner_client_id TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated
                ON sessions (owner_client_id, updated_at DESC)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    log_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    target TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    status TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_audit_logs_created
                ON audit_logs (created_at DESC)
                """
            )
            connection.commit()

    def save(self, session: AnalysisSession) -> AnalysisSession:
        session.touch()
        payload_json = session.model_dump_json()

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (
                    session_id,
                    owner_client_id,
                    mode,
                    status,
                    created_at,
                    updated_at,
                    payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    owner_client_id = excluded.owner_client_id,
                    mode = excluded.mode,
                    status = excluded.status,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json
                """,
                (
                    session.session_id,
                    session.owner_client_id,
                    session.mode.value,
                    session.status.value,
                    session.created_at.isoformat(),
                    session.updated_at.isoformat(),
                    payload_json,
                ),
            )
            connection.commit()

        return AnalysisSession.model_validate_json(payload_json)

    def get(self, session_id: str) -> AnalysisSession | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM sessions
                WHERE session_id = ?
                """,
                (session_id,),
            ).fetchone()

        if row is None:
            return None
        return AnalysisSession.model_validate_json(row["payload_json"])

    def list_sessions(self) -> list[AnalysisSession]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM sessions
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()

        return [AnalysisSession.model_validate_json(row["payload_json"]) for row in rows]

    def list_sessions_by_owner(self, owner_client_id: str) -> list[AnalysisSession]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM sessions
                WHERE owner_client_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (owner_client_id,),
            ).fetchall()

        return [AnalysisSession.model_validate_json(row["payload_json"]) for row in rows]

    def delete_sessions_by_owner(self, owner_client_id: str) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                DELETE FROM sessions
                WHERE owner_client_id = ?
                """,
                (owner_client_id,),
            )
            connection.commit()
            return cursor.rowcount

    def save_audit_log(self, entry: AuditLogEntry) -> AuditLogEntry:
        payload_json = entry.model_dump_json()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO audit_logs (
                    log_id,
                    created_at,
                    action,
                    actor,
                    target,
                    ip_address,
                    status,
                    summary,
                    payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(log_id) DO UPDATE SET
                    created_at = excluded.created_at,
                    action = excluded.action,
                    actor = excluded.actor,
                    target = excluded.target,
                    ip_address = excluded.ip_address,
                    status = excluded.status,
                    summary = excluded.summary,
                    payload_json = excluded.payload_json
                """,
                (
                    entry.log_id,
                    entry.created_at.isoformat(),
                    entry.action,
                    entry.actor,
                    entry.target,
                    entry.ip_address,
                    entry.status,
                    entry.summary,
                    payload_json,
                ),
            )
            connection.commit()

        return AuditLogEntry.model_validate_json(payload_json)

    def list_audit_logs(self, limit: int = 200) -> list[AuditLogEntry]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [AuditLogEntry.model_validate_json(row["payload_json"]) for row in rows]

    def get_audit_log(self, log_id: str) -> AuditLogEntry | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT payload_json
                FROM audit_logs
                WHERE log_id = ?
                """,
                (log_id,),
            ).fetchone()

        if row is None:
            return None
        return AuditLogEntry.model_validate_json(row["payload_json"])
