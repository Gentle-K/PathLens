from __future__ import annotations

from copy import deepcopy

from app.domain.models import AnalysisSession, AuditLogEntry
from app.persistence.base import SessionRepository


class InMemorySessionRepository(SessionRepository):
    def __init__(self) -> None:
        self._sessions: dict[str, AnalysisSession] = {}
        self._audit_logs: dict[str, AuditLogEntry] = {}

    def save(self, session: AnalysisSession) -> AnalysisSession:
        session.touch()
        self._sessions[session.session_id] = deepcopy(session)
        return deepcopy(session)

    def get(self, session_id: str) -> AnalysisSession | None:
        session = self._sessions.get(session_id)
        return deepcopy(session) if session else None

    def list_sessions(self) -> list[AnalysisSession]:
        return [
            deepcopy(session)
            for session in sorted(
                self._sessions.values(),
                key=lambda item: item.updated_at,
                reverse=True,
            )
        ]

    def list_sessions_by_owner(self, owner_client_id: str) -> list[AnalysisSession]:
        return [
            deepcopy(session)
            for session in sorted(
                (
                    item
                    for item in self._sessions.values()
                    if item.owner_client_id == owner_client_id
                ),
                key=lambda item: item.updated_at,
                reverse=True,
            )
        ]

    def delete_sessions_by_owner(self, owner_client_id: str) -> int:
        session_ids = [
            session_id
            for session_id, session in self._sessions.items()
            if session.owner_client_id == owner_client_id
        ]
        for session_id in session_ids:
            del self._sessions[session_id]
        return len(session_ids)

    def save_audit_log(self, entry: AuditLogEntry) -> AuditLogEntry:
        self._audit_logs[entry.log_id] = deepcopy(entry)
        return deepcopy(entry)

    def list_audit_logs(self, limit: int = 200) -> list[AuditLogEntry]:
        return [
            deepcopy(entry)
            for entry in sorted(
                self._audit_logs.values(),
                key=lambda item: item.created_at,
                reverse=True,
            )[:limit]
        ]

    def get_audit_log(self, log_id: str) -> AuditLogEntry | None:
        entry = self._audit_logs.get(log_id)
        return deepcopy(entry) if entry else None
