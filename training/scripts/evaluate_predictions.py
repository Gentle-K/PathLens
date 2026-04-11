from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from training.evaluation import evaluate_predictions
from training.utils import read_jsonl, write_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path", type=Path)
    parser.add_argument(
        "--output-path",
        type=Path,
        default=Path("training/artifacts/eval/evaluation_summary.json"),
    )
    parser.add_argument("--prediction-key", default="predicted_output")
    args = parser.parse_args()
    rows = read_jsonl(args.input_path)
    summary = evaluate_predictions(rows, prediction_key=args.prediction_key)
    write_json(args.output_path, summary)
    print(
        "Evaluation summary:",
        f"schema={summary.json_schema_compliance_rate:.2%}",
        f"violations={summary.hard_constraint_violation_rate:.2%}",
        f"provenance={summary.provenance_coverage_rate:.2%}",
    )


if __name__ == "__main__":
    main()
