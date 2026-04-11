from __future__ import annotations

import sys
from pathlib import Path

from training.schemas import SyntheticCase


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings  # noqa: E402
from app.rwa.catalog import build_asset_library, build_chain_config  # noqa: E402


RISK_TOLERANCES = ("conservative", "balanced", "aggressive")
LIQUIDITY_WINDOWS = ("t_plus_0", "t_plus_3", "30_day_lock", "180_day_lock")
KYC_STATES = ("l0_none", "l1_basic", "l2_professional", "wallet_verified")
STRESS_TAGS = ("baseline", "depeg_run", "oracle_deviation", "liquidity_crunch")


def generate_case_grid(locale: str = "zh") -> list[dict]:
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    assets = build_asset_library(chain_config, locale=locale)
    cases: list[dict] = []
    index = 1
    for asset in assets:
        for risk in RISK_TOLERANCES:
            for liquidity in LIQUIDITY_WINDOWS:
                for kyc_state in KYC_STATES:
                    for stress_tag in STRESS_TAGS:
                        synthetic = SyntheticCase(
                            case_id=f"syn-{index:05d}",
                            problem_statement=(
                                f"I have 10,000 USDT and want an {risk} {asset.name} allocation under {stress_tag} stress."
                            ),
                            locale=locale,
                            stress_tag=stress_tag,
                            selected_asset_ids=(asset.asset_id,),
                            intake_context={
                                "investment_amount": 10000.0,
                                "base_currency": "USDT",
                                "preferred_asset_ids": [asset.asset_id],
                                "risk_tolerance": risk,
                                "liquidity_need": liquidity,
                                "kyc_state": kyc_state,
                            },
                            hard_constraints=(
                                "respect_kyc_and_access_gating",
                                "respect_minimum_ticket_thresholds",
                                "keep_output_bilingual_ready",
                            ),
                            teacher_prompt=(
                                "Produce a structured RWA actuarial analysis sample with clarification, planning, stress, "
                                "and report-friendly output while preserving hard access constraints."
                            ),
                        )
                        cases.append(
                            {
                                "case_id": synthetic.case_id,
                                "problem_statement": synthetic.problem_statement,
                                "locale": synthetic.locale,
                                "stress_tag": synthetic.stress_tag,
                                "selected_asset_ids": list(synthetic.selected_asset_ids),
                                "intake_context": synthetic.intake_context,
                                "hard_constraints": list(synthetic.hard_constraints),
                                "teacher_prompt": synthetic.teacher_prompt,
                                "sample_origin": "synthetic_grid",
                            }
                        )
                        index += 1
    return cases

