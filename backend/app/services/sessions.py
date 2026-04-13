import hashlib
import json

from app.domain.models import AnalysisMode, AnalysisSession, SessionEvent, SessionStatus, UserAnswer, utcnow
from app.domain.rwa import (
    ExecutionLifecycleStatus,
    ExecutionPlan,
    PositionSnapshot,
    ReportAnchorRecord,
    RwaIntakeContext,
    TransactionReceiptRecord,
    TransactionStatus,
)
from app.i18n import normalize_locale
from app.persistence.base import SessionRepository
from app.rwa.catalog import build_chain_config
from app.rwa.diff import build_comparable_snapshot
from app.rwa.explorer_service import address_url, tx_url
from app.services.calculation_tasks import sanitize_calculation_tasks
from app.config import Settings
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

    @staticmethod
    def _sanitize_session(session: AnalysisSession | None) -> AnalysisSession | None:
        if session is None:
            return None
        sanitized = session.model_copy(deep=True)
        sanitized.calculation_tasks = sanitize_calculation_tasks(sanitized.calculation_tasks)
        return sanitized

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
        resolved_context = intake_context or RwaIntakeContext()
        session = AnalysisSession(
            owner_client_id=owner_client_id,
            mode=mode,
            locale=normalized_locale,
            problem_statement=problem_statement,
            intake_context=resolved_context,
            wallet_address=resolved_context.wallet_address,
            safe_address=resolved_context.safe_address,
            kyc_level=resolved_context.kyc_level,
            kyc_status=resolved_context.kyc_status,
            investor_type=resolved_context.investor_type,
            jurisdiction=resolved_context.jurisdiction,
            source_chain=resolved_context.source_chain,
            source_asset=resolved_context.source_asset,
            ticket_size=resolved_context.ticket_size or resolved_context.investment_amount,
            liquidity_urgency=resolved_context.liquidity_urgency,
            lockup_tolerance=resolved_context.lockup_tolerance,
            target_yield=resolved_context.target_yield,
            max_drawdown_tolerance=resolved_context.max_drawdown_tolerance,
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
                        "preferred_asset_count": len(resolved_context.preferred_asset_ids),
                    },
                ),
                SessionEvent(
                    kind="session_created",
                    payload={
                        "mode": mode.value,
                        "locale": normalized_locale,
                        "problem_statement": problem_statement,
                        "owner_client_id": owner_client_id,
                        "intake_context": resolved_context.model_dump(mode="json"),
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
        return self._sanitize_session(self.repository.get(session_id))

    def list_sessions(self) -> list[AnalysisSession]:
        return [
            sanitized
            for sanitized in (
                self._sanitize_session(session) for session in self.repository.list_sessions()
            )
            if sanitized is not None
        ]

    def list_sessions_by_owner(self, owner_client_id: str) -> list[AnalysisSession]:
        return [
            sanitized
            for sanitized in (
                self._sanitize_session(session)
                for session in self.repository.list_sessions_by_owner(owner_client_id)
            )
            if sanitized is not None
        ]

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

        if session.report is not None and session.status in {
            SessionStatus.COMPLETED,
            SessionStatus.READY_FOR_EXECUTION,
            SessionStatus.MONITORING,
        }:
            session.report_snapshots.append(
                build_comparable_snapshot(
                    session.report,
                    intake_context=session.intake_context,
                )
            )
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

    def record_execution_plan(
        self,
        session_id: str,
        execution_plan: ExecutionPlan,
    ) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        session.execution_plan = execution_plan
        session.eligibility_decisions = list(execution_plan.eligibility)
        session.execution_status = execution_plan.status
        session.status = SessionStatus.READY_FOR_EXECUTION
        session.activity_status = "execution_plan_ready"
        session.last_onchain_sync_at = utcnow()

        if session.report is not None:
            session.report.execution_plan = execution_plan
            session.report.eligibility_summary = list(execution_plan.eligibility)
            session.report.tx_draft = self._execution_plan_to_tx_draft(execution_plan)
            if session.report.attestation_draft is not None:
                session.report.attestation_draft.execution_plan_hash = execution_plan.plan_hash

        session.events.append(
            SessionEvent(
                kind="execution_plan_recorded",
                payload={
                    "execution_plan_id": execution_plan.execution_plan_id,
                    "step_count": len(execution_plan.steps),
                    "plan_hash": execution_plan.plan_hash,
                    "can_execute_onchain": execution_plan.can_execute_onchain,
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="EXECUTION_PLAN_RECORDED",
            actor=saved.owner_client_id,
            target=session_id,
            ip_address="backend-service",
            summary=f"Stored execution plan {execution_plan.execution_plan_id} for session.",
            metadata={
                "execution_plan_id": execution_plan.execution_plan_id,
                "step_count": str(len(execution_plan.steps)),
                "status": execution_plan.status.value,
            },
        )
        return saved

    def record_transaction_receipt(
        self,
        session_id: str,
        receipt: TransactionReceiptRecord,
    ) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        session.transaction_receipts = [
            existing
            for existing in session.transaction_receipts
            if existing.tx_hash != receipt.tx_hash
        ]
        session.transaction_receipts.append(receipt)
        session.last_onchain_sync_at = utcnow()

        if receipt.tx_status == TransactionStatus.FAILED:
            session.execution_status = ExecutionLifecycleStatus.FAILED
            session.status = SessionStatus.READY_FOR_EXECUTION
        elif receipt.tx_status == TransactionStatus.CONFIRMED:
            session.execution_status = ExecutionLifecycleStatus.MONITORING
            session.status = SessionStatus.MONITORING
        else:
            session.execution_status = ExecutionLifecycleStatus.EXECUTING
            session.status = SessionStatus.EXECUTING

        if session.report is not None:
            session.report.transaction_receipts = list(session.transaction_receipts)

        session.events.append(
            SessionEvent(
                kind="transaction_receipt_recorded",
                payload={
                    "tx_hash": receipt.tx_hash,
                    "tx_status": receipt.tx_status.value,
                    "related_execution_step_id": receipt.related_execution_step_id,
                    "failure_reason": receipt.failure_reason,
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="TRANSACTION_RECEIPT_RECORDED",
            actor=receipt.wallet_address or receipt.safe_address or saved.owner_client_id,
            target=session_id,
            ip_address="wallet-client",
            summary=f"Recorded transaction receipt {receipt.tx_hash[:18]}...",
            metadata={
                "tx_hash": receipt.tx_hash,
                "tx_status": receipt.tx_status.value,
                "chain_id": str(receipt.chain_id or ""),
                "related_execution_step_id": receipt.related_execution_step_id,
            },
        )
        return saved

    def record_report_anchor(
        self,
        session_id: str,
        record: ReportAnchorRecord,
    ) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        session.report_anchor_records = [
            existing
            for existing in session.report_anchor_records
            if existing.attestation_hash != record.attestation_hash
        ]
        session.report_anchor_records.append(record)
        session.last_onchain_sync_at = utcnow()

        if session.report is not None:
            session.report.report_anchor_records = list(session.report_anchor_records)
            if session.report.attestation_draft is not None and record.transaction_hash:
                session.report.attestation_draft.transaction_hash = record.transaction_hash
                session.report.attestation_draft.transaction_url = record.explorer_url
                session.report.attestation_draft.block_number = record.block_number

        session.events.append(
            SessionEvent(
                kind="report_anchor_recorded",
                payload={
                    "anchor_id": record.anchor_id,
                    "status": record.status,
                    "attestation_hash": record.attestation_hash,
                    "transaction_hash": record.transaction_hash,
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="REPORT_ANCHOR_RECORDED",
            actor=saved.owner_client_id,
            target=session_id,
            ip_address="backend-service",
            summary=f"Recorded report anchor {record.anchor_id}.",
            metadata={
                "anchor_id": record.anchor_id,
                "status": record.status,
                "transaction_hash": record.transaction_hash,
            },
        )
        return saved

    def sync_position_snapshots(
        self,
        session_id: str,
        snapshots: list[PositionSnapshot],
    ) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None:
            return None

        session.position_snapshots = snapshots
        session.last_onchain_sync_at = utcnow()
        if session.report is not None:
            session.report.position_snapshots = snapshots
        saved = self.repository.save(session)
        return saved

    def record_attestation(
        self,
        session_id: str,
        *,
        network: str,
        transaction_hash: str,
        submitted_by: str = "",
        block_number: int | None = None,
    ) -> AnalysisSession | None:
        session = self.repository.get(session_id)
        if session is None or session.report is None or session.report.attestation_draft is None:
            return None

        draft = session.report.attestation_draft
        chain_config = session.report.chain_config or build_chain_config(Settings.from_env())
        normalized_network = network.strip().lower() or draft.network or "testnet"

        if normalized_network == "testnet":
            explorer_base = chain_config.testnet_explorer_url
            contract_address = (
                chain_config.testnet_plan_registry_address
                or draft.contract_address
            )
            chain_id = chain_config.testnet_chain_id
        else:
            explorer_base = chain_config.mainnet_explorer_url
            contract_address = (
                chain_config.mainnet_plan_registry_address
                or draft.contract_address
            )
            chain_id = chain_config.mainnet_chain_id

        draft.network = normalized_network
        draft.chain_id = chain_id
        draft.contract_address = contract_address
        draft.explorer_url = (
            address_url(chain_config, normalized_network, contract_address)
            if contract_address
            else explorer_base
        )
        draft.transaction_hash = transaction_hash
        draft.transaction_url = tx_url(chain_config, normalized_network, transaction_hash)
        draft.submitted_by = submitted_by.strip()
        draft.submitted_at = utcnow()
        draft.block_number = block_number
        draft.ready = bool(contract_address)
        session.last_onchain_sync_at = utcnow()

        execution_step_id = ""
        if session.execution_plan is not None:
            attestation_step = next(
                (
                    step
                    for step in session.execution_plan.steps
                    if step.step_type == "attestation"
                ),
                None,
            )
            execution_step_id = attestation_step.execution_step_id if attestation_step else ""

        tx_status = (
            TransactionStatus.CONFIRMED
            if block_number is not None
            else TransactionStatus.SUBMITTED
        )
        session.execution_status = (
            ExecutionLifecycleStatus.MONITORING
            if tx_status == TransactionStatus.CONFIRMED
            else ExecutionLifecycleStatus.EXECUTING
        )
        session.status = (
            SessionStatus.MONITORING
            if tx_status == TransactionStatus.CONFIRMED
            else SessionStatus.EXECUTING
        )
        receipt = TransactionReceiptRecord(
            tx_hash=transaction_hash,
            tx_status=tx_status,
            block_number=block_number,
            chain_id=chain_id,
            executed_at=draft.submitted_at or utcnow(),
            wallet_address=session.wallet_address,
            safe_address=session.safe_address,
            related_execution_step_id=execution_step_id,
            explorer_url=draft.transaction_url,
        )
        session.transaction_receipts = [
            existing
            for existing in session.transaction_receipts
            if existing.tx_hash != receipt.tx_hash
        ]
        session.transaction_receipts.append(receipt)

        anchor_record = ReportAnchorRecord(
            report_hash=draft.report_hash,
            evidence_hash=draft.evidence_hash,
            execution_plan_hash=draft.execution_plan_hash,
            attestation_hash=draft.attestation_hash,
            status="anchored" if block_number is not None else "submitted",
            chain_id=chain_id,
            contract_address=contract_address,
            transaction_hash=transaction_hash,
            block_number=block_number,
            explorer_url=draft.transaction_url,
            anchored_at=draft.submitted_at,
            note="Compatibility writeback via /api/sessions/{session_id}/attestation.",
        )
        session.report_anchor_records = [
            existing
            for existing in session.report_anchor_records
            if existing.attestation_hash != anchor_record.attestation_hash
        ]
        session.report_anchor_records.append(anchor_record)

        session.report.transaction_receipts = list(session.transaction_receipts)
        session.report.report_anchor_records = list(session.report_anchor_records)

        session.events.append(
            SessionEvent(
                kind="attestation_recorded",
                payload={
                    "network": normalized_network,
                    "transaction_hash": transaction_hash,
                    "submitted_by": submitted_by.strip(),
                    "block_number": block_number,
                },
            )
        )
        saved = self.repository.save(session)
        self.audit_log_service.write(
            action="ATTESTATION_RECORDED",
            actor=submitted_by.strip() or saved.owner_client_id,
            target=session_id,
            ip_address="wallet-client",
            summary=f"Recorded onchain attestation tx {transaction_hash[:18]}...",
            metadata={
                "network": normalized_network,
                "transaction_hash": transaction_hash,
                "block_number": str(block_number or ""),
            },
        )
        return saved

    @staticmethod
    def _execution_plan_to_tx_draft(execution_plan: ExecutionPlan):
        from app.domain.rwa import TxDraft, TxDraftStep

        chain_id = next(
            (step.chain_id for step in execution_plan.steps if step.chain_id is not None),
            0,
        )
        steps = [
            TxDraftStep(
                step=index + 1,
                title=step.title,
                description=step.description,
                action_type=step.step_type,
                target_contract=step.target_contract,
                explorer_url=step.explorer_url,
                estimated_fee_usd=step.estimated_fee_usd,
                caution="; ".join(step.warnings),
            )
            for index, step in enumerate(execution_plan.steps)
        ]
        total_fee = sum(step.estimated_fee_usd for step in execution_plan.steps)
        return TxDraft(
            title="HashKey execution plan",
            chain_id=chain_id,
            chain_name="HashKey Chain",
            funding_asset=execution_plan.source_asset or "USDT",
            total_estimated_fee_usd=total_fee,
            steps=steps,
            risk_warnings=list(execution_plan.warnings) + list(execution_plan.simulation_warnings),
            can_execute_onchain=execution_plan.can_execute_onchain,
        )

    @staticmethod
    def compute_execution_plan_hash(execution_plan: ExecutionPlan) -> str:
        payload = execution_plan.model_dump(mode="json")
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
