from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from training.supervised_extractor import extract_training_samples
from training.utils import write_jsonl


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", type=Path, default=Path("backend/data/genius_actuary.db"))
    parser.add_argument(
        "--output-path",
        type=Path,
        default=Path("training/artifacts/supervised/repo_samples.jsonl"),
    )
    args = parser.parse_args()
    rows = extract_training_samples(args.db_path)
    write_jsonl(args.output_path, rows)
    print(f"Wrote {len(rows)} supervised samples to {args.output_path}.")


if __name__ == "__main__":
    main()
