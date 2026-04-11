---
name: actuary-rwa
description: RWA actuarial diligence, HashKey-aligned reserve and oracle stress analysis, and distilled-student training support for this repository. Use when Codex needs to extend or validate the repo's `actuary_expert` backend path, refresh the shared public-source registry, generate supervised or synthetic training data, update the repo-local RWA skill, or produce evidence-backed confidence bands, reserve summaries, and source-provenance outputs for stablecoin, MMF, silver, or other RWA flows.
---

# Actuary RWA

## Overview

Use this skill to keep the repo's RWA actuarial stack aligned across three surfaces:

1. Backend expert routing in `backend/app/adapters/actuary_expert.py`
2. Shared training assets under `training/`
3. Repo-local Codex automation under `.codex/skills/actuary-rwa/`

Treat the deterministic RWA engine as the hard-constraint layer. Do not let model-facing changes override KYC gating, minimum ticket checks, liquidity windows, fee logic, or risk monotonicity.

## Core Workflow

1. Start from the shared assets.
   Read `training/sources/public_sources.json`, `training/features/rwa_feature_dictionary.json`, and `training/eval/gold_eval_cases.jsonl` before changing prompts, contracts, or evaluation logic.
2. Keep backend and skill assets in lockstep.
   If you add a new provenance category, stress output, or eval case, update both the backend-facing contract and the repo-local skill references so they keep pointing at the same source of truth.
3. Preserve deterministic authority.
   Student-model outputs may enrich clarification, planning, stress explanations, and reporting. They must not relax hard eligibility or execution constraints already enforced by the RWA engine.
4. Validate with the repo scripts.
   Use the wrappers in `scripts/` to refresh normalized public tables, extract supervised samples, generate synthetic case grids, and score eval predictions.

## Common Tasks

### Refresh the public corpus

Run one of:

- `python .codex/skills/actuary-rwa/scripts/refresh_public_corpus.py`
- `python training/scripts/refresh_public_corpus.py`

Expect normalized outputs for `asset_snapshot`, `market_series`, `reserve_backing`, `regulatory_constraints`, and `source_provenance`.

### Extract supervised training samples

Run one of:

- `python .codex/skills/actuary-rwa/scripts/extract_repo_samples.py --db-path backend/data/genius_actuary.db`
- `python training/scripts/extract_supervised_samples.py --db-path backend/data/genius_actuary.db`

Preserve the contract fields:

- `task_type`
- `input_context`
- `target_output`
- `hard_constraints`
- `source_refs`
- `freshness_date`
- `teacher_version`
- `sample_origin`

### Generate synthetic RWA cases

Run one of:

- `python .codex/skills/actuary-rwa/scripts/generate_synthetic_cases.py --locale zh`
- `python training/scripts/generate_synthetic_cases.py --locale en`

Keep the fixed coverage grid intact unless the repo plan changes:

- 3 risk tolerances
- 4 liquidity windows
- 4 KYC states
- 4 stress tags
- all current asset templates

### Evaluate predictions

Run one of:

- `python .codex/skills/actuary-rwa/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output`
- `python training/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output`

Use this when you change report schema, provenance logic, or student-model output formatting.

## File Map

- Backend adapter: `backend/app/adapters/actuary_expert.py`
- Report signals: `backend/app/rwa/actuary_signals.py`
- Source lookup: `backend/app/rwa/actuary_source_registry.py`
- Source registry: `training/sources/public_sources.json`
- Feature dictionary: `training/features/rwa_feature_dictionary.json`
- LoRA recipe: `training/config/student_lora_recipe.json`
- Student manifest example: `training/config/student_manifest.example.json`
- Gold eval set: `training/eval/gold_eval_cases.jsonl`

Read `references/workflow.md` for the change order and `references/assets.md` for the shared asset inventory when the task touches multiple layers.

## Validation

- Run `python C:\Users\ROG\.codex\skills\.system\skill-creator\scripts\quick_validate.py .codex/skills/actuary-rwa` after changing this skill.
- Run backend tests that cover report enrichment and training data helpers.
- Run frontend build or tests when report fields or API adapters change.
