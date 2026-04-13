from __future__ import annotations

import hashlib
import json
from typing import Iterable

from app.domain.models import AnalysisSession
from app.domain.rwa import (
    AssetTemplate,
    EligibilityDecision,
    EligibilityStatus,
    ExecutionApproval,
    ExecutionLifecycleStatus,
    ExecutionPlan,
    ExecutionQuote,
    ExecutionStep,
    ReportAnchorRecord,
)
from app.rwa.explorer_service import address_url, chain_id_for, tx_url
from app.services.eligibility import EligibilityService
from app.services.sessions import SessionService


def _normalize(value: str) -> str:
    return value.strip().lower()


def _asset_price(asset: AssetTemplate) -> float:
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


class ExecutionService:
    def __init__(
        self,
        *,
        session_service: SessionService,
        eligibility_service: EligibilityService,
    ) -> None:
        self.session_service = session_service
        self.eligibility_service = eligibility_service

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

        source_price = _asset_price(source) if source is not None else 1.0
        target_price = _asset_price(target)
        route_type = target.execution_style or "erc20"
        fee_bps = float(
            max(
                5,
                target.entry_fee_bps + target.slippage_bps + (20 if route_type == "issuer_portal" else 0),
            )
        )
        fee_amount = round(amount * fee_bps / 10000, 6)
        amount_after_fees = max(0.0, amount - fee_amount)
        expected_amount_out = round((amount_after_fees * source_price) / max(target_price, 0.000001), 6)
        gas_estimate = 190000 if route_type == "erc20" else 85000
        gas_estimate_usd = round(3.8 if route_type == "erc20" else 1.2, 4)
        eta_seconds = 90 if route_type == "erc20" else 600

        warnings = list(target.risk_flags)
        if _normalize(source_asset) and _normalize(source_asset) != _normalize(target.settlement_asset):
            warnings.append(
                f"Route requires settlement into {target.settlement_asset} before subscribing."
            )
        if source_chain and _normalize(source_chain) not in {"hashkey", "hashkey chain"}:
            warnings.append("Source funds originate off HashKey Chain; bridge or settlement routing may be required.")
        if target.lockup_days > 0:
            warnings.append(f"Target asset has a {target.lockup_days}-day lockup.")
        if target.redemption_window:
            warnings.append(f"Redemption window: {target.redemption_window}.")

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
                    amount=quote.amount_in,
                    note=f"Approve {quote.source_asset} spending for {target.name}.",
                )
            )
            possible_failure_reasons.extend(
                [
                    "Allowance is missing or lower than the requested amount.",
                    "Wallet network does not match the execution chain.",
                    "Slippage or price guard exceeded before submission.",
                ]
            )
        else:
            possible_failure_reasons.extend(
                [
                    "Issuer offchain compliance review is incomplete.",
                    "Subscription window or quota may be closed.",
                ]
            )
            warnings.append("Primary asset execution follows an issuer or portal workflow rather than a direct ERC20 call.")

        if decision.status == EligibilityStatus.BLOCKED:
            compliance_blockers.extend(decision.reasons + decision.missing_requirements)
        elif decision.status == EligibilityStatus.CONDITIONAL:
            warnings.extend(decision.reasons + decision.next_actions)

        if target.required_kyc_level or target.requires_kyc_level:
            possible_failure_reasons.append("KYC or investor qualification changed after the quote was generated.")
        if target.min_subscription_amount or target.minimum_ticket_usd:
            possible_failure_reasons.append("Ticket size is below the minimum subscription after fees or FX conversion.")

        return approvals, possible_failure_reasons, compliance_blockers, warnings

    def build_execution_plan(
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
        generate_only: bool = True,
    ) -> ExecutionPlan:
        target = self.resolve_asset(assets, target_asset_key)
        if target is None:
            raise ValueError(f"Unknown target asset '{target_asset_key}'.")

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

        steps: list[ExecutionStep] = []
        tx_bundle: list[dict[str, str | int | float | bool]] = []
        network = (
            session.intake_context.wallet_network
            or session.source_chain
            or session.intake_context.source_chain
            or "testnet"
        )
        network = "mainnet" if _normalize(network) == "mainnet" else "testnet"
        chain_id = chain_id_for(chain_config, network)

        if approvals:
            approval_step = ExecutionStep(
                step_index=1,
                title="Approve settlement asset",
                description=f"Approve {quote.source_asset} spending before the target asset call.",
                step_type="approval",
                route_kind=quote.route_type,
                asset_id=target.asset_id,
                target_contract=target.contract_address,
                explorer_url=address_url(chain_config, network, target.contract_address),
                chain_id=chain_id,
                estimated_fee_usd=round(quote.gas_estimate_usd * 0.4, 4),
                requires_signature=True,
                requires_wallet=True,
                required_approvals=approvals,
                warnings=list(warnings),
                tx_request={
                    "to": target.contract_address,
                    "value": "0x0",
                    "data": f"approve({quote.source_asset},{quote.amount_in})",
                    "chainId": chain_id,
                },
            )
            steps.append(approval_step)
            tx_bundle.append(dict(approval_step.tx_request))

        asset_step_index = len(steps) + 1
        if quote.route_type == "erc20":
            asset_step = ExecutionStep(
                step_index=asset_step_index,
                title="Execute allocation",
                description=f"Subscribe or mint {target.name} using {quote.source_asset}.",
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
                warnings=list(warnings),
                tx_request={
                    "to": target.contract_address,
                    "value": "0x0",
                    "data": f"allocate({quote.source_asset},{quote.amount_in})",
                    "chainId": chain_id,
                    "routeType": quote.route_type,
                },
            )
        else:
            asset_step = ExecutionStep(
                step_index=asset_step_index,
                title="Complete issuer subscription flow",
                description=f"Finish the issuer or portal workflow for {target.name}.",
                step_type="offchain_compliance",
                route_kind=quote.route_type,
                asset_id=target.asset_id,
                target_contract=target.contract_address,
                explorer_url=address_url(chain_config, network, target.contract_address),
                chain_id=chain_id,
                estimated_fee_usd=0.0,
                expected_amount=quote.expected_amount_out,
                requires_signature=False,
                requires_wallet=False,
                compliance_blockers=list(compliance_blockers),
                warnings=list(warnings),
                offchain_actions=[
                    "Confirm whitelist, KYC, and investor classification with the issuer.",
                    f"Settle in {target.settlement_asset} and submit the subscription ticket.",
                    "Collect confirmation from the issuer before anchoring the report.",
                ],
            )
        steps.append(asset_step)
        if asset_step.tx_request:
            tx_bundle.append(dict(asset_step.tx_request))

        if include_attestation and session.report and session.report.attestation_draft:
            draft = session.report.attestation_draft
            attestation_network = draft.network or network
            attestation_chain_id = draft.chain_id or chain_id_for(chain_config, attestation_network)
            attestation_step = ExecutionStep(
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
                tx_request={
                    "to": draft.contract_address,
                    "value": "0x0",
                    "data": f"registerPlan({draft.report_hash},{draft.attestation_hash})",
                    "chainId": attestation_chain_id,
                    "network": attestation_network,
                }
                if draft.contract_address
                else {},
            )
            steps.append(attestation_step)
            if attestation_step.tx_request:
                tx_bundle.append(dict(attestation_step.tx_request))

        plan = ExecutionPlan(
            session_id=session.session_id,
            wallet_address=session.wallet_address,
            safe_address=session.safe_address,
            source_chain=source_chain or session.source_chain or session.intake_context.source_chain or "hashkey",
            source_asset=quote.source_asset,
            target_asset=target.asset_id,
            ticket_size=amount,
            status=(
                ExecutionLifecycleStatus.READY
                if compliance_blockers
                else (
                    ExecutionLifecycleStatus.BUNDLE_READY
                    if tx_bundle or generate_only
                    else ExecutionLifecycleStatus.SIMULATED
                )
            ),
            quote=quote,
            warnings=warnings,
            simulation_warnings=list(warnings),
            possible_failure_reasons=possible_failure_reasons,
            compliance_blockers=compliance_blockers,
            required_approvals=approvals,
            steps=steps,
            tx_bundle=tx_bundle,
            eligibility=[decision],
            can_execute_onchain=bool(tx_bundle),
        )
        plan.plan_hash = self.session_service.compute_execution_plan_hash(plan)
        return plan

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
