from app.domain.models import AnalysisMode, AnalysisSession, SessionEvent, SessionStatus, UserAnswer
from app.domain.rwa import RwaIntakeContext
from app.i18n import normalize_locale
from app.persistence.base import SessionRepository
from app.services.audit import AuditLogService


class SessionService:
    def __init__(
        self,
        repository: SessionRepository,
        audit_log_service: AuditLogService,
        follow_up_round_limit: int = 10,
    ) -> None:
        self.repository = repository
        self.audit_log_service = audit_log_service
        self.follow_up_round_limit = max(1, follow_up_round_limit)

    def create_session(
        self,
        mode: AnalysisMode,
        problem_statement: str,
        owner_client_id: str,
        locale: str = "zh",
        intake_context: RwaIntakeContext | None = None,
        ip_address: str = "unknown",
    ) -> AnalysisSession:
        normalized_locale = normalize_locale(locale)
        session = AnalysisSession(
            owner_client_id=owner_client_id,
            mode=mode,
            locale=normalized_locale,
            problem_statement=problem_statement,
            intake_context=intake_context or RwaIntakeContext(),
            follow_up_round_limit=self.follow_up_round_limit,
        )
        session.events.extend(
            [
                SessionEvent(
                    kind="session_create_requested",
                    payload={
                        "mode": mode.value,
                        "problem_statement_length": len(problem_statement),
                        "owner_client_id": owner_client_id,
                        "ip_address": ip_address,
                        "locale": normalized_locale,
                        "preferred_asset_count": len((intake_context or RwaIntakeContext()).preferred_asset_ids),
                    },
                ),
                SessionEvent(
                    kind="session_created",
                    payload={
                        "mode": mode.value,
                        "locale": normalized_locale,
                        "problem_statement": problem_statement,
                        "owner_client_id": owner_client_id,
                        "intake_context": (intake_context or RwaIntakeContext()).model_dump(mode="json"),
                    },
                ),
            ]
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="SESSION_CREATED",
            actor=owner_client_id,
            target=saved.session_id,
            ip_address=ip_address,
            summary=f"Created {mode.value} session for problem: {problem_statement}",
            metadata={
                "mode": mode.value,
                "locale": normalized_locale,
                "owner_client_id": owner_client_id,
                "problem_statement_length": str(len(problem_statement)),
                "session_status": saved.status.value,
            },
        )
        return saved

    def get_session(self, session_id: str) -> AnalysisSession | None:
        return self.repository.get(session_id)

    def list_sessions(self) -> list[AnalysisSession]:
        return self.repository.list_sessions()

    def list_sessions_by_owner(self, owner_client_id: str) -> list[AnalysisSession]:
        return self.repository.list_sessions_by_owner(owner_client_id)

    def delete_sessions_by_owner(self, owner_client_id: str) -> int:
        deleted = self.repository.delete_sessions_by_owner(owner_client_id)
        self.audit_log_service.write(
            action="PERSONAL_DATA_DELETED",
            actor=owner_client_id,
            target=owner_client_id,
            ip_address="cookie-session",
            summary=f"Deleted {deleted} session(s) for owner.",
            metadata={"deleted_session_count": str(deleted)},
        )
        return deleted

    def request_more_follow_up(self, session_id: str) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        session.follow_up_rounds_used = 0
        session.follow_up_extensions_used += 1
        session.follow_up_budget_exhausted = False
        session.deferred_follow_up_question_count = 0
        if session.status != SessionStatus.FAILED:
            session.status = SessionStatus.ANALYZING
            session.activity_status = "waiting_for_llm_round_planning"
            session.last_stop_reason = "The user requested another follow-up budget window."
        session.events.append(
            SessionEvent(
                kind="follow_up_budget_extended",
                payload={
                    "follow_up_round_limit": session.follow_up_round_limit,
                    "follow_up_extensions_used": session.follow_up_extensions_used,
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="FOLLOW_UP_BUDGET_EXTENDED",
            actor=saved.owner_client_id,
            target=session_id,
            ip_address="cookie-session",
            summary=f"Granted {saved.follow_up_round_limit} additional follow-up round(s).",
            metadata={
                "follow_up_round_limit": str(saved.follow_up_round_limit),
                "follow_up_extensions_used": str(saved.follow_up_extensions_used),
            },
        )
        return saved

    def record_answers(self, session_id: str, answers: list[UserAnswer]) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        answer_summaries: list[dict[str, str]] = []
        existing_answers_by_question = {
            existing_answer.question_id: index
            for index, existing_answer in enumerate(session.answers)
        }

        for answer in answers:
            existing_index = existing_answers_by_question.get(answer.question_id)
            if existing_index is not None:
                continue

            session.answers.append(answer)
            existing_answers_by_question[answer.question_id] = len(session.answers) - 1

            answer_summaries.append(
                {
                    "question_id": answer.question_id,
                    "source": answer.source,
                    "value_preview": answer.value[:120],
                }
            )
            for question in session.clarification_questions:
                if question.question_id == answer.question_id:
                    question.answered = True

        session.events.append(
            SessionEvent(
                kind="answers_recorded",
                payload={
                    "count": len(answer_summaries),
                    "answers": answer_summaries,
                    "answered_question_count": len(
                        [question for question in session.clarification_questions if question.answered]
                    ),
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="ANSWERS_RECORDED",
            actor=saved.owner_client_id,
            target=session_id,
            ip_address="cookie-session",
            summary=f"Recorded {len(answer_summaries)} new clarification answer(s).",
            metadata={"answer_count": str(len(answer_summaries))},
        )
        return saved
