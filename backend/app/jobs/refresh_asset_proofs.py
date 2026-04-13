from __future__ import annotations

from app.bootstrap import get_app_services
from app.config import Settings
from app.rwa.catalog import build_asset_library, build_chain_config


def refresh_asset_proofs(*, locale: str = "zh", network: str = ""):
    services = get_app_services()
    settings = Settings.from_env()
    chain_config = build_chain_config(settings)
    assets = build_asset_library(chain_config, locale=locale)
    resolved_network = (
        (network or chain_config.default_execution_network or "testnet").strip().lower()
    )
    resolved_network = "mainnet" if resolved_network == "mainnet" else "testnet"
    return services.proof_service.refresh_live_asset_proofs(
        assets=assets,
        chain_config=chain_config,
        network=resolved_network,
    )


if __name__ == "__main__":  # pragma: no cover
    result = refresh_asset_proofs()
    print(f"refreshed {len(result)} proof snapshots")
