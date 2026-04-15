from __future__ import annotations

import hashlib
import http.cookiejar
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_venv_python(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def probe_python(command: list[str]) -> tuple[tuple[int, int], str] | None:
    try:
        completed = subprocess.run(
            command
            + [
                "-c",
                "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}'); print(sys.executable)",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        return None

    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        return None

    major, minor = lines[0].split(".", 1)
    return (int(major), int(minor)), lines[1]


def select_base_python(requested: str | None = None) -> list[str]:
    if requested:
        return [requested]

    candidates: list[list[str]] = [[sys.executable]]
    if os.name == "nt":
        candidates.extend([["py", "-3.13"], ["py", "-3.12"]])
    else:
        candidates.extend([["python3.13"], ["python3.12"], ["python3"]])
    candidates.append(["python"])

    fallback = [sys.executable]
    for candidate in candidates:
        probed = probe_python(candidate)
        if not probed:
            continue
        version, _ = probed
        if version < (3, 14):
            return candidate
        fallback = candidate
    return fallback


def ensure_python_venv(
    venv_dir: Path,
    requirements_file: Path,
    base_python: list[str],
    install_mode: str = "auto",
) -> Path:
    python_path = resolve_venv_python(venv_dir)
    needs_recreate = False
    existing_version = probe_python([str(python_path)]) if python_path.exists() else None
    preferred_version = probe_python(base_python)

    if (
        existing_version
        and preferred_version
        and existing_version[0] >= (3, 14)
        and preferred_version[0] < (3, 14)
    ):
        log(f"Recreating {venv_dir} with a compatible interpreter")
        needs_recreate = True
        existing_version = None

    if not python_path.exists() or needs_recreate:
        log(f"Creating virtualenv at {venv_dir}")
        command = base_python + ["-m", "venv"]
        if venv_dir.exists():
            command.append("--clear")
        command.append(str(venv_dir))
        subprocess.run(command, check=True)
        python_path = resolve_venv_python(venv_dir)

    marker = venv_dir / ".requirements.sha256"
    requirements_hash = sha256_file(requirements_file)
    should_install = install_mode == "always"
    if install_mode == "auto":
        should_install = not marker.exists() or marker.read_text().strip() != requirements_hash

    if should_install:
        log(f"Installing Python dependencies into {venv_dir}")
        run_checked(
            [str(python_path), "-m", "pip", "install", "-r", str(requirements_file)],
            cwd=requirements_file.parent,
        )
        marker.write_text(requirements_hash, encoding="utf-8")
    elif install_mode == "never":
        log(f"Skipping dependency installation for {venv_dir}")
    else:
        log(f"Python dependencies already up to date in {venv_dir}")

    return python_path


def run_checked(command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=cwd, env=env, check=True)


def log(message: str) -> None:
    print(f"[test_smoke] {message}")


def request_json(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with opener.open(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_health(base_url: str, backend: subprocess.Popen[str], log_file: Path) -> None:
    health_url = f"{base_url}/health"
    for _ in range(40):
        if backend.poll() is not None:
            raise RuntimeError(f"Backend exited early. See {log_file}")

        try:
            with urllib.request.urlopen(health_url, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("status") == "ok":
                return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Backend did not become healthy at {health_url}")


def smoke_payload() -> dict[str, object]:
    return {
        "mode": "multi_option",
        "problem_statement": "Build a 30 day HashKey Chain RWA allocation for 10000 USDT with T+3 liquidity.",
        "intake_context": {
            "investment_amount": 10000,
            "base_currency": "USDT",
            "preferred_asset_ids": ["hsk-usdc", "cpic-estable-mmf", "hk-regulated-silver"],
            "holding_period_days": 30,
            "risk_tolerance": "balanced",
            "liquidity_need": "t_plus_3",
            "minimum_kyc_level": 1,
            "wallet_address": "",
            "wants_onchain_attestation": True,
            "additional_constraints": "Prefer liquid assets and preserve evidence traceability.",
        },
    }


def answer_payload(session: dict[str, object]) -> dict[str, object]:
    questions = session.get("clarification_questions", [])
    answers = []
    for question in questions:
        if not isinstance(question, dict) or question.get("answered"):
            continue
        answers.append(
            {
                "question_id": question["question_id"],
                "value": "Keep liquidity inside T+3, prioritize evidence, and compare USDC, MMF, and silver exposure.",
            }
        )
    return {"answers": answers}


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    root_dir = script_dir.parent
    backend_dir = root_dir / "backend"
    tmp_root = Path(os.getenv("TMP_ROOT", str(root_dir / "tmp" / "test_smoke")))
    tmp_root.mkdir(parents=True, exist_ok=True)

    base_python = select_base_python(os.getenv("PYTHON_BIN"))
    log(f"Using base Python command: {' '.join(base_python)}")
    mode = os.getenv("MODE", "mock")
    backend_host = os.getenv("BACKEND_HOST", "127.0.0.1")
    backend_port = int(os.getenv("BACKEND_PORT") or find_free_port())
    start_backend = env_bool("START_BACKEND", True)
    install_backend_deps = os.getenv("INSTALL_BACKEND_DEPS", "auto")
    log_file = Path(os.getenv("LOG_FILE", str(tmp_root / "backend.log")))
    session_db_path = Path(
        os.getenv("SESSION_DB_PATH", str(tmp_root / "genius_actuary_smoke.db"))
    )
    cookie_jar_path = Path(os.getenv("COOKIE_JAR", str(tmp_root / "cookies.txt")))
    backend_venv = Path(os.getenv("BACKEND_VENV", str(backend_dir / ".venv")))
    backend_python = ensure_python_venv(
        backend_venv,
        backend_dir / "requirements.txt",
        base_python,
        install_backend_deps,
    )

    backend_url = os.getenv("BACKEND_URL", f"http://{backend_host}:{backend_port}")
    backend_process: subprocess.Popen[str] | None = None
    log_handle = None

    try:
        if start_backend:
            if session_db_path.exists():
                session_db_path.unlink()
            if cookie_jar_path.exists():
                cookie_jar_path.unlink()
            log_handle = log_file.open("w", encoding="utf-8")
            env = os.environ.copy()
            env["SESSION_DB_PATH"] = str(session_db_path)
            if mode == "mock":
                env["ANALYSIS_ADAPTER"] = "mock"
                env["SEARCH_ADAPTER"] = "mock"
                env["CHART_ADAPTER"] = "structured"
                env["CALCULATION_MCP_ENABLED"] = "true"
            log(f"Starting backend on {backend_url}")
            backend_process = subprocess.Popen(
                [
                    str(backend_python),
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    backend_host,
                    "--port",
                    str(backend_port),
                ],
                cwd=backend_dir,
                env=env,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                text=True,
            )
            wait_for_health(backend_url, backend_process, log_file)
        else:
            log(f"Using external backend at {backend_url}")
            with urllib.request.urlopen(f"{backend_url}/health", timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("status") != "ok":
                raise RuntimeError("External backend health check failed")

        cookie_jar = http.cookiejar.MozillaCookieJar(str(cookie_jar_path))
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

        health = request_json(opener, f"{backend_url}/health")
        assert health["status"] == "ok"

        bootstrap = request_json(opener, f"{backend_url}/api/frontend/bootstrap")
        chain_config = bootstrap["chain_config"]
        assert chain_config["mainnet_chain_id"] == 177
        assert chain_config["testnet_chain_id"] == 133
        assert len(bootstrap["asset_library"]) >= 3

        step = request_json(
            opener,
            f"{backend_url}/api/sessions",
            method="POST",
            payload=smoke_payload(),
        )
        session_id = str(step["session_id"])
        assert step["status"] == "CLARIFYING"

        for round_index in range(10):
            session = request_json(opener, f"{backend_url}/api/sessions/{session_id}")
            status = session["status"]
            if status == "READY_FOR_EXECUTION":
                break
            if status == "FAILED":
                raise RuntimeError(f"Session failed: {session.get('error_message', '')}")

            answers = answer_payload(session)
            log(
                f"Round {round_index + 1}: submitting {len(answers['answers'])} clarification answers"
            )
            request_json(
                opener,
                f"{backend_url}/api/sessions/{session_id}/step",
                method="POST",
                payload=answers,
            )

        final_session = request_json(opener, f"{backend_url}/api/sessions/{session_id}")
        if final_session["status"] != "READY_FOR_EXECUTION":
            raise RuntimeError(
                f"Expected READY_FOR_EXECUTION, got {final_session['status']}"
            )

        report = final_session["report"]
        if not report:
            raise RuntimeError("Final report is missing")

        summary = {
            "session_id": session_id,
            "status": final_session["status"],
            "asset_cards": len(report["asset_cards"]),
            "simulations": len(report["simulations"]),
            "allocations": len(report["recommended_allocations"]),
            "has_tx_draft": report["tx_draft"] is not None,
            "has_attestation_draft": report["attestation_draft"] is not None,
            "evidence_count": len(final_session["evidence_items"]),
            "chart_count": len(final_session["chart_artifacts"]),
        }

        if summary["asset_cards"] <= 0 or summary["simulations"] <= 0:
            raise RuntimeError("Report is missing core analysis outputs")
        if not summary["has_tx_draft"] or not summary["has_attestation_draft"]:
            raise RuntimeError("Report is missing tx/attestation drafts")

        print(json.dumps(summary, indent=2))
        return 0
    finally:
        if backend_process is not None and backend_process.poll() is None:
            backend_process.terminate()
            try:
                backend_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                backend_process.kill()
        if log_handle is not None:
            log_handle.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, RuntimeError, subprocess.CalledProcessError, urllib.error.URLError) as exc:
        print(f"[test_smoke] ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
