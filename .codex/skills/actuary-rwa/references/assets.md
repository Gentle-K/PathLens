# Shared Assets

## Registry and features

- `training/sources/public_sources.json`
- `training/features/rwa_feature_dictionary.json`
- `training/config/student_lora_recipe.json`
- `training/config/student_manifest.example.json`

## Evaluation

- `training/eval/gold_eval_cases.jsonl`
- `training/evaluation.py`

## Backend integration points

- `backend/app/adapters/actuary_expert.py`
- `backend/app/rwa/actuary_signals.py`
- `backend/app/rwa/actuary_source_registry.py`
- `backend/app/rwa/engine.py`

## Frontend integration points

- `frontend/src/types/domain.ts`
- `frontend/src/lib/api/adapters/genius-backend.ts`
- `frontend/src/features/analysis/pages/report-page.tsx`
