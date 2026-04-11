from __future__ import annotations

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from training.synthetic_cases import generate_case_grid
from training.utils import write_jsonl


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", default="zh")
    parser.add_argument(
        "--output-path",
        type=Path,
        default=Path("training/artifacts/synthetic/rwa_case_grid.jsonl"),
    )
    args = parser.parse_args()
    rows = generate_case_grid(locale=args.locale)
    write_jsonl(args.output_path, rows)
    print(f"Wrote {len(rows)} synthetic cases to {args.output_path}.")


if __name__ == "__main__":
    main()
