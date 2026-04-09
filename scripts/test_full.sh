#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
TMP_ROOT="${TMP_ROOT:-$ROOT_DIR/tmp/test_full}"
mkdir -p "$TMP_ROOT"

MODE="${MODE:-mock}"
PYTHON_BIN="${PYTHON_BIN:-python3.13}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
BACKEND_PORT="${BACKEND_PORT:-18000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
FRONTEND_COVERAGE_DIR="${FRONTEND_COVERAGE_DIR:-$ROOT_DIR/tmp/frontend-coverage}"
BACKEND_VENV="${BACKEND_VENV:-$BACKEND_DIR/.venv}"
BACKEND_TEST_VENV="${BACKEND_TEST_VENV:-$BACKEND_DIR/.venv-test}"
BACKEND_PY="$BACKEND_VENV/bin/python"
BACKEND_TEST_PY="$BACKEND_TEST_VENV/bin/python"

log() {
  printf '[test_full] %s\n' "$*"
}

fail() {
  printf '[test_full] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    fail "Missing shasum/sha256sum for dependency cache checks"
  fi
}

ensure_python_venv() {
  local target_dir="$1"
  local requirements_file="$2"
  local python_path="$3"
  local install_flag="$4"
  local marker="$target_dir/.requirements.sha256"
  local req_hash

  if [[ ! -x "$python_path" ]]; then
    log "Creating virtualenv at $target_dir"
    "$PYTHON_BIN" -m venv "$target_dir"
  fi

  req_hash="$(sha256_file "$requirements_file")"
  if [[ "$install_flag" == "1" ]] || [[ ! -f "$marker" ]] || [[ "$(cat "$marker")" != "$req_hash" ]]; then
    log "Installing Python dependencies in $target_dir"
    "$python_path" -m pip install -r "$requirements_file"
    printf '%s' "$req_hash" >"$marker"
  else
    log "Python dependencies already up to date in $target_dir"
  fi
}

ensure_frontend_deps() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]] || [[ "$INSTALL_DEPS" == "1" ]]; then
    log "Installing frontend dependencies"
    (
      cd "$FRONTEND_DIR"
      npm install
    )
  else
    log "Frontend dependencies already installed"
  fi
}

require_cmd "$PYTHON_BIN"
require_cmd npm
require_cmd curl
require_cmd jq

if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
  log "Creating backend/.env from example"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

if [[ ! -f "$FRONTEND_DIR/.env" && -f "$FRONTEND_DIR/.env.example" ]]; then
  log "Creating frontend/.env from example"
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
fi

ensure_python_venv "$BACKEND_VENV" "$BACKEND_DIR/requirements.txt" "$BACKEND_PY" "$INSTALL_DEPS"
ensure_python_venv "$BACKEND_TEST_VENV" "$BACKEND_DIR/requirements.txt" "$BACKEND_TEST_PY" "$INSTALL_DEPS"
ensure_frontend_deps

log "Running backend unit tests"
(
  cd "$BACKEND_DIR"
  "$BACKEND_TEST_PY" -m unittest discover -s tests
)

log "Running frontend lint"
(
  cd "$FRONTEND_DIR"
  npm run lint
)

log "Running frontend tests with coverage output under tmp/"
rm -rf "$FRONTEND_COVERAGE_DIR"
(
  cd "$FRONTEND_DIR"
  npx vitest run --coverage --coverage.reportsDirectory "$FRONTEND_COVERAGE_DIR"
)

log "Running frontend production build"
(
  cd "$FRONTEND_DIR"
  npm run build
)

log "Running backend smoke test"
MODE="$MODE" \
PYTHON_BIN="$PYTHON_BIN" \
BACKEND_PORT="$BACKEND_PORT" \
BACKEND_HOST="$BACKEND_HOST" \
INSTALL_BACKEND_DEPS=never \
"$SCRIPT_DIR/test_smoke.sh"

log "Full test suite passed"
printf '%s\n' "mode=$MODE"
printf '%s\n' "frontend_coverage_dir=$FRONTEND_COVERAGE_DIR"
