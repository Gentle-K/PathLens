from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import unittest
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
TESTS_ROOT = BACKEND_ROOT / "tests"
APP_ROOT = BACKEND_ROOT / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "backend"
HTML_COVERAGE_DIR = REPO_ROOT / "coverage" / "backend-html"
XML_COVERAGE_FILE = REPO_ROOT / "coverage" / "backend.xml"
JSON_COVERAGE_FILE = REPO_ROOT / "coverage" / "backend.json"


LEGACY_UNIT_MODULES = [
    "tests.test_kyc_service",
    "tests.test_loop_regressions",
    "tests.test_mcp_pipeline",
    "tests.test_oracle_service",
    "tests.test_rwa_demo_diff",
    "tests.test_rwa_evidence",
    "tests.test_rwa_optimizer_adapter",
    "tests.test_rwa_scoring",
]


@dataclass(frozen=True)
class SuiteConfig:
    name: str
    modules: list[str]
    discover_dirs: list[Path]


SUITES: dict[str, SuiteConfig] = {
    "unit": SuiteConfig(
        name="unit",
        modules=[*LEGACY_UNIT_MODULES, "tests.unit"],
        discover_dirs=[TESTS_ROOT / "unit"],
    ),
    "integration": SuiteConfig(
        name="integration",
        modules=["tests.integration"],
        discover_dirs=[TESTS_ROOT / "integration"],
    ),
    "contract": SuiteConfig(
        name="contract",
        modules=["tests.contract"],
        discover_dirs=[TESTS_ROOT / "contract"],
    ),
}


class CapturingTextResult(unittest.TextTestResult):
    def __init__(self, stream, descriptions, verbosity):
        super().__init__(stream, descriptions, verbosity)
        self.passed: list[str] = []
        self.failure_details: list[dict[str, str]] = []
        self.error_details: list[dict[str, str]] = []
        self.skip_details: list[dict[str, str]] = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.passed.append(self.getDescription(test))

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.failure_details.append(
            {
                "test": self.getDescription(test),
                "traceback": self._exc_info_to_string(err, test),
            }
        )

    def addError(self, test, err):
        super().addError(test, err)
        self.error_details.append(
            {
                "test": self.getDescription(test),
                "traceback": self._exc_info_to_string(err, test),
            }
        )

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.skip_details.append({"test": self.getDescription(test), "reason": reason})


class CapturingTextRunner(unittest.TextTestRunner):
    resultclass = CapturingTextResult


def build_suite(selected: list[str]) -> unittest.TestSuite:
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    for name in selected:
        config = SUITES[name]
        for module in config.modules:
            if module.startswith("tests.test_"):
                suite.addTests(loader.loadTestsFromName(module))
        for discover_dir in config.discover_dirs:
            suite.addTests(
                loader.discover(
                    start_dir=str(discover_dir),
                    pattern="test*.py",
                    top_level_dir=str(BACKEND_ROOT),
                )
            )
    return suite


def ensure_output_dirs() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    (REPO_ROOT / "coverage").mkdir(parents=True, exist_ok=True)
    (REPO_ROOT / "reports").mkdir(parents=True, exist_ok=True)


def run_suite(selected: list[str], with_coverage: bool) -> tuple[dict, int]:
    ensure_output_dirs()
    sys.path.insert(0, str(BACKEND_ROOT))
    os.environ.setdefault("APP_ENV", "test")

    coverage_handle = None
    if with_coverage:
        try:
            from coverage import Coverage
        except Exception as exc:  # pragma: no cover - only hit in missing dependency environments
            raise RuntimeError(
                "coverage.py is required for --coverage. Install backend requirements first."
            ) from exc

        coverage_handle = Coverage(
            source=[str(APP_ROOT)],
            data_file=str(REPO_ROOT / ".coverage.backend"),
        )
        coverage_handle.start()

    start = time.perf_counter()
    stream = io.StringIO()
    runner = CapturingTextRunner(stream=stream, verbosity=2)
    result = runner.run(build_suite(selected))
    duration_seconds = round(time.perf_counter() - start, 3)

    coverage_summary: dict | None = None
    if coverage_handle is not None:
        coverage_handle.stop()
        coverage_handle.save()
        coverage_handle.html_report(directory=str(HTML_COVERAGE_DIR))
        coverage_handle.xml_report(outfile=str(XML_COVERAGE_FILE))
        coverage_summary = coverage_handle.json_report(outfile=str(JSON_COVERAGE_FILE))

    summary = {
        "suite_names": selected,
        "command": "python3 scripts/run_backend_tests.py " + " ".join(selected),
        "success": result.wasSuccessful(),
        "duration_seconds": duration_seconds,
        "counts": {
            "run": result.testsRun,
            "passed": len(result.passed),
            "failed": len(result.failures),
            "errors": len(result.errors),
            "skipped": len(getattr(result, "skipped", [])),
        },
        "passed_tests": result.passed,
        "failures": result.failure_details,
        "errors": result.error_details,
        "skipped": result.skip_details,
        "output": stream.getvalue(),
        "coverage": coverage_summary,
    }
    return summary, 0 if result.wasSuccessful() else 1


def output_path_for(selected: list[str]) -> Path:
    label = "-".join(selected)
    return RESULTS_ROOT / f"{label}.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run backend test suites with optional coverage.")
    parser.add_argument(
        "suites",
        nargs="*",
        choices=["unit", "integration", "contract", "all"],
        default=["unit"],
        help="The backend suite groups to execute.",
    )
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Collect backend coverage with coverage.py.",
    )
    return parser.parse_args()


def normalize_suites(values: list[str]) -> list[str]:
    if not values or values == ["all"] or "all" in values:
        return ["unit", "integration", "contract"]
    return values


def main() -> int:
    args = parse_args()
    selected = normalize_suites(args.suites)
    summary, exit_code = run_suite(selected, with_coverage=args.coverage)
    destination = output_path_for(selected)
    destination.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(summary["output"], end="")
    print(f"[run_backend_tests] wrote {destination.relative_to(REPO_ROOT)}")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
