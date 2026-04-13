from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

import httpx

from app.domain.rwa import (
    AssetTemplate,
    HashKeyChainConfig,
    KycOnchainResult,
    PositionSnapshot,
    WalletBalance,
)
from app.rwa.explorer_service import rpc_url_for
from app.rwa.kyc_service import read_kyc_from_chain

BALANCE_OF_SELECTOR = "0x70a08231"
DECIMALS_SELECTOR = "0x313ce567"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _encode_address(address: str) -> str:
    return address.lower().replace("0x", "").zfill(64)


def _rpc_call(
    chain_config: HashKeyChainConfig,
    network: str,
    method: str,
    params: list,
    *,
    timeout_seconds: float = 5.0,
) -> str | dict | list | None:
    try:
        response = httpx.post(
            rpc_url_for(chain_config, network),
            json={
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
                "id": 1,
            },
            headers={"Content-Type": "application/json"},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            return None
        return payload.get("result")
    except Exception:
        return None


def _detect_contract_wallet(
    chain_config: HashKeyChainConfig,
    address: str,
    network: str,
) -> bool:
    result = _rpc_call(chain_config, network, "eth_getCode", [address, "latest"])
    return isinstance(result, str) and result not in {"0x", "0x0", ""}


def _read_decimals(
    chain_config: HashKeyChainConfig,
    contract_address: str,
    network: str,
) -> int | None:
    result = _rpc_call(
        chain_config,
        network,
        "eth_call",
        [{"to": contract_address, "data": DECIMALS_SELECTOR}, "latest"],
    )
    if not isinstance(result, str) or result in {"0x", ""}:
        return None
    try:
        return int(result, 16)
    except ValueError:
        return None


def _read_balance(
    chain_config: HashKeyChainConfig,
    contract_address: str,
    wallet_address: str,
    network: str,
) -> int | None:
    result = _rpc_call(
        chain_config,
        network,
        "eth_call",
        [
            {"to": contract_address, "data": BALANCE_OF_SELECTOR + _encode_address(wallet_address)},
            "latest",
        ],
    )
    if not isinstance(result, str) or result in {"0x", ""}:
        return None
    try:
        return int(result, 16)
    except ValueError:
        return None


def _estimate_price(asset: AssetTemplate) -> float:
    if asset.nav_or_price is not None and asset.nav_or_price > 0:
        return asset.nav_or_price
    if asset.asset_type.value == "stablecoin":
        return 1.0
    if asset.asset_type.value == "mmf":
        return 1.0
    if asset.indicative_yield is not None and asset.indicative_yield > 0:
        return 1.0 + asset.indicative_yield
    return 1.0


class WalletService:
    def build_wallet_summary(
        self,
        *,
        address: str,
        chain_config: HashKeyChainConfig,
        assets: list[AssetTemplate],
        network: str = "",
    ) -> tuple[str, list[WalletBalance], KycOnchainResult, bool, datetime]:
        resolved_network = (network or chain_config.default_execution_network or "testnet").strip().lower()
        balances = self._read_balances(
            address=address,
            chain_config=chain_config,
            assets=assets,
            network=resolved_network,
        )
        kyc = read_kyc_from_chain(chain_config, address, resolved_network)
        safe_detected = _detect_contract_wallet(chain_config, address, resolved_network)
        synced_at = _utcnow()
        return resolved_network, balances, kyc, safe_detected, synced_at

    def build_wallet_positions(
        self,
        *,
        address: str,
        chain_config: HashKeyChainConfig,
        assets: list[AssetTemplate],
        network: str = "",
        historical_positions: Iterable[PositionSnapshot] = (),
    ) -> tuple[str, list[PositionSnapshot], datetime]:
        resolved_network = (network or chain_config.default_execution_network or "testnet").strip().lower()
        balances = self._read_balances(
            address=address,
            chain_config=chain_config,
            assets=assets,
            network=resolved_network,
        )
        asset_by_symbol = {asset.symbol.lower(): asset for asset in assets}
        snapshots = [
            PositionSnapshot(
                asset_id=asset_by_symbol[balance.symbol.lower()].asset_id,
                asset_name=asset_by_symbol[balance.symbol.lower()].name,
                chain_id=balance.chain_id,
                contract_address=balance.contract_address,
                wallet_address=address,
                current_balance=balance.amount,
                latest_nav_or_price=balance.price,
                current_value=balance.usd_value,
                cost_basis=0.0,
                unrealized_pnl=0.0,
                accrued_yield=0.0,
                next_redemption_window=asset_by_symbol[balance.symbol.lower()].redemption_window
                or (
                    f"T+{asset_by_symbol[balance.symbol.lower()].redemption_days}"
                    if asset_by_symbol[balance.symbol.lower()].redemption_days
                    else "T+0"
                ),
                oracle_staleness_flag=False,
                kyc_change_flag=False,
            )
            for balance in balances
            if balance.symbol.lower() in asset_by_symbol and balance.amount > 0
        ]
        seen = {item.asset_id for item in snapshots}
        for snapshot in historical_positions:
            if snapshot.asset_id not in seen:
                snapshots.append(snapshot)
        return resolved_network, snapshots, _utcnow()

    def _read_balances(
        self,
        *,
        address: str,
        chain_config: HashKeyChainConfig,
        assets: list[AssetTemplate],
        network: str,
    ) -> list[WalletBalance]:
        balances: list[WalletBalance] = []
        for asset in assets:
            if not asset.contract_address or asset.execution_style != "erc20":
                continue
            decimals = _read_decimals(chain_config, asset.contract_address, network)
            raw_balance = _read_balance(chain_config, asset.contract_address, address, network)
            if raw_balance is None:
                continue
            divisor = 10 ** (decimals or 18)
            amount = raw_balance / divisor
            price = _estimate_price(asset)
            balances.append(
                WalletBalance(
                    symbol=asset.symbol,
                    amount=amount,
                    chain_id=asset.chain_id,
                    contract_address=asset.contract_address,
                    usd_value=round(amount * price, 6),
                    price=price,
                )
            )
        return balances
