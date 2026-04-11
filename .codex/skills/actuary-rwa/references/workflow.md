# Workflow

## Order of operations

1. Update shared training assets first.
   Start with `training/sources/public_sources.json`, `training/features/rwa_feature_dictionary.json`, or `training/eval/gold_eval_cases.jsonl` when the change affects provenance, features, or evaluation.
2. Update backend contracts next.
   Keep `backend/app/domain/models.py`, `backend/app/domain/rwa.py`, and the expert adapter or report helpers aligned with the shared assets.
3. Update frontend report consumption last.
   When report fields change, mirror them in `frontend/src/types/domain.ts`, `frontend/src/lib/api/adapters/genius-backend.ts`, and the report page UI.

## Guardrails

- Keep deterministic eligibility rules authoritative.
- Preserve source provenance on any new expert-mode conclusion.
- Prefer official or primary references in the source registry.
- Reject stale or unverifiable public-source rows during ETL validation.

## Minimum validation

- `python training/scripts/refresh_public_corpus.py`
- `python training/scripts/extract_supervised_samples.py --db-path backend/data/genius_actuary.db`
- `python training/scripts/generate_synthetic_cases.py --locale zh`
- `python training/scripts/evaluate_predictions.py training/eval/gold_eval_cases.jsonl --prediction-key target_output`
