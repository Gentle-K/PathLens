#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
TMP_ROOT="${TMP_ROOT:-$ROOT_DIR/tmp/test_smoke}"
mkdir -p "$TMP_ROOT"

MODE="${MODE:-mock}"
PYTHON_BIN="${PYTHON_BIN:-python3.13}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-18000}"
BACKEND_URL="${BACKEND_URL:-http://${BACKEND_HOST}:${BACKEND_PORT}}"
START_BACKEND="${START_BACKEND:-1}"
INSTALL_BACKEND_DEPS="${INSTALL_BACKEND_DEPS:-auto}"
COOKIE_JAR="${COOKIE_JAR:-$TMP_ROOT/cookies.txt}"
LOG_FILE="${LOG_FILE:-$TMP_ROOT/backend.log}"
SESSION_DB_PATH="${SESSION_DB_PATH:-$TMP_ROOT/genius_actuary_smoke.db}"
BACKEND_VENV="${BACKEND_VENV:-$BACKEND_DIR/.venv}"
BACKEND_PY="$BACKEND_VENV/bin/python"

BACKEND_PID=""

log() {
  printf '[test_smoke] %s\n' "$*"
}

fail() {
  printf '[test_smoke] ERROR: %s\n' "$*" >&2
  if [[ -f "$LOG_FILE" ]]; then
    printf '[test_smoke] backend log: %s\n' "$LOG_FILE" >&2
  fi
  exit 1
}

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

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

ensure_backend_venv() {
  require_cmd "$PYTHON_BIN"

  if [[ ! -x "$BACKEND_PY" ]]; then
    log "Creating backend virtualenv with $PYTHON_BIN"
    "$PYTHON_BIN" -m venv "$BACKEND_VENV"
  fi

  local req_hash
  local marker
  req_hash="$(sha256_file "$BACKEND_DIR/requirements.txt")"
  marker="$BACKEND_VENV/.requirements.sha256"

  if [[ "$INSTALL_BACKEND_DEPS" == "always" ]] || [[ ! -f "$marker" ]] || [[ "$(cat "$marker")" != "$req_hash" ]]; then
    log "Installing backend dependencies"
    "$BACKEND_PY" -m pip install -r "$BACKEND_DIR/requirements.txt"
    printf '%s' "$req_hash" >"$marker"
  elif [[ "$INSTALL_BACKEND_DEPS" == "never" ]]; then
    log "Skipping backend dependency install by request"
  else
    log "Backend dependencies already up to date"
  fi
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 40); do
    if curl -fsS "$BACKEND_URL/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  fail "Backend did not become healthy at $BACKEND_URL"
}

start_backend() {
  : >"$LOG_FILE"
  rm -f "$COOKIE_JAR" "$SESSION_DB_PATH"

  log "Starting backend on $BACKEND_URL"
  if [[ "$MODE" == "mock" ]]; then
    (
      cd "$BACKEND_DIR"
      env \
        SESSION_DB_PATH="$SESSION_DB_PATH" \
        ANALYSIS_ADAPTER=mock \
        SEARCH_ADAPTER=mock \
        CHART_ADAPTER=structured \
        CALCULATION_MCP_ENABLED=true \
        "$BACKEND_PY" -m uvicorn app.main:app \
          --host "$BACKEND_HOST" \
          --port "$BACKEND_PORT"
    ) >"$LOG_FILE" 2>&1 &
  else
    (
      cd "$BACKEND_DIR"
      env \
        SESSION_DB_PATH="$SESSION_DB_PATH" \
        "$BACKEND_PY" -m uvicorn app.main:app \
          --host "$BACKEND_HOST" \
          --port "$BACKEND_PORT"
    ) >"$LOG_FILE" 2>&1 &
  fi

  BACKEND_PID=$!
  wait_for_health
}

json_field() {
  local filter="$1"
  jq -r "$filter"
}

require_cmd curl
require_cmd jq
ensure_backend_venv

if [[ "$START_BACKEND" == "1" ]]; then
  start_backend
else
  log "Using external backend at $BACKEND_URL"
  curl -fsS "$BACKEND_URL/health" >/dev/null || fail "External backend is not reachable"
fi

log "Checking health endpoint"
health_json="$(curl -fsS "$BACKEND_URL/health")"
[[ "$(printf '%s' "$health_json" | json_field '.status')" == "ok" ]] || fail "Unexpected /health response: $health_json"

log "Fetching frontend bootstrap"
bootstrap_json="$(curl -fsS -c "$COOKIE_JAR" "$BACKEND_URL/api/frontend/bootstrap")"
mainnet_chain_id="$(printf '%s' "$bootstrap_json" | json_field '.chain_config.mainnet_chain_id')"
testnet_chain_id="$(printf '%s' "$bootstrap_json" | json_field '.chain_config.testnet_chain_id')"
asset_count="$(printf '%s' "$bootstrap_json" | json_field '.asset_library | length')"
[[ "$mainnet_chain_id" == "177" ]] || fail "Expected mainnet chain id 177, got $mainnet_chain_id"
[[ "$testnet_chain_id" == "133" ]] || fail "Expected testnet chain id 133, got $testnet_chain_id"
(( asset_count >= 3 )) || fail "Expected at least 3 assets in bootstrap, got $asset_count"

log "Creating analysis session"
create_payload="$(cat <<'JSON'
{
  "mode": "multi_option",
  "problem_statement": "我有10000 USDT，想在HashKey Chain上做30天RWA配置，要求T+3内可退出，风险偏好均衡。",
  "intake_context": {
    "investment_amount": 10000,
    "base_currency": "USDT",
    "preferred_asset_ids": ["hsk-usdc", "cpic-estable-mmf", "hk-regulated-silver"],
    "holding_period_days": 30,
    "risk_tolerance": "balanced",
    "liquidity_need": "t_plus_3",
    "minimum_kyc_level": 1,
    "wallet_address": "",
    "wants_onchain_attestation": true,
    "additional_constraints": "优先保证流动性，不接受长期锁定"
  }
}
JSON
)"

step_json="$(curl -fsS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -X POST "$BACKEND_URL/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "$create_payload")"

session_id="$(printf '%s' "$step_json" | json_field '.session_id')"
status="$(printf '%s' "$step_json" | json_field '.status')"
[[ -n "$session_id" && "$session_id" != "null" ]] || fail "Missing session_id in create response"
[[ "$status" == "CLARIFYING" ]] || fail "Expected CLARIFYING after session creation, got $status"

log "Walking session to completion"
for round in $(seq 1 10); do
  session_json="$(curl -fsS -b "$COOKIE_JAR" "$BACKEND_URL/api/sessions/$session_id")"
  status="$(printf '%s' "$session_json" | json_field '.status')"

  if [[ "$status" == "COMPLETED" ]]; then
    break
  fi

  if [[ "$status" == "FAILED" ]]; then
    fail "Session entered FAILED: $(printf '%s' "$session_json" | json_field '.error_message')"
  fi

  unanswered_count="$(printf '%s' "$session_json" | json_field '[.clarification_questions[] | select(.answered == false)] | length')"

  if (( unanswered_count > 0 )); then
    log "Round $round: answering $unanswered_count clarification questions"
    answers_payload="$(
      printf '%s' "$session_json" | jq '{
        answers: [
          .clarification_questions[]
          | select(.answered == false)
          | {
              question_id: .question_id,
              value: "目标是30天内做均衡配置，优先流动性，能接受基础KYC，重点比较USDC、MMF和白银RWA。"
            }
        ]
      }'
    )"
  else
    log "Round $round: no pending questions, advancing session"
    answers_payload='{"answers":[]}'
  fi

  step_json="$(curl -fsS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "$BACKEND_URL/api/sessions/$session_id/step" \
    -H 'Content-Type: application/json' \
    -d "$answers_payload")"

  log "Round $round result: status=$(printf '%s' "$step_json" | json_field '.status') next_action=$(printf '%s' "$step_json" | json_field '.next_action')"
done

final_json="$(curl -fsS -b "$COOKIE_JAR" "$BACKEND_URL/api/sessions/$session_id")"
final_status="$(printf '%s' "$final_json" | json_field '.status')"
[[ "$final_status" == "COMPLETED" ]] || fail "Expected COMPLETED final status, got $final_status"

asset_cards="$(printf '%s' "$final_json" | json_field '.report.asset_cards | length')"
simulations="$(printf '%s' "$final_json" | json_field '.report.simulations | length')"
allocations="$(printf '%s' "$final_json" | json_field '.report.recommended_allocations | length')"
has_tx_draft="$(printf '%s' "$final_json" | json_field '.report.tx_draft != null')"
has_attestation="$(printf '%s' "$final_json" | json_field '.report.attestation_draft != null')"
evidence_count="$(printf '%s' "$final_json" | json_field '.evidence_items | length')"
chart_count="$(printf '%s' "$final_json" | json_field '.chart_artifacts | length')"

(( asset_cards > 0 )) || fail "Expected report.asset_cards > 0"
(( simulations > 0 )) || fail "Expected report.simulations > 0"
(( allocations > 0 )) || fail "Expected report.recommended_allocations > 0"
[[ "$has_tx_draft" == "true" ]] || fail "Expected tx draft in final report"
[[ "$has_attestation" == "true" ]] || fail "Expected attestation draft in final report"
(( evidence_count > 0 )) || fail "Expected evidence_items > 0"
(( chart_count > 0 )) || fail "Expected chart_artifacts > 0"

log "Smoke test passed"
printf '%s\n' "$final_json" | jq '{
  session_id,
  status,
  asset_cards: (.report.asset_cards | length),
  simulations: (.report.simulations | length),
  allocations: (.report.recommended_allocations | length),
  has_tx_draft: (.report.tx_draft != null),
  has_attestation: (.report.attestation_draft != null),
  evidence_count: (.evidence_items | length),
  chart_count: (.chart_artifacts | length)
}'
