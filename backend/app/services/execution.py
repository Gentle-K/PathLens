from __future__ import annotations

import hashlib
import json
from typing import Iterable

from app.domain.models import AnalysisSession
from app.domain.rwa import (
    AssetTemplate,
    EligibilityDecision,
    EligibilityStatus,
    ExecutionAdapterKind,
    ExecutionApproval,
    ExecutionLifecycleStatus,
    ExecutionPlan,
    ExecutionQuote,
    ExecutionReadiness,
    ExecutionReceipt,
    ExecutionStep,
    IssuerRequestRecord,
    ReportAnchorRecord,
    SettlementStatus,
)
from app.rwa.explorer_service import address_url, chain_id_for, tx_url
from app.services.eligibility import EligibilityService
from app.services.execution_receipts import ExecutionReceiptsService
from app.services.sessions import SessionService

LIVE_EXECUTION_ASSET_IDS = {
    "hsk-usdt",
    "hsk-usdc",
    "cpic-estable-mmf",
    "hk-regulated-silver",
}


def _normalize(value: str) -> str:
    return value.strip().lower()


def _asset_price(asset: AssetTemplate | None) -> float:
    if asset is None:
        return 1.0
    if asset.nav_or_price is not None and asset.nav_or_price > 0:
        return asset.nav_or_price
    if asset.asset_type.value in {"stablecoin", "mmf"}:
        return 1.0
    if asset.indicative_yield is not None and asset.indicative_yield > 0:
        return 1.0 + asset.indicative_yield
    return 1.0


def _hash_json(payload: object) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


def _method_selector(signature: str) -> str:
    return hashlib.sha3_256(signature.encode("utf-8")).hexdigest()[:8]


def _abi_word(value: object) -> str:
    if isinstance(value, str) and value.startswith("0x") and len(value) == 42:
        return f"{'0' * 24}{value[2:].lower()}"
    if isinstance(value, bool):
        return f"{1 if value else 0:064x}"
    if isinstance(value, int):
        return f"{max(value, 0):064x}"
    if isinstance(value, float):
        return f"{max(int(round(value)), 0):064x}"
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()
    return digest[:64]


def _encode_call(signature: str, args: list[object]) -> str:
    return f"0x{_method_selector(signature)}{''.join(_abi_word(arg) for arg in args)}"


class ExecutionService:
    def __init__(
        self,
        *,
        session_service: SessionService,
        eligibility_service: EligibilityService,
        receipts_service: ExecutionReceiptsService,
    ) -> None:
        self.session_service = session_service
        self.eligibility_service = eligibility_service
        self.receipts_service = receipts_service

    @staticmethod
    def resolve_asset(assets: Iterable[AssetTemplate], key: str) -> AssetTemplate | None:
        normalized = _normalize(key)
        for asset in assets:
            if normalized in {
                _normalize(asset.asset_id),
                _normalize(asset.symbol),
                _normalize(asset.name),
            }:
                return asset
        return None

    def build_quote(
        self,
        *,
        assets: list[AssetTemplate],
        source_asset: str,
        target_asset: str,
        amount: float,
        source_chain: str = "",
    ) -> ExecutionQuote:
        target = self.resolve_asset(assets, target_asset)
        source = self.resolve_asset(assets, source_asset)
        if target is None:
            raise ValueError(f"Unknown target asset '{target_asset}'.")

        source_price = _asset_price(source)
        target_price = _asset_price(target)
        route_type = self._route_type_for(target)
        fee_bps = float(
            max(
                5,
                target.entry_fee_bps
                + target.slippage_bps
                + (20 if route_type == "issuer_portal" else 0),
            )
        )
        if route_type == "view_only":
            fee_bps = 0.0
        fee_amount = round(amount * fee_bps / 10000, 6)
        amount_after_fees = max(0.0, amount - fee_amount)
        expected_amount_out = round((amount_after_fees * source_price) / max(target_price, 0.000001), 6)
        gas_estimate = 190000 if route_type == "erc20" else (85000 if route_type == "issuer_portal" else 0)
        gas_estimate_usd = round(3.8 if route_type == "erc20" else (1.2 if route_type == "issuer_portal" else 0.0), 4)
        eta_seconds = 90 if route_type == "erc20" else (600 if route_type == "issuer_portal" else 0)

        warnings = list(target.risk_flags)
        if _normalize(source_asset) and _normalize(source_asset) != _normalize(target.settlement_asset):
            warnings.append(
                f"Route requires settlement into {target.settlement_asset} before subscribing."
            )
        if source_chain and _normalize(source_chain) not in {"hashkey", "hashkey chain", "mainnet", "testnet"}:
            warnings.append("Source funds originate off HashKey Chain; bridge or settlement routing may be required.")
        if target.lockup_days > 0:
            warnings.append(f"Target asset has a {target.lockup_days}-day lockup.")
        if target.redemption_window:
            warnings.append(f"Redemption window: {target.redemption_window}.")
        if route_type == "view_only":
            warnings.append(
                "Asset is reference-only in the current stack and should not be treated as a live execution target."
            )

        return ExecutionQuote(
            source_asset=source_asset or target.settlement_asset,
            target_asset=target.asset_id,
            amount_in=amount,
            expected_amount_out=expected_amount_out,
            fee_amount=fee_amount,
            fee_bps=fee_bps,
            gas_estimate=gas_estimate,
            gas_estimate_usd=gas_estimate_usd,
            eta_seconds=eta_seconds,
            route_type=route_type,
            warnings=warnings,
        )

    def simulate_execution(
        self,
        *,
        target: AssetTemplate,
        quote: ExecutionQuote,
        decision: EligibilityDecision,
    ) -> tuple[list[ExecutionApproval], list[str], list[str], list[str]]:
        approvals: list[ExecutionApproval] = []
        possible_failure_reasons: list[str] = []
        compliance_blockers: list[str] = []
        warnings = list(quote.warnings)

        if quote.route_type == "erc20":
            approvals.append(
                ExecutionApproval(
                    approval_type="erc20_allowance",
                    token_symbol=quote.source_asset,
                    spender=target.contract_address,
                    approval_target=target.contract_address,
                    amount=quote.amount_in,
                    note=f"Approve {quote.source_asset} spending for {target.name}.",
                    allowance_required=True,
                )
            )
            possible_failure_reasons.extend(
                [
                    "Allowance is missing or lower than the requested amount.",
                    "Wallet network does not match the execution chain.",
                    "Slippage or price guard exceeded before submission.",
                ]
            )
        elif quote.route_type == "issuer_portal":
            possible_failure_reasons.extend(
                [
                    "Issuer offchain compliance review is incomplete.",
                    "Subscription window or quota may be closed.",
                ]
            )
            warnings.append("Primary asset execution follows an issuer or portal workflow rather than a direct ERC20 call.")
        else:
            compliance_blockers.append(
                "This asset is view-only in the current release and cannot be executed from the workbench."
            )
            possible_failure_reasons.append(
                "The asset is outside the v1 live execution scope."
            )
            warnings.append(
                "Use the proof view for verification and comparison instead of treating this asset as executable."
            )

        if decision.status == EligibilityStatus.BLOCKED:
            compliance_blockers.extend(decision.reasons + decision.missing_requirements)
        elif decision.status == EligibilityStatus.CONDITIONAL:
            warnings.extend(decision.reasons + decision.next_actions)

        if target.required_kyc_level or target.requires_kyc_level:
            possible_failure_reasons.append("KYC or investor qualification changed after the quote was generated.")
        if target.min_subscription_amount or target.minimum_ticket_usd:
            possible_failure_reasons.append("Ticket size is below the minimum subscription after fees or FX conversion.")

        return approvals, possible_failure_reasons, compliance_blockers, warnings

    @staticmethod
    def _route_type_for(target: AssetTemplate) -> str:
        if (
            target.asset_id not in LIVE_EXECUTION_ASSET_IDS
            or target.live_readiness.value in {"demo_only", "benchmark_only"}
            or target.asset_type.value == "benchmark"
        ):
            return "view_only"
        return target.execution_style or "erc20"

    def _execution_adapter_kind_for(self, target: AssetTemplate) -> ExecutionAdapterKind:
        route_type = self._route_type_for(target)
        if route_type == "erc20":
            return ExecutionAdapterKind.DIRECT_CONTRACT
        if route_type == "issuer_portal":
            return ExecutionAdapterKind.ISSUER_PORTAL
        return ExecutionAdapterKind.VIEW_ONLY

    def _execution_readiness_for(
        self,
        target: AssetTemplate,
        decision: EligibilityDecision,
    ) -> ExecutionReadiness:
        if decision.status == EligibilityStatus.BLOCKED:
            return ExecutionReadiness.BLOCKED
        adapter_kind = self._execution_adapter_kind_for(target)
        if adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            return ExecutionReadiness.READY
        if adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            return ExecutionReadiness.REQUIRES_ISSUER
        return ExecutionReadiness.VIEW_ONLY

    @staticmethod
    def _checklist_for(target: AssetTemplate, adapter_kind: ExecutionAdapterKind) -> list[str]:
        checklist = [
            "Verify the target asset proof freshness before signing.",
            "Confirm wallet network and settlement asset routing.",
        ]
        if target.requires_kyc_level:
            checklist.append(f"Confirm KYC level {target.requires_kyc_level}+ is active.")
        if target.minimum_ticket_usd:
            checklist.append(f"Minimum ticket: ${target.minimum_ticket_usd:,.0f}.")
        if adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            checklist.append("Review allowance scope and tx request payload before signing.")
        elif adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            checklist.append("Collect issuer-side docs and whitelist approvals before redirect.")
        return checklist

    @staticmethod
    def _external_steps_for(target: AssetTemplate, adapter_kind: ExecutionAdapterKind) -> list[str]:
        if adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            return [
                "Sign allowance if required.",
                "Submit contract transaction from the connected wallet.",
                "Track settlement and proof/portfolio writeback.",
            ]
        if adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            return [
                "Open issuer flow.",
                "Complete whitelist / docs / subscription confirmation.",
                "Wait for issuer settlement and sync the resulting status.",
            ]
        return [
            "View proof and readiness only.",
            "Do not treat this asset as executable in the live flow.",
        ]

    @staticmethod
    def _amount_units(asset_symbol: str, amount: float) -> int:
        decimals = 6 if asset_symbol.upper() in {"USDT", "USDC"} else 18
        return max(int(round(amount * (10**decimals))), 0)

    def _build_direct_contract_payload(
        self,
        *,
        target: AssetTemplate,
        source: AssetTemplate | None,
        quote: ExecutionQuote,
        wallet_address: str,
        chain_id: int,
    ) -> tuple[dict[str, object], dict[str, object]]:
        amount_units = self._amount_units(quote.source_asset, quote.amount_in)
        source_contract = source.contract_address if source else target.contract_address
        approval_request = {
            "to": source_contract,
            "value": "0x0",
            "data": _encode_call(
                "approve(address,uint256)",
                [target.contract_address, amount_units],
            ),
            "chainId": chain_id,
            "methodName": "approve",
            "args": [target.contract_address, str(amount_units)],
        }

        if target.asset_type.value == "stablecoin":
            method_name = "transfer"
            signature = "transfer(address,uint256)"
            args = [wallet_address or "0x0000000000000000000000000000000000000000", amount_units]
        else:
            method_name = "subscribe"
            signature = "subscribe(uint256,address)"
            args = [amount_units, wallet_address or "0x0000000000000000000000000000000000000000"]
        execution_request = {
            "to": target.contract_address,
            "value": "0x0",
            "data": _encode_call(signature, args),
            "chainId": chain_id,
            "methodName": method_name,
            "args": [str(arg) for arg in args],
        }
        return approval_request, execution_request

    def prepare_execution(
        self,
        *,
        session: AnalysisSession,
        chain_config,
        assets: list[AssetTemplate],
        target_asset_key: str,
        amount: float,
        source_asset: str = "",
        source_chain: str = "",
        include_attestation: bool = True,
    ) -> ExecutionPlan:
        target = self.resolve_asset(assets, target_asset_key)
        if target is None:
            raise ValueError(f"Unknown target asset '{target_asset_key}'.")
        source = self.resolve_asset(assets, source_asset or target.settlement_asset)

        decision = self.eligibility_service.evaluate_asset(
            target,
            kyc_level=session.kyc_level or session.intake_context.kyc_level,
            investor_type=session.investor_type or session.intake_context.investor_type,
            jurisdiction=session.jurisdiction or session.intake_context.jurisdiction,
            ticket_size=amount,
            source_asset=source_asset or session.source_asset or session.intake_context.source_asset,
            source_chain=source_chain or session.source_chain or session.intake_context.source_chain,
        )
        quote = self.build_quote(
            assets=assets,
            source_asset=source_asset or session.source_asset or target.settlement_asset,
            target_asset=target.asset_id,
            amount=amount,
            source_chain=source_chain or session.source_chain or session.intake_context.source_chain,
        )
        approvals, possible_failure_reasons, compliance_blockers, warnings = self.simulate_execution(
            target=target,
            quote=quote,
            decision=decision,
        )
        adapter_kind = self._execution_adapter_kind_for(target)
        execution_readiness = self._execution_readiness_for(target, decision)
        checklist = self._checklist_for(target, adapter_kind)
        external_steps = self._external_steps_for(target, adapter_kind)
        readiness_reason = (
            "Eligible for direct contract execution on HashKey Chain."
            if execution_readiness == ExecutionReadiness.READY
            else (
                "Execution still depends on issuer or platform workflow after wallet qualification."
                if execution_readiness == ExecutionReadiness.REQUIRES_ISSUER
                else (
                    "Execution is blocked by current eligibility constraints."
                    if execution_readiness == ExecutionReadiness.BLOCKED
                    else "Asset is view-only in the current release."
                )
            )
        )

        steps: list[ExecutionStep] = []
        tx_bundle: list[dict[str, object]] = []
        network = (
            session.intake_context.wallet_network
            or session.source_chain
            or session.intake_context.source_chain
            or "testnet"
        )
        network = "mainnet" if _normalize(network) == "mainnet" else "testnet"
        chain_id = chain_id_for(chain_config, network)

        if adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            approval_request, execution_request = self._build_direct_contract_payload(
                target=target,
                source=source,
                quote=quote,
                wallet_address=session.wallet_address or session.safe_address,
                chain_id=chain_id,
            )
            if approvals:
                approval_step = ExecutionStep(
                    step_index=1,
                    title="Approve settlement asset",
                    description=f"Approve {quote.source_asset} spending before the target asset call.",
                    step_type="approval",
                    route_kind=quote.route_type,
                    asset_id=target.asset_id,
                    target_contract=source.contract_address if source else target.contract_address,
                    explorer_url=address_url(chain_config, network, source.contract_address if source else target.contract_address),
                    chain_id=chain_id,
                    estimated_fee_usd=round(quote.gas_estimate_usd * 0.4, 4),
                    requires_signature=True,
                    requires_wallet=True,
                    required_approvals=approvals,
                    checklist=["Review allowance scope."],
                    warnings=list(warnings),
                    tx_request=approval_request,
                )
                steps.append(approval_step)
                tx_bundle.append(dict(approval_step.tx_request))

            steps.append(
                ExecutionStep(
                    step_index=len(steps) + 1,
                    title="Submit direct contract transaction",
                    description=f"Execute the direct contract route for {target.name}.",
                    step_type="asset_execution",
                    route_kind=quote.route_type,
                    asset_id=target.asset_id,
                    target_contract=target.contract_address,
                    explorer_url=address_url(chain_config, network, target.contract_address),
                    chain_id=chain_id,
                    estimated_fee_usd=quote.gas_estimate_usd,
                    expected_amount=quote.expected_amount_out,
                    requires_signature=True,
                    requires_wallet=True,
                    compliance_blockers=list(compliance_blockers),
                    required_approvals=list(approvals),
                    checklist=["Verify calldata.", "Verify recipient and amount."],
                    warnings=list(warnings),
                    tx_request=execution_request,
                )
            )
            tx_bundle.append(execution_request)
        elif adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            steps.append(
                ExecutionStep(
                    step_index=1,
                    title="Prepare issuer submission",
                    description=f"Complete the issuer or portal workflow for {target.name}.",
                    step_type="offchain_compliance",
                    route_kind=quote.route_type,
                    asset_id=target.asset_id,
                    target_contract=target.contract_address,
                    explorer_url=address_url(chain_config, network, target.contract_address) if target.contract_address else "",
                    chain_id=chain_id,
                    estimated_fee_usd=0.0,
                    expected_amount=quote.expected_amount_out,
                    requires_signature=False,
                    requires_wallet=False,
                    compliance_blockers=list(compliance_blockers),
                    warnings=list(warnings),
                    checklist=["Collect required docs.", "Review whitelist / KYC status."],
                    offchain_actions=list(external_steps),
                    redirect_url=target.action_links[0].url if target.action_links else "",
                )
            )
        else:
            steps.append(
                ExecutionStep(
                    step_index=1,
                    title="View proof and execution requirements",
                    description=f"{target.name} is visible for verification and comparison but not executable from this console.",
                    step_type="view_only_guidance",
                    route_kind=quote.route_type,
                    asset_id=target.asset_id,
                    target_contract=target.contract_address,
                    explorer_url=address_url(chain_config, network, target.contract_address) if target.contract_address else "",
                    chain_id=chain_id,
                    estimated_fee_usd=0.0,
                    expected_amount=quote.expected_amount_out,
                    requires_signature=False,
                    requires_wallet=False,
                    compliance_blockers=list(compliance_blockers),
                    checklist=["Do not submit.", "Use the proof page for verification."],
                    warnings=list(warnings),
                    offchain_actions=list(external_steps),
                )
            )

        if include_attestation and session.report and session.report.attestation_draft:
            draft = session.report.attestation_draft
            attestation_network = draft.network or network
            attestation_chain_id = draft.chain_id or chain_id_for(chain_config, attestation_network)
            attestation_request = {
                "to": draft.contract_address,
                "value": "0x0",
                "data": _encode_call(
                    "registerPlan(bytes32,bytes32,bytes32,string,string)",
                    [draft.report_hash, draft.portfolio_hash, draft.attestation_hash, session.session_id, "hashkey://report-anchor"],
                )
                if draft.contract_address
                else "",
                "chainId": attestation_chain_id,
            }
            steps.append(
                ExecutionStep(
                    step_index=len(steps) + 1,
                    title="Anchor report and execution plan",
                    description="Write the report hash, evidence hash, and execution plan hash into the attestation flow.",
                    step_type="attestation",
                    route_kind="erc20",
                    target_contract=draft.contract_address,
                    explorer_url=draft.explorer_url,
                    chain_id=attestation_chain_id,
                    estimated_fee_usd=1.1,
                    requires_signature=bool(draft.contract_address),
                    requires_wallet=True,
                    warnings=[
                        "Attestation proves report and plan integrity, not asset-leg settlement finality.",
                    ],
                    tx_request=attestation_request if draft.contract_address else {},
                )
            )
            if attestation_request.get("to"):
                tx_bundle.append(attestation_request)

        plan = ExecutionPlan(
            session_id=session.session_id,
            wallet_address=session.wallet_address,
            safe_address=session.safe_address,
            source_chain=source_chain or session.source_chain or session.intake_context.source_chain or "hashkey",
            source_asset=quote.source_asset,
            target_asset=target.asset_id,
            execution_adapter_kind=adapter_kind,
            execution_readiness=execution_readiness,
            readiness_reason=readiness_reason,
            external_action_url=(target.action_links[0].url if target.action_links else ""),
            external_action_label=(
                "Issuer portal"
                if adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL
                else "Proof view"
            ),
            ticket_size=amount,
            status=ExecutionLifecycleStatus.PREPARED,
            quote=quote,
            warnings=warnings,
            simulation_warnings=list(warnings),
            possible_failure_reasons=possible_failure_reasons,
            compliance_blockers=compliance_blockers,
            required_approvals=approvals,
            checklist=checklist,
            external_steps=external_steps,
            steps=steps,
            tx_bundle=tx_bundle,
            eligibility=[decision],
            can_execute_onchain=bool(tx_bundle) and adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT,
        )
        plan.plan_hash = self.session_service.compute_execution_plan_hash(plan)
        return plan

    def submit_execution(
        self,
        *,
        session: AnalysisSession,
        chain_config,
        assets: list[AssetTemplate],
        target_asset_key: str,
        amount: float,
        source_asset: str = "",
        source_chain: str = "",
        include_attestation: bool = True,
        network: str = "",
        transaction_hash: str = "",
        submitted_by: str = "",
        block_number: int | None = None,
    ) -> tuple[ExecutionPlan, ExecutionReceipt, IssuerRequestRecord | None]:
        plan = self.prepare_execution(
            session=session,
            chain_config=chain_config,
            assets=assets,
            target_asset_key=target_asset_key,
            amount=amount,
            source_asset=source_asset,
            source_chain=source_chain,
            include_attestation=include_attestation,
        )
        issuer_request: IssuerRequestRecord | None = None
        wallet = submitted_by or session.wallet_address or session.safe_address
        receipt = ExecutionReceipt(
            session_id=session.session_id,
            asset_id=plan.target_asset,
            adapter_kind=plan.execution_adapter_kind,
            status=ExecutionLifecycleStatus.PREPARED,
            settlement_status=SettlementStatus.NOT_STARTED,
            prepared_payload={
                "executionPlanId": plan.execution_plan_id,
                "planHash": plan.plan_hash,
                "quote": plan.quote.model_dump(mode="json") if plan.quote else {},
                "checklist": list(plan.checklist),
            },
            wallet_address=wallet,
            safe_address=session.safe_address,
        )

        if plan.execution_adapter_kind == ExecutionAdapterKind.VIEW_ONLY:
            raise ValueError("This asset is visible for proof and comparison only.")

        if plan.execution_adapter_kind == ExecutionAdapterKind.DIRECT_CONTRACT:
            submit_payload = next(
                (step.tx_request for step in plan.steps if step.step_type == "asset_execution"),
                {},
            )
            receipt.submit_payload = submit_payload
            receipt.tx_hash = transaction_hash
            receipt.block_number = block_number
            receipt.submitted_at = None if not transaction_hash else session.updated_at
            receipt.status = (
                ExecutionLifecycleStatus.COMPLETED
                if block_number is not None
                else (ExecutionLifecycleStatus.SUBMITTED if transaction_hash else ExecutionLifecycleStatus.PREPARED)
            )
            receipt.settlement_status = (
                SettlementStatus.COMPLETED
                if block_number is not None
                else (SettlementStatus.PENDING if transaction_hash else SettlementStatus.NOT_STARTED)
            )
        elif plan.execution_adapter_kind == ExecutionAdapterKind.ISSUER_PORTAL:
            target = self.resolve_asset(assets, plan.target_asset)
            receipt.status = ExecutionLifecycleStatus.REDIRECT_REQUIRED
            receipt.settlement_status = SettlementStatus.PENDING
            receipt.submitted_at = session.updated_at
            receipt.redirect_url = target.action_links[0].url if target and target.action_links else ""
            receipt.external_request_id = _hash_json(
                {
                    "session_id": session.session_id,
                    "target_asset": plan.target_asset,
                    "ticket_size": amount,
                }
            )[:18]
            receipt.submit_payload = {
                "redirectUrl": receipt.redirect_url,
                "requestId": receipt.external_request_id,
                "requiredDocs": list(plan.checklist),
            }
            issuer_request = self.receipts_service.save_issuer_request(
                IssuerRequestRecord(
                    receipt_id=receipt.receipt_id,
                    asset_id=plan.target_asset,
                    issuer_case_id=receipt.external_request_id,
                    redirect_url=receipt.redirect_url,
                    issuer_status="redirect_required",
                )
            )

        stored_receipt = self.receipts_service.save_receipt(receipt)
        plan.receipt_id = stored_receipt.receipt_id
        plan.status = stored_receipt.status
        return plan, stored_receipt, issuer_request

    def compute_evidence_hash(self, session: AnalysisSession) -> str:
        payload = [
            {
                "evidence_id": item.evidence_id,
                "asset_id": item.asset_id,
                "source_url": item.source_url,
                "summary": item.summary,
                "included_in_execution_plan": item.included_in_execution_plan,
            }
            for item in session.evidence_items
        ]
        return _hash_json(payload)

    def build_report_anchor_record(
        self,
        *,
        session: AnalysisSession,
        chain_config,
        network: str,
        transaction_hash: str = "",
        submitted_by: str = "",
        block_number: int | None = None,
        note: str = "",
    ) -> ReportAnchorRecord:
        if session.report is None or session.report.attestation_draft is None:
            raise ValueError("Report attestation draft is unavailable for this session.")

        draft = session.report.attestation_draft
        execution_plan_hash = (
            session.execution_plan.plan_hash
            if session.execution_plan is not None
            else draft.execution_plan_hash
        )
        report_hash = draft.report_hash or _hash_json(session.report.markdown)
        evidence_hash = draft.evidence_hash or self.compute_evidence_hash(session)
        explorer_url = tx_url(chain_config, network, transaction_hash) if transaction_hash else ""

        return ReportAnchorRecord(
            report_hash=report_hash,
            evidence_hash=evidence_hash,
            execution_plan_hash=execution_plan_hash,
            attestation_hash=draft.attestation_hash,
            status="anchored" if block_number is not None else ("submitted" if transaction_hash else "draft"),
            chain_id=draft.chain_id,
            contract_address=draft.contract_address,
            transaction_hash=transaction_hash,
            block_number=block_number,
            explorer_url=explorer_url,
            anchored_at=draft.submitted_at,
            note=note or f"Anchored by {submitted_by or 'wallet-client'} via report anchor API.",
        )
