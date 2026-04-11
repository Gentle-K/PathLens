from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "genius_actuary.db"
DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
)
MINIMAX_BASE_URLS = {
    "global": "https://api.minimax.io/v1",
    "cn": "https://api.minimaxi.com/v1",
}
DEFAULT_HASHKEY_TESTNET_RPC_URL = "https://testnet.hsk.xyz"
DEFAULT_HASHKEY_TESTNET_EXPLORER_URL = "https://testnet-explorer.hsk.xyz"
DEFAULT_HASHKEY_MAINNET_RPC_URL = "https://mainnet.hsk.xyz"
DEFAULT_HASHKEY_MAINNET_EXPLORER_URL = "https://hashkey.blockscout.com"
DEFAULT_HASHKEY_DEFAULT_EXECUTION_NETWORK = "testnet"


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_local_env(env_path: Path | None = None) -> None:
    protected_keys = set(os.environ)
    app_env = os.getenv("APP_ENV", "").strip().lower()
    env_specific_candidates: list[Path] = []
    if app_env:
        env_specific_candidates.extend(
            [
                REPO_ROOT / f".env.{app_env}",
                PROJECT_ROOT / f".env.{app_env}",
                REPO_ROOT / f".env.{app_env}.local",
                PROJECT_ROOT / f".env.{app_env}.local",
            ]
        )

    candidates = [env_path] if env_path else [
        *env_specific_candidates,
        REPO_ROOT / ".env",
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / ".env.local",
        REPO_ROOT / ".env.local",
    ]

    for path in candidates:
        if path is None or not path.exists():
            continue

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue

            if key in protected_keys:
                continue

            os.environ[key] = _strip_quotes(value.strip())


def _split_csv(value: str | None, default: tuple[str, ...]) -> list[str]:
    if not value:
        return list(default)
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_env: str
    cors_origins: list[str]
    session_db_path: Path
    analysis_adapter: str
    analysis_provider: str
    analysis_region: str
    analysis_api_base_url: str
    analysis_api_key: str | None
    analysis_model: str
    analysis_timeout_seconds: float
    analysis_retry_attempts: int
    clarification_follow_up_round_limit: int
    search_adapter: str
    search_api_base_url: str
    search_api_key: str | None
    search_country: str
    search_language: str
    search_ui_language: str
    search_result_count: int
    search_extra_snippets: bool
    chart_adapter: str
    calculation_mcp_enabled: bool
    hashkey_testnet_chain_id: int
    hashkey_testnet_rpc_url: str
    hashkey_testnet_explorer_url: str
    hashkey_mainnet_chain_id: int
    hashkey_mainnet_rpc_url: str
    hashkey_mainnet_explorer_url: str
    hashkey_default_execution_network: str
    hashkey_testnet_plan_registry_address: str | None
    hashkey_mainnet_plan_registry_address: str | None
    hashkey_testnet_kyc_sbt_address: str | None
    hashkey_mainnet_kyc_sbt_address: str | None
    plan_registry_address: str | None
    kyc_sbt_address: str | None
    debug_username: str
    debug_password: str

    @classmethod
    def from_env(cls) -> "Settings":
        load_local_env()

        db_path = os.getenv("SESSION_DB_PATH")
        analysis_provider = os.getenv("ANALYSIS_PROVIDER", "minimax").strip().lower()
        analysis_region = os.getenv("ANALYSIS_REGION", "cn").strip().lower()
        default_analysis_model = (
            "MiniMax-M2.5" if analysis_provider == "minimax" else "gpt-4.1-mini"
        )
        analysis_api_base_url = os.getenv("ANALYSIS_API_BASE_URL", "").strip()
        if not analysis_api_base_url and analysis_provider == "minimax":
            analysis_api_base_url = MINIMAX_BASE_URLS.get(
                analysis_region,
                MINIMAX_BASE_URLS["cn"],
            )
        elif not analysis_api_base_url:
            analysis_api_base_url = "https://api.openai.com/v1"

        testnet_plan_registry_address = (
            os.getenv("HASHKEY_TESTNET_PLAN_REGISTRY_ADDRESS")
            or os.getenv("PLAN_REGISTRY_ADDRESS")
            or None
        )
        mainnet_plan_registry_address = (
            os.getenv("HASHKEY_MAINNET_PLAN_REGISTRY_ADDRESS")
            or os.getenv("PLAN_REGISTRY_ADDRESS")
            or None
        )
        testnet_kyc_sbt_address = (
            os.getenv("HASHKEY_TESTNET_KYC_SBT_ADDRESS")
            or os.getenv("KYC_SBT_ADDRESS")
            or None
        )
        mainnet_kyc_sbt_address = (
            os.getenv("HASHKEY_MAINNET_KYC_SBT_ADDRESS")
            or os.getenv("KYC_SBT_ADDRESS")
            or None
        )

        return cls(
            app_env=os.getenv("APP_ENV", "development"),
            cors_origins=_split_csv(os.getenv("APP_CORS_ORIGINS"), DEFAULT_CORS_ORIGINS),
            session_db_path=Path(db_path) if db_path else DEFAULT_DB_PATH,
            analysis_adapter=os.getenv("ANALYSIS_ADAPTER", "mock").strip().lower(),
            analysis_provider=analysis_provider,
            analysis_region=analysis_region,
            analysis_api_base_url=analysis_api_base_url.rstrip("/"),
            analysis_api_key=os.getenv("ANALYSIS_API_KEY") or None,
            analysis_model=os.getenv("ANALYSIS_MODEL", default_analysis_model),
            analysis_timeout_seconds=float(os.getenv("ANALYSIS_TIMEOUT_SECONDS", "30")),
            analysis_retry_attempts=max(1, int(os.getenv("ANALYSIS_RETRY_ATTEMPTS", "4"))),
            clarification_follow_up_round_limit=max(
                1,
                int(os.getenv("CLARIFICATION_FOLLOW_UP_ROUND_LIMIT", "10")),
            ),
            search_adapter=os.getenv("SEARCH_ADAPTER", "mock").strip().lower(),
            search_api_base_url=os.getenv(
                "SEARCH_API_BASE_URL",
                "https://api.search.brave.com/res/v1/web/search",
            ).rstrip("/"),
            search_api_key=os.getenv("SEARCH_API_KEY") or None,
            search_country=os.getenv("SEARCH_COUNTRY", "CN"),
            search_language=os.getenv("SEARCH_LANGUAGE", "zh-hans"),
            search_ui_language=os.getenv("SEARCH_UI_LANGUAGE", "zh-CN"),
            search_result_count=max(1, min(20, int(os.getenv("SEARCH_RESULT_COUNT", "5")))),
            search_extra_snippets=(
                os.getenv("SEARCH_EXTRA_SNIPPETS", "true").strip().lower()
                not in {"false", "0", "no"}
            ),
            chart_adapter=os.getenv("CHART_ADAPTER", "structured").strip().lower(),
            calculation_mcp_enabled=(
                os.getenv("CALCULATION_MCP_ENABLED", "true").strip().lower()
                in {"true", "1", "yes"}
            ),
            hashkey_testnet_chain_id=max(
                1,
                int(os.getenv("HASHKEY_TESTNET_CHAIN_ID", "133")),
            ),
            hashkey_testnet_rpc_url=os.getenv(
                "HASHKEY_TESTNET_RPC_URL",
                DEFAULT_HASHKEY_TESTNET_RPC_URL,
            ).strip(),
            hashkey_testnet_explorer_url=os.getenv(
                "HASHKEY_TESTNET_EXPLORER_URL",
                DEFAULT_HASHKEY_TESTNET_EXPLORER_URL,
            ).strip(),
            hashkey_mainnet_chain_id=max(
                1,
                int(os.getenv("HASHKEY_MAINNET_CHAIN_ID", "177")),
            ),
            hashkey_mainnet_rpc_url=os.getenv(
                "HASHKEY_MAINNET_RPC_URL",
                DEFAULT_HASHKEY_MAINNET_RPC_URL,
            ).strip(),
            hashkey_mainnet_explorer_url=os.getenv(
                "HASHKEY_MAINNET_EXPLORER_URL",
                DEFAULT_HASHKEY_MAINNET_EXPLORER_URL,
            ).strip(),
            hashkey_default_execution_network=(
                os.getenv(
                    "HASHKEY_DEFAULT_EXECUTION_NETWORK",
                    DEFAULT_HASHKEY_DEFAULT_EXECUTION_NETWORK,
                )
                .strip()
                .lower()
            ),
            hashkey_testnet_plan_registry_address=testnet_plan_registry_address,
            hashkey_mainnet_plan_registry_address=mainnet_plan_registry_address,
            hashkey_testnet_kyc_sbt_address=testnet_kyc_sbt_address,
            hashkey_mainnet_kyc_sbt_address=mainnet_kyc_sbt_address,
            plan_registry_address=(
                testnet_plan_registry_address
                or mainnet_plan_registry_address
                or os.getenv("PLAN_REGISTRY_ADDRESS")
                or None
            ),
            kyc_sbt_address=(
                testnet_kyc_sbt_address
                or mainnet_kyc_sbt_address
                or os.getenv("KYC_SBT_ADDRESS")
                or None
            ),
            debug_username=os.getenv("DEBUG_USERNAME", "debug-admin"),
            debug_password=os.getenv("DEBUG_PASSWORD", "change-me-debug-password"),
        )

    def secure_cookies(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}
