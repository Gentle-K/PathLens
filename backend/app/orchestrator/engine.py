import json
import re
from typing import Protocol

from app.adapters.llm_analysis import LLMInvocationError
from app.domain.models import (
    AnalysisLoopPlan,
    AnalysisReport,
    AnalysisSession,
    CalculationTask,
    ChartArtifact,
    ChartTask,
    ClarificationQuestion,
    MajorConclusionItem,
    NextAction,
    SearchTask,
    SessionEvent,
    SessionStatus,
)
from app.domain.schemas import SessionStepResponse
from app.persistence.base import SessionRepository
from app.services.calculation_tasks import calculation_semantic_signature, sanitize_calculation_tasks
from app.services.audit import AuditLogService


class AnalysisAdapter(Protocol):
    def generate_initial_questions(self, session: AnalysisSession) -> list[ClarificationQuestion]: ...

    def plan_next_round(self, session: AnalysisSession) -> AnalysisLoopPlan: ...

    def build_report(self, session: AnalysisSession) -> AnalysisReport: ...


class SearchAdapter(Protocol):
    def run(self, tasks: list[SearchTask]): ...


class CalculationAdapter(Protocol):
    def run(self, tasks: list[CalculationTask]): ...


class ChartAdapter(Protocol):
    def build_preview(self, session: AnalysisSession): ...


class AnalysisOrchestrator:
    def __init__(
        self,
        repository: SessionRepository,
        audit_log_service: AuditLogService,
        analysis_adapter: AnalysisAdapter,
        search_adapter: SearchAdapter,
        calculation_adapter: CalculationAdapter,
        chart_adapter: ChartAdapter,
    ) -> None:
        self.repository = repository
        self.audit_log_service = audit_log_service
        self.analysis_adapter = analysis_adapter
        self.search_adapter = search_adapter
        self.calculation_adapter = calculation_adapter
        self.chart_adapter = chart_adapter

    def supported_modes(self) -> list[str]:
        return ["single_decision", "multi_option"]

    def supported_statuses(self) -> list[str]:
        return [status.value for status in SessionStatus]

    def supported_actions(self) -> list[str]:
        return [action.value for action in NextAction]

    def advance_session(self, session_id: str) -> SessionStepResponse:
        session = self.repository.get(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found.")

        session.events.append(
            SessionEvent(
                kind="orchestrator_advance_started",
                payload={
                    "status_before": session.status.value,
                    "activity_status_before": session.activity_status,
                    "answers_count": len(session.answers),
                    "question_count": len(session.clarification_questions),
                    "search_task_count": len(session.search_tasks),
                    "calculation_task_count": len(session.calculation_tasks),
                    "chart_task_count": len(session.chart_tasks),
                    "evidence_count": len(session.evidence_items),
                    "analysis_rounds_completed": session.analysis_rounds_completed,
                },
            )
        )

        try:
            if session.status == SessionStatus.INIT:
                return self._handle_init(session)

            if session.status == SessionStatus.CLARIFYING:
                unanswered = [question for question in session.clarification_questions if not question.answered]
                if unanswered:
                    session.activity_status = "waiting_for_user_clarification_answers"
                    session.current_focus = "Waiting for the current clarification round to be answered."
                    session.last_stop_reason = "The backend cannot continue until the pending questions are answered."
                    session.events.append(
                        SessionEvent(
                            kind="clarification_waiting_for_answers",
                            payload={
                                "unanswered_count": len(unanswered),
                                "unanswered_question_ids": [question.question_id for question in unanswered],
                            },
                        )
                    )
                    self.repository.save(session)
                    return self._build_response(
                        session.session_id,
                        NextAction.ASK_USER,
                        "There are still unanswered questions waiting for user input.",
                    )
                return self._apply_loop_plan(session)

            if session.status == SessionStatus.ANALYZING:
                return self._run_pending_tasks(session)

            if session.status == SessionStatus.READY_FOR_REPORT:
                self._build_report(session)
                return self._complete_session(session.session_id)

            if session.status == SessionStatus.REPORTING:
                return self._complete_session(session.session_id)

            if session.status == SessionStatus.COMPLETED:
                return self._build_response(
                    session.session_id,
                    NextAction.COMPLETE,
                    "This analysis session is already complete.",
                )

        except LLMInvocationError as error:
            return self._mark_failed(
                session,
                activity_status="llm_call_failed",
                error_message=str(error),
                event_kind="llm_invocation_failed",
                action="LLM_INVOCATION_FAILED",
                summary="LLM invocation failed after retries.",
                prompt_to_user="The LLM call failed after all retry attempts.",
            )
        except Exception as error:
            return self._mark_failed(
                session,
                activity_status="unexpected_error",
                error_message=str(error),
                event_kind="orchestrator_unexpected_exception",
                action="ORCHESTRATOR_UNEXPECTED_EXCEPTION",
                summary="The orchestrator hit an unexpected error.",
                prompt_to_user="The session hit an unexpected error while advancing.",
                extra_payload={"error_type": type(error).__name__},
            )

        return self._mark_failed(
            session,
            activity_status="failed",
            error_message=session.error_message or "The orchestrator reached an unexpected branch.",
            event_kind="session_failed",
            action="SESSION_FAILED",
            summary="Session entered failed state in the orchestrator.",
            prompt_to_user="The session entered a failed state inside the orchestrator.",
        )

    def _handle_init(self, session: AnalysisSession) -> SessionStepResponse:
        session.status = SessionStatus.CLARIFYING
        session.error_message = None
        session.activity_status = "waiting_for_llm_clarification_questions"
        self.repository.save(session)

        session.clarification_questions = self._collect_new_questions(
            session,
            self.analysis_adapter.generate_initial_questions(session),
        )
        session.activity_status = "waiting_for_user_clarification_answers"
        session.current_focus = "Collect the first round of high-value user facts."
        session.last_stop_reason = "Waiting for initial clarification answers."
        session.events.append(
            SessionEvent(
                kind="questions_generated",
                payload={
                    "question_count": len(session.clarification_questions),
                    "question_ids": [question.question_id for question in session.clarification_questions],
                },
            )
        )
        self.repository.save(session)
        self._write_log(
            session,
            action="QUESTIONS_GENERATED",
            summary="Generated the initial clarification round for the session.",
            metadata={"question_count": str(len(session.clarification_questions))},
        )
        return self._build_response(
            session.session_id,
            NextAction.ASK_USER,
            "Please answer the first round of clarification questions so the backend can continue the analysis workflow.",
        )

    def _run_pending_tasks(self, session: AnalysisSession) -> SessionStepResponse:
        pending_search_tasks = [task for task in session.search_tasks if self._task_is_pending(task.status)]
        pending_calculation_tasks = [
            task for task in session.calculation_tasks if self._task_is_pending(task.status)
        ]
        pending_chart_tasks = [task for task in session.chart_tasks if self._task_is_pending(task.status)]

        if not (pending_search_tasks or pending_calculation_tasks or pending_chart_tasks):
            return self._apply_loop_plan(session)

        session.activity_status = self._resolve_analysis_activity_status(
            pending_search_tasks,
            pending_calculation_tasks,
            pending_chart_tasks,
        )
        session.events.append(
            SessionEvent(
                kind="mcp_round_started",
                payload={
                    "pending_search_task_ids": [task.task_id for task in pending_search_tasks],
                    "pending_calculation_task_ids": [task.task_id for task in pending_calculation_tasks],
                    "pending_chart_task_ids": [task.task_id for task in pending_chart_tasks],
                },
            )
        )
        self.repository.save(session)

        if pending_search_tasks:
            session.evidence_items.extend(
                self._run_adapter_tasks_safely(
                    session,
                    pending_search_tasks,
                    adapter_call=lambda: self.search_adapter.run(pending_search_tasks),
                    failure_kind="search_adapter_failed",
                    failure_action="SEARCH_ADAPTER_FAILED",
                    failure_summary="The search adapter failed, but the session continued.",
                    failure_note_prefix="Search adapter failure",
                    empty_result=[],
                )
            )
        if pending_calculation_tasks:
            self._run_adapter_tasks_safely(
                session,
                pending_calculation_tasks,
                adapter_call=lambda: self.calculation_adapter.run(pending_calculation_tasks),
                failure_kind="calculation_adapter_failed",
                failure_action="CALCULATION_ADAPTER_FAILED",
                failure_summary="The calculation adapter failed, but the session continued.",
                failure_note_prefix="Calculation adapter failure",
                empty_result=[],
            )

        new_chart_artifacts: list[ChartArtifact] = []
        if pending_chart_tasks:
            new_chart_artifacts = self._run_adapter_tasks_safely(
                session,
                pending_chart_tasks,
                adapter_call=lambda: self.chart_adapter.build_preview(session),
                failure_kind="chart_adapter_failed",
                failure_action="CHART_ADAPTER_FAILED",
                failure_summary="The chart adapter failed, but the session continued.",
                failure_note_prefix="Chart adapter failure",
                empty_result=[],
            )
        added_charts = self._merge_chart_artifacts(session, new_chart_artifacts)

        session.events.append(
            SessionEvent(
                kind="mcp_round_completed",
                payload={
                    "evidence_count": len(session.evidence_items),
                    "completed_search_count": len(
                        [task for task in pending_search_tasks if task.status == "completed"]
                    ),
                    "failed_search_count": len(
                        [task for task in pending_search_tasks if task.status == "failed"]
                    ),
                    "completed_calculation_count": len(
                        [task for task in pending_calculation_tasks if task.status == "completed"]
                    ),
                    "failed_calculation_count": len(
                        [task for task in pending_calculation_tasks if task.status == "failed"]
                    ),
                    "chart_count": len(session.chart_artifacts),
                    "new_chart_count": len(added_charts),
                },
            )
        )
        self.repository.save(session)
        return self._apply_loop_plan(session, action="MCP_ROUND_COMPLETED")

    def _build_report(self, session: AnalysisSession) -> None:
        session.status = SessionStatus.REPORTING
        session.error_message = None
        session.activity_status = "waiting_for_llm_report_generation"
        self.repository.save(session)

        session.report = self.analysis_adapter.build_report(session)
        final_chart_artifacts = self._run_adapter_tasks_safely(
            session,
            session.chart_tasks,
            adapter_call=lambda: self.chart_adapter.build_preview(session),
            failure_kind="final_chart_adapter_failed",
            failure_action="FINAL_CHART_ADAPTER_FAILED",
            failure_summary="Final chart generation failed, but the report remained available.",
            failure_note_prefix="Final chart generation failure",
            empty_result=[],
        )
        if final_chart_artifacts:
            session.chart_artifacts = final_chart_artifacts
            session.report.chart_refs = [artifact.chart_id for artifact in session.chart_artifacts]
        session.activity_status = "report_generated_waiting_for_delivery"
        session.last_stop_reason = (
            session.last_stop_reason or "The structured loop concluded and moved into report writing."
        )
        session.events.append(
            SessionEvent(
                kind="report_built",
                payload={
                    "has_report": session.report is not None,
                    "recommendation_count": len(session.report.recommendations) if session.report else 0,
                    "table_count": len(session.report.tables) if session.report else 0,
                    "chart_count": len(session.chart_artifacts),
                },
            )
        )
        self.repository.save(session)
        self._write_log(
            session,
            action="REPORT_BUILT",
            summary="Built the final report payload from the loop conclusions.",
            metadata={"has_report": str(session.report is not None).lower()},
        )

    def _complete_session(self, session_id: str) -> SessionStepResponse:
        session = self.repository.get(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found.")

        session.status = SessionStatus.COMPLETED
        session.activity_status = "completed"
        session.events.append(
            SessionEvent(
                kind="session_completed",
                payload={
                    "status_after": session.status.value,
                    "analysis_rounds_completed": session.analysis_rounds_completed,
                },
            )
        )
        self.repository.save(session)
        self._write_log(
            session,
            action="SESSION_COMPLETED",
            summary="Marked the analysis session as completed.",
        )
        return self._build_response(
            session.session_id,
            NextAction.COMPLETE,
            "The final report is ready.",
        )

    def _apply_loop_plan(
        self,
        session: AnalysisSession,
        *,
        action: str = "ANALYSIS_PLANNED",
    ) -> SessionStepResponse:
        session.error_message = None
        session.activity_status = "waiting_for_llm_round_planning"
        self.repository.save(session)

        plan = self.analysis_adapter.plan_next_round(session)
        session.analysis_rounds_completed += 1
        session.activity_status = "llm_round_plan_ready"
        session.current_focus = plan.reasoning_focus
        session.last_stop_reason = plan.stop_reason

        candidate_questions = self._collect_new_questions(session, plan.clarification_questions)
        follow_up_budget_exhausted = (
            bool(candidate_questions) and session.follow_up_rounds_used >= session.follow_up_round_limit
        )

        if follow_up_budget_exhausted:
            session.follow_up_budget_exhausted = True
            session.deferred_follow_up_question_count = len(candidate_questions)
            new_questions: list[ClarificationQuestion] = []
            new_search_tasks: list[SearchTask] = []
            new_calculation_tasks: list[CalculationTask] = []
            new_chart_tasks: list[ChartTask] = []
            new_conclusions = self._merge_conclusions(session, plan.major_conclusions)
            plan.ready_for_report = True
            session.last_stop_reason = (
                "The follow-up question budget was exhausted, so the current report snapshot is being produced."
            )
        else:
            new_questions = self._append_questions(session, candidate_questions)
            if new_questions:
                session.follow_up_rounds_used += 1
            session.follow_up_budget_exhausted = False
            session.deferred_follow_up_question_count = 0
            new_search_tasks = self._merge_search_tasks(session, plan.search_tasks)
            new_calculation_tasks = self._merge_calculation_tasks(session, plan.calculation_tasks)
            new_chart_tasks = self._merge_chart_tasks(session, plan.chart_tasks)
            new_conclusions = self._merge_conclusions(session, plan.major_conclusions)

        session.events.append(
            SessionEvent(
                kind="analysis_planned",
                payload={
                    "analysis_round": session.analysis_rounds_completed,
                    "new_question_count": len(new_questions),
                    "deferred_question_count": session.deferred_follow_up_question_count,
                    "new_search_task_count": len(new_search_tasks),
                    "new_calculation_task_count": len(new_calculation_tasks),
                    "new_chart_task_count": len(new_chart_tasks),
                    "new_conclusion_count": len(new_conclusions),
                    "ready_for_report": plan.ready_for_report,
                    "follow_up_budget_exhausted": session.follow_up_budget_exhausted,
                    "follow_up_rounds_used": session.follow_up_rounds_used,
                    "follow_up_round_limit": session.follow_up_round_limit,
                    "reasoning_focus": plan.reasoning_focus,
                    "stop_reason": session.last_stop_reason,
                },
            )
        )

        next_action = NextAction.PREVIEW_REPORT
        prompt_to_user = "The current information is sufficient to move into final report generation."

        if new_questions:
            session.status = SessionStatus.CLARIFYING
            session.activity_status = "waiting_for_user_clarification_answers"
            next_action = NextAction.ASK_USER
            prompt_to_user = "The backend generated another high-value clarification round."
        elif new_search_tasks or new_calculation_tasks or new_chart_tasks:
            session.status = SessionStatus.ANALYZING
            session.activity_status = "waiting_for_mcp_execution"
            next_action = NextAction.RUN_MCP
            prompt_to_user = "The backend planned search, calculation, or chart tasks for the next analysis round."
        else:
            session.status = SessionStatus.READY_FOR_REPORT
            session.activity_status = "ready_for_report_generation"
            if not session.last_stop_reason:
                session.last_stop_reason = (
                    "No additional clarification, search, calculation, or chart tasks were generated."
                )

        self.repository.save(session)
        self._write_log(
            session,
            action=action,
            summary="Planned a structured LLM analysis round.",
            metadata={
                "analysis_round": str(session.analysis_rounds_completed),
                "new_question_count": str(len(new_questions)),
                "new_search_task_count": str(len(new_search_tasks)),
                "new_calculation_task_count": str(len(new_calculation_tasks)),
                "new_chart_task_count": str(len(new_chart_tasks)),
                "new_conclusion_count": str(len(new_conclusions)),
                "ready_for_report": str(plan.ready_for_report).lower(),
                "activity_status": session.activity_status,
            },
        )
        return self._build_response(session.session_id, next_action, prompt_to_user)

    def _build_response(
        self,
        session_id: str,
        next_action: NextAction,
        prompt_to_user: str,
    ) -> SessionStepResponse:
        session = self.repository.get(session_id)
        if session is None:
            raise ValueError(f"Session {session_id} not found.")

        return SessionStepResponse(
            session_id=session.session_id,
            status=session.status,
            next_action=next_action,
            prompt_to_user=prompt_to_user,
            analysis_rounds_completed=session.analysis_rounds_completed,
            activity_status=session.activity_status,
            current_focus=session.current_focus,
            last_stop_reason=session.last_stop_reason,
            error_message=session.error_message,
            pending_questions=[
                question for question in session.clarification_questions if not question.answered
            ],
            pending_search_tasks=[
                task for task in session.search_tasks if self._task_is_pending(task.status)
            ],
            pending_calculation_tasks=[
                task for task in session.calculation_tasks if self._task_is_pending(task.status)
            ],
            pending_chart_tasks=[
                task for task in session.chart_tasks if self._task_is_pending(task.status)
            ],
            evidence_items=session.evidence_items,
            chart_artifacts=session.chart_artifacts,
            major_conclusions=session.major_conclusions,
            report_preview=session.report,
        )

    def _mark_failed(
        self,
        session: AnalysisSession,
        *,
        activity_status: str,
        error_message: str,
        event_kind: str,
        action: str,
        summary: str,
        prompt_to_user: str,
        extra_payload: dict[str, str] | None = None,
    ) -> SessionStepResponse:
        session.status = SessionStatus.FAILED
        session.activity_status = activity_status
        session.error_message = error_message
        payload = {"message": session.error_message}
        if extra_payload:
            payload.update(extra_payload)
        session.events.append(SessionEvent(kind=event_kind, payload=payload))
        self.repository.save(session)
        self._write_log(
            session,
            action=action,
            summary=summary,
            status="error",
            metadata={key: str(value) for key, value in payload.items()},
        )
        return self._build_response(session.session_id, NextAction.COMPLETE, prompt_to_user)

    def _run_adapter_tasks_safely(
        self,
        session: AnalysisSession,
        tasks: list[SearchTask] | list[CalculationTask] | list[ChartTask],
        *,
        adapter_call,
        failure_kind: str,
        failure_action: str,
        failure_summary: str,
        failure_note_prefix: str,
        empty_result,
    ):
        try:
            return adapter_call()
        except Exception as error:
            self._mark_tasks_failed(
                tasks,
                note=f"{failure_note_prefix}: {type(error).__name__}: {error}",
            )
            session.events.append(
                SessionEvent(
                    kind=failure_kind,
                    payload={
                        "task_ids": [getattr(task, "task_id", "") for task in tasks],
                        "error_type": type(error).__name__,
                        "error": str(error),
                    },
                )
            )
            self.repository.save(session)
            self._write_log(
                session,
                action=failure_action,
                summary=failure_summary,
                status="error",
                metadata={
                    "error_type": type(error).__name__,
                    "task_count": str(len(tasks)),
                },
            )
            return empty_result

    @staticmethod
    def _mark_tasks_failed(
        tasks: list[SearchTask] | list[CalculationTask] | list[ChartTask],
        *,
        note: str,
    ) -> None:
        for task in tasks:
            task.status = "failed"
            existing_notes = getattr(task, "notes", "")
            merged = f"{existing_notes}\n{note}".strip() if existing_notes else note
            task.notes = merged

    def _write_log(
        self,
        session: AnalysisSession,
        *,
        action: str,
        summary: str,
        status: str = "success",
        metadata: dict[str, str] | None = None,
    ) -> None:
        self.audit_log_service.write(
            action=action,
            actor=session.owner_client_id,
            target=session.session_id,
            ip_address="cookie-session",
            summary=summary,
            status=status,
            metadata=metadata,
        )

    def _resolve_analysis_activity_status(
        self,
        search_tasks: list[SearchTask],
        calculation_tasks: list[CalculationTask],
        chart_tasks: list[ChartTask],
    ) -> str:
        if search_tasks and not calculation_tasks and not chart_tasks:
            return "searching_web_for_evidence"
        if calculation_tasks and not search_tasks and not chart_tasks:
            return "running_deterministic_calculations"
        if chart_tasks and not search_tasks and not calculation_tasks:
            return "preparing_visualizations"
        if search_tasks and calculation_tasks:
            return "searching_and_synthesizing"
        if search_tasks or calculation_tasks or chart_tasks:
            return "running_analysis_pipeline"
        return "analyzing"

    @staticmethod
    def _collect_new_questions(
        session: AnalysisSession,
        questions: list[ClarificationQuestion],
    ) -> list[ClarificationQuestion]:
        existing = {
            AnalysisOrchestrator._question_signature(question)
            for question in session.clarification_questions
        }
        added: list[ClarificationQuestion] = []
        for question in questions:
            signature = AnalysisOrchestrator._question_signature(question)
            if not signature or signature in existing:
                continue
            added.append(question)
            existing.add(signature)
        return added

    @staticmethod
    def _append_questions(
        session: AnalysisSession,
        questions: list[ClarificationQuestion],
    ) -> list[ClarificationQuestion]:
        session.clarification_questions.extend(questions)
        return questions

    @staticmethod
    def _merge_search_tasks(
        session: AnalysisSession,
        tasks: list[SearchTask],
    ) -> list[SearchTask]:
        existing = {
            (
                AnalysisOrchestrator._normalize_text(task.search_topic),
                AnalysisOrchestrator._normalize_text(task.search_goal),
            )
            for task in session.search_tasks
        }
        added: list[SearchTask] = []
        for task in tasks:
            key = (
                AnalysisOrchestrator._normalize_text(task.search_topic),
                AnalysisOrchestrator._normalize_text(task.search_goal),
            )
            if key in existing:
                continue
            session.search_tasks.append(task)
            added.append(task)
            existing.add(key)
        return added

    @staticmethod
    def _merge_calculation_tasks(
        session: AnalysisSession,
        tasks: list[CalculationTask],
    ) -> list[CalculationTask]:
        session.calculation_tasks = sanitize_calculation_tasks(session.calculation_tasks)
        existing = {
            task.semantic_signature or calculation_semantic_signature(task)
            for task in session.calculation_tasks
        }
        added: list[CalculationTask] = []
        for task in tasks:
            key = task.semantic_signature or calculation_semantic_signature(task)
            task.semantic_signature = key
            if key in existing:
                continue
            session.calculation_tasks.append(task)
            added.append(task)
            existing.add(key)
        return added

    @staticmethod
    def _merge_chart_tasks(
        session: AnalysisSession,
        tasks: list[ChartTask],
    ) -> list[ChartTask]:
        existing = {
            (
                AnalysisOrchestrator._normalize_text(task.chart_type),
                AnalysisOrchestrator._normalize_text(task.title),
                AnalysisOrchestrator._normalize_text(task.objective),
                AnalysisOrchestrator._serialize_json(task.source_task_ids),
            )
            for task in session.chart_tasks
        }
        added: list[ChartTask] = []
        for task in tasks:
            key = (
                AnalysisOrchestrator._normalize_text(task.chart_type),
                AnalysisOrchestrator._normalize_text(task.title),
                AnalysisOrchestrator._normalize_text(task.objective),
                AnalysisOrchestrator._serialize_json(task.source_task_ids),
            )
            if key in existing:
                continue
            session.chart_tasks.append(task)
            added.append(task)
            existing.add(key)
        return added

    @staticmethod
    def _merge_chart_artifacts(
        session: AnalysisSession,
        artifacts: list[ChartArtifact],
    ) -> list[ChartArtifact]:
        existing = {
            (
                AnalysisOrchestrator._normalize_text(artifact.chart_type),
                AnalysisOrchestrator._normalize_text(artifact.title),
            )
            for artifact in session.chart_artifacts
        }
        added: list[ChartArtifact] = []
        for artifact in artifacts:
            key = (
                AnalysisOrchestrator._normalize_text(artifact.chart_type),
                AnalysisOrchestrator._normalize_text(artifact.title),
            )
            if key in existing:
                continue
            session.chart_artifacts.append(artifact)
            added.append(artifact)
            existing.add(key)
        return added

    @staticmethod
    def _merge_conclusions(
        session: AnalysisSession,
        conclusions: list[MajorConclusionItem],
    ) -> list[MajorConclusionItem]:
        existing = {
            AnalysisOrchestrator._normalize_text(conclusion.content)
            for conclusion in session.major_conclusions
        }
        added: list[MajorConclusionItem] = []
        for conclusion in conclusions:
            normalized = AnalysisOrchestrator._normalize_text(conclusion.content)
            if not normalized or normalized in existing:
                continue
            session.major_conclusions.append(conclusion)
            added.append(conclusion)
            existing.add(normalized)
        return added

    @staticmethod
    def _normalize_text(value: str) -> str:
        normalized = re.sub(r"[\W_]+", " ", value.lower(), flags=re.UNICODE)
        return " ".join(normalized.split())

    @staticmethod
    def _serialize_json(value: object) -> str:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)

    @staticmethod
    def _task_is_pending(status: str) -> bool:
        return status.strip().lower() not in {"completed", "failed", "rejected", "skipped", "cancelled"}

    @staticmethod
    def _question_signature(question: ClarificationQuestion) -> str:
        return AnalysisOrchestrator._normalize_text(question.question_text)
