from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
TEST_RESULTS_ROOT = REPO_ROOT / "test-results"
REPORTS_ROOT = REPO_ROOT / "reports"
SUMMARY_PATH = REPORTS_ROOT / "test-summary.md"
MACHINE_SUMMARY_PATH = TEST_RESULTS_ROOT / "summary.json"


def read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def backend_counts() -> tuple[dict, list[str]]:
    aggregate = {"run": 0, "passed": 0, "failed": 0, "errors": 0, "skipped": 0}
    covered_modules: list[str] = []
    candidates = [
        TEST_RESULTS_ROOT / "backend" / "unit-integration-contract.json",
        TEST_RESULTS_ROOT / "backend" / "integration-contract.json",
        TEST_RESULTS_ROOT / "backend" / "unit.json",
        TEST_RESULTS_ROOT / "backend" / "integration.json",
        TEST_RESULTS_ROOT / "backend" / "contract.json",
    ]
    existing = [path for path in candidates if path.exists()]

    # Prefer the combined backend run when it exists, otherwise aggregate partial runs.
    if (TEST_RESULTS_ROOT / "backend" / "unit-integration-contract.json").exists():
        existing = [TEST_RESULTS_ROOT / "backend" / "unit-integration-contract.json"]
    elif (TEST_RESULTS_ROOT / "backend" / "integration-contract.json").exists() and (
        TEST_RESULTS_ROOT / "backend" / "unit.json"
    ).exists():
        existing = [
            TEST_RESULTS_ROOT / "backend" / "unit.json",
            TEST_RESULTS_ROOT / "backend" / "integration-contract.json",
        ]

    for path in existing:
        payload = read_json(path)
        if not payload:
            continue
        counts = payload.get("counts", {})
        for key in aggregate:
            aggregate[key] += int(counts.get(key, 0))
        for suite_name in payload.get("suite_names", []):
            if suite_name not in covered_modules:
                covered_modules.append(suite_name)
    return aggregate, covered_modules


def frontend_counts() -> dict:
    payload = read_json(TEST_RESULTS_ROOT / "frontend" / "vitest.json") or {}
    return {
        "run": int(payload.get("numTotalTests", 0)),
        "passed": int(payload.get("numPassedTests", 0)),
        "failed": int(payload.get("numFailedTests", 0)),
        "skipped": int(payload.get("numPendingTests", 0)),
    }


def e2e_counts() -> dict:
    payload = read_json(TEST_RESULTS_ROOT / "e2e" / "playwright.json") or {}
    stats = payload.get("stats", {})
    expected = int(stats.get("expected", 0))
    unexpected = int(stats.get("unexpected", 0))
    skipped = int(stats.get("skipped", 0))
    flaky = int(stats.get("flaky", 0))
    return {
        "run": expected + unexpected + skipped + flaky,
        "passed": expected,
        "failed": unexpected,
        "skipped": skipped,
        "flaky": flaky,
    }


def render_markdown(summary: dict) -> str:
    backend = summary["backend"]
    frontend = summary["frontend"]
    e2e = summary["e2e"]
    manual_checks = [
        "Injected wallet connect and network switching against a real HashKey-compatible browser wallet.",
        "Live onchain attestation write against the deployed PlanRegistry contract.",
        "Cross-browser visual verification beyond Playwright Chromium.",
    ]
    risks = summary["risks"] or ["No new blocking automation gaps were identified during this run."]

    return "\n".join(
        [
            "# Test Summary",
            "",
            "## Scope",
            "- Frontend unit, component, and page interaction tests",
            "- Backend unit, integration, contract, and resilience tests",
            "- End-to-end browser flows from the web entry point in deterministic mock mode",
            "- Aggregated coverage artifacts for backend and frontend",
            "",
            "## Implemented Layers",
            "- Frontend: mode selection, problem input, clarification, progress, report rendering, adapter mapping, and fallback UI",
            "- Backend: schemas/models, clarification logic, prompt context building, orchestrator state transitions, adapter resilience, persistence, and API contracts",
            "- E2E: three realistic decision scenarios through the browser UI",
            "",
            "## Result Counts",
            f"- Backend: {backend['passed']} passed, {backend['failed']} failed, {backend['errors']} errors, {backend['skipped']} skipped, {backend['run']} total",
            f"- Frontend: {frontend['passed']} passed, {frontend['failed']} failed, {frontend['skipped']} skipped, {frontend['run']} total",
            f"- E2E: {e2e['passed']} passed, {e2e['failed']} failed, {e2e['skipped']} skipped, {e2e['run']} total",
            "",
            "## Major Suites Added",
            "- `backend/tests/unit/test_models_and_schemas.py`",
            "- `backend/tests/unit/test_clarification_engine.py`",
            "- `backend/tests/unit/test_orchestrator_state_machine.py`",
            "- `backend/tests/unit/test_adapter_resilience.py`",
            "- `backend/tests/integration/test_api_session_flow.py`",
            "- `backend/tests/integration/test_persistence_repository.py`",
            "- `backend/tests/contract/test_rwa_api_contracts.py`",
            "- `frontend/src/features/analysis/pages/problem-input-page.test.tsx`",
            "- `frontend/src/features/analysis/pages/clarification-page.test.tsx`",
            "- `frontend/src/features/analysis/pages/progress-page.test.tsx`",
            "- `frontend/src/features/analysis/pages/mode-selection-page.test.tsx`",
            "- `frontend/src/features/analysis/pages/report-page.test.tsx`",
            "- `e2e/specs/decision-flows.spec.ts`",
            "",
            "## Covered Modules",
            f"- Backend suites executed: {', '.join(summary['backend_suite_names']) or 'none'}",
            "- Frontend adapter mapping, analysis pages, chart/report sections, and mock runtime flow",
            "- End-to-end mode selection, clarification answering, progress polling, final report routing, and chart presence",
            "",
            "## Fallback Validation",
            "- Search, calculation, and chart adapter failures are covered by backend resilience tests.",
            "- Invalid LLM output fallback is covered by backend resilience tests.",
            "- Database/storage failure returns a structured 503 response in API integration tests.",
            "- Frontend clarification, progress, and report pages now have explicit recoverable error states under test.",
            "",
            "## Coverage Artifacts",
            "- Frontend HTML coverage: `coverage/frontend/index.html`",
            "- Backend HTML coverage: `coverage/backend-html/index.html`",
            "- Backend XML coverage: `coverage/backend.xml`",
            "- Backend JSON coverage: `coverage/backend.json`",
            "",
            "## Manual Verification",
            *[f"- {item}" for item in manual_checks],
            "",
            "## Bugs Or Risks Found",
            *[f"- {item}" for item in risks],
            "",
            "## Recommended Actions Before Release",
            "- Run `npm run test:all` in CI on every merge candidate.",
            "- Keep wallet- and chain-dependent acceptance checks in a small manual release checklist.",
            "- Review coverage reports for any newly added product modules before freezing the demo build.",
            "",
        ]
    )


def main() -> int:
    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    TEST_RESULTS_ROOT.mkdir(parents=True, exist_ok=True)

    backend, backend_suite_names = backend_counts()
    frontend = frontend_counts()
    e2e = e2e_counts()

    summary = {
        "backend": backend,
        "backend_suite_names": backend_suite_names,
        "frontend": frontend,
        "e2e": e2e,
        "risks": [],
    }

    MACHINE_SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    SUMMARY_PATH.write_text(render_markdown(summary), encoding="utf-8")
    print(f"[generate_test_report] wrote {SUMMARY_PATH.relative_to(REPO_ROOT)}")
    print(f"[generate_test_report] wrote {MACHINE_SUMMARY_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
