"""Self-custody USDT on-chain payment service (BEP-20, TRC-20, Polygon).

Manages:
1. Auto-generated Master Wallet (BIP-39 12-word mnemonic -> EVM + TRON addresses)
   stored encrypted at rest via Fernet in `smm_settings`.
2. Fixed IDR/USDT exchange rate configured by the Owner (`usdt_rate_idr`).
3. Unique 4-decimal USDT amount allocation per active invoice so zero-touch
   on-chain detection can match incoming transfers without requiring users to
   submit a TXID/tx_hash or pay gas sweeping fees.
4. Direct RPC / TronGrid transfer verification for BEP-20, Polygon, and TRC-20.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_CEILING, InvalidOperation
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.smm_setting import SmmSetting
from app.models.wallet_transaction import WalletTransaction
from app.utils.crypto_wallet import (
    derive_master_wallet_from_mnemonic,
    generate_master_crypto_wallet,
)
from app.utils.encryption import decrypt, encrypt

logger = logging.getLogger(__name__)
settings = get_settings()

# Supported USDT networks
SUPPORTED_USDT_NETWORKS = {"BEP20", "TRC20", "POLYGON"}

# Official USDT token contract addresses
BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"
BSC_USDT_DECIMALS = 18

POLYGON_USDT_CONTRACT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
POLYGON_USDT_DECIMALS = 6

TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
TRON_USDT_DECIMALS = 6

# keccak256("Transfer(address,address,uint256)")
ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# SmmSetting keys
SETTING_MNEMONIC_ENC = "crypto_master_mnemonic_enc"
SETTING_EVM_PRIV_ENC = "crypto_master_evm_priv_enc"
SETTING_TRON_PRIV_ENC = "crypto_master_tron_priv_enc"
SETTING_EVM_ADDRESS = "crypto_master_evm_address"
SETTING_TRON_ADDRESS = "crypto_master_tron_address"
SETTING_USDT_RATE_IDR = "usdt_rate_idr"

_http_client: httpx.AsyncClient | None = None


def get_usdt_http_client() -> httpx.AsyncClient:
    """Return shared httpx.AsyncClient for blockchain RPC queries."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http_client


async def close_usdt_http_client() -> None:
    """Close shared httpx.AsyncClient on shutdown."""
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


def normalize_usdt_network(method_or_network: str | None) -> str | None:
    """Normalize a payment method or network label into 'BEP20', 'TRC20', or 'POLYGON'."""
    if not method_or_network:
        return None
    cleaned = method_or_network.strip().upper()
    if cleaned in ("USDT_BEP20", "BEP20", "BSC", "USDT-BEP20"):
        return "BEP20"
    if cleaned in ("USDT_TRC20", "TRC20", "TRON", "USDT-TRC20"):
        return "TRC20"
    if cleaned in ("USDT_POLYGON", "POLYGON", "MATIC", "POS", "USDT-POLYGON"):
        return "POLYGON"
    return None


def is_usdt_payment_method(method: str | None) -> bool:
    """Return True if the payment method string represents a USDT network option."""
    return normalize_usdt_network(method) is not None


async def _upsert_setting(db: AsyncSession, key: str, value: str) -> None:
    res = await db.execute(select(SmmSetting).where(SmmSetting.key == key))
    row = res.scalar_one_or_none()
    if row is None:
        db.add(SmmSetting(key=key, value=value))
    else:
        row.value = value


async def ensure_master_crypto_wallet(db: AsyncSession) -> dict[str, Any]:
    """Ensure the master BIP-39 wallet and default USDT rate exist in `smm_settings`.

    Returns public wallet metadata:
        {
            "evm_address": "0x...",
            "tron_address": "T...",
            "usdt_rate_idr": 16000,
            "networks": ["USDT_BEP20", "USDT_TRC20", "USDT_POLYGON"],
        }
    """
    keys = [
        SETTING_MNEMONIC_ENC,
        SETTING_EVM_PRIV_ENC,
        SETTING_TRON_PRIV_ENC,
        SETTING_EVM_ADDRESS,
        SETTING_TRON_ADDRESS,
        SETTING_USDT_RATE_IDR,
    ]
    res = await db.execute(select(SmmSetting).where(SmmSetting.key.in_(keys)))
    rows = {r.key: r.value for r in res.scalars().all()}

    mnemonic_enc = rows.get(SETTING_MNEMONIC_ENC)
    evm_address = rows.get(SETTING_EVM_ADDRESS)
    tron_address = rows.get(SETTING_TRON_ADDRESS)

    if not mnemonic_enc or not evm_address or not tron_address:
        wallet = generate_master_crypto_wallet()
        evm_address = wallet["evm_address"]
        tron_address = wallet["tron_address"]

        await _upsert_setting(db, SETTING_MNEMONIC_ENC, encrypt(wallet["mnemonic"]))
        await _upsert_setting(db, SETTING_EVM_PRIV_ENC, encrypt(wallet["evm_private_key"]))
        await _upsert_setting(db, SETTING_TRON_PRIV_ENC, encrypt(wallet["tron_private_key"]))
        await _upsert_setting(db, SETTING_EVM_ADDRESS, evm_address)
        await _upsert_setting(db, SETTING_TRON_ADDRESS, tron_address)
        logger.info(
            "Initialized Master Crypto Wallet: EVM=%s, TRON=%s",
            evm_address,
            tron_address,
        )

    raw_rate = rows.get(SETTING_USDT_RATE_IDR)
    try:
        rate_idr = int(raw_rate) if raw_rate else int(settings.USDT_DEFAULT_RATE_IDR)
        if rate_idr <= 0:
            rate_idr = int(settings.USDT_DEFAULT_RATE_IDR)
    except (ValueError, TypeError):
        rate_idr = int(settings.USDT_DEFAULT_RATE_IDR)

    if not raw_rate:
        await _upsert_setting(db, SETTING_USDT_RATE_IDR, str(rate_idr))

    await db.flush()

    return {
        "evm_address": evm_address,
        "tron_address": tron_address,
        "usdt_rate_idr": rate_idr,
        "networks": ["USDT_BEP20", "USDT_TRC20", "USDT_POLYGON"],
    }


async def get_decrypted_master_crypto_secrets(db: AsyncSession) -> dict[str, str]:
    """Decrypt and return the Master Crypto Wallet mnemonic and private keys for Owner export."""
    await ensure_master_crypto_wallet(db)
    keys = [
        SETTING_MNEMONIC_ENC,
        SETTING_EVM_PRIV_ENC,
        SETTING_TRON_PRIV_ENC,
        SETTING_EVM_ADDRESS,
        SETTING_TRON_ADDRESS,
    ]
    res = await db.execute(select(SmmSetting).where(SmmSetting.key.in_(keys)))
    rows = {r.key: (r.value or "") for r in res.scalars().all()}

    mnemonic = decrypt(rows[SETTING_MNEMONIC_ENC])
    evm_priv = decrypt(rows[SETTING_EVM_PRIV_ENC])
    tron_priv = decrypt(rows[SETTING_TRON_PRIV_ENC])
    evm_address = rows.get(SETTING_EVM_ADDRESS) or ""
    tron_address = rows.get(SETTING_TRON_ADDRESS) or ""

    if not evm_address or not tron_address:
        derived = derive_master_wallet_from_mnemonic(mnemonic)
        evm_address = derived["evm_address"]
        tron_address = derived["tron_address"]

    return {
        "mnemonic": mnemonic,
        "evm_address": evm_address,
        "evm_private_key": evm_priv,
        "tron_address": tron_address,
        "tron_private_key": tron_priv,
        "derivation_paths": {
            "evm": "m/44'/60'/0'/0/0",
            "tron": "m/44'/195'/0'/0/0",
        },
    }


async def update_usdt_rate_idr(db: AsyncSession, new_rate: int) -> int:
    """Update the fixed IDR per 1 USDT exchange rate in `smm_settings`."""
    if new_rate < 1000 or new_rate > 1_000_000:
        raise ValueError("USDT exchange rate must be between Rp 1.000 and Rp 1.000.000")
    await _upsert_setting(db, SETTING_USDT_RATE_IDR, str(new_rate))
    await db.flush()
    return new_rate


async def create_usdt_invoice_data(
    db: AsyncSession,
    idr_amount: int,
    network_or_method: str,
) -> dict[str, Any]:
    """Allocate a unique 4-decimal USDT amount for a new pending invoice.

    Guarantees that no two active pending invoices on the same network share the
    same `crypto_amount`, enabling zero-touch automatic detection on-chain.
    """
    network = normalize_usdt_network(network_or_method)
    if not network:
        raise ValueError(f"Unsupported USDT network: {network_or_method}")

    wallet_info = await ensure_master_crypto_wallet(db)
    rate_idr = int(wallet_info["usdt_rate_idr"])
    rate_dec = Decimal(rate_idr)

    base_usdt = (Decimal(max(idr_amount, 1)) / rate_dec).quantize(
        Decimal("0.01"), rounding=ROUND_CEILING
    )
    if base_usdt < Decimal("0.01"):
        base_usdt = Decimal("0.01")

    now_utc = datetime.now(timezone.utc)
    active_res = await db.execute(
        select(WalletTransaction.crypto_amount).where(
            WalletTransaction.status == "pending",
            WalletTransaction.crypto_currency == "USDT",
            WalletTransaction.crypto_network == network,
            WalletTransaction.expired_at > now_utc,
            WalletTransaction.crypto_amount.is_not(None),
        )
    )
    used_amounts: set[str] = {
        str(val).strip() for val in active_res.scalars().all() if val is not None
    }

    chosen_amount: str | None = None
    for suffix in range(1, 10000):
        candidate = base_usdt + (Decimal(suffix) * Decimal("0.0001"))
        candidate_str = f"{candidate:.4f}"
        if candidate_str not in used_amounts:
            chosen_amount = candidate_str
            break

    if chosen_amount is None:
        raise RuntimeError(f"Unable to allocate unique USDT amount on {network}; too many concurrent pending invoices.")

    address = (
        wallet_info["tron_address"]
        if network == "TRC20"
        else wallet_info["evm_address"]
    )
    expired_at = now_utc + timedelta(minutes=60)
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={address}"

    return {
        "method": f"USDT_{network}",
        "crypto_currency": "USDT",
        "crypto_network": network,
        "crypto_amount": chosen_amount,
        "crypto_address": address,
        "exchange_rate": rate_idr,
        "expired_at": expired_at,
        "qris_url": qr_url,
    }


def _raw_units_to_4dec(raw_value: int, decimals: int) -> str | None:
    """Convert raw token integer units into a 4-decimal string if it has no dust beyond 4 decimals."""
    if raw_value <= 0:
        return None
    scale = Decimal(10) ** decimals
    exact = Decimal(raw_value) / scale
    quantized = exact.quantize(Decimal("0.0001"))
    if abs(exact - quantized) > Decimal("0.000001"):
        return None
    return f"{quantized:.4f}"


async def _fetch_evm_usdt_transfers(
    network: str,
    recipient_address: str,
) -> list[dict[str, Any]]:
    """Query BSC or Polygon JSON-RPC `eth_getLogs` for recent incoming USDT transfers."""
    if network == "BEP20":
        rpc_url = settings.BSC_RPC_URL
        contract = BSC_USDT_CONTRACT
        decimals = BSC_USDT_DECIMALS
    elif network == "POLYGON":
        rpc_url = settings.POLYGON_RPC_URL
        contract = POLYGON_USDT_CONTRACT
        decimals = POLYGON_USDT_DECIMALS
    else:
        return []

    clean_addr = recipient_address.lower().removeprefix("0x")
    if len(clean_addr) != 40:
        return []
    padded_recipient = "0x" + clean_addr.rjust(64, "0")

    client = get_usdt_http_client()
    try:
        blk_resp = await client.post(
            rpc_url,
            json={"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
        )
        blk_data = blk_resp.json()
        latest_block = int(blk_data["result"], 16)
    except Exception as exc:
        logger.warning("Failed to fetch latest block from %s (%s): %s", network, rpc_url, exc)
        return []

    # Try 1500 blocks (~45-75 mins), fallback to 500 blocks if public RPC limits range
    for block_span in (1500, 500):
        from_block = max(0, latest_block - block_span)
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "eth_getLogs",
            "params": [
                {
                    "fromBlock": hex(from_block),
                    "toBlock": "latest",
                    "address": contract,
                    "topics": [ERC20_TRANSFER_TOPIC, None, padded_recipient],
                }
            ],
        }
        try:
            resp = await client.post(rpc_url, json=payload)
            body = resp.json()
            if "error" in body and body["error"]:
                continue
            logs = body.get("result") or []
            transfers: list[dict[str, Any]] = []
            for log_entry in logs:
                tx_hash = log_entry.get("transactionHash")
                data_hex = log_entry.get("data") or "0x0"
                if not tx_hash:
                    continue
                try:
                    raw_val = int(data_hex, 16)
                except ValueError:
                    continue
                amount_4dec = _raw_units_to_4dec(raw_val, decimals)
                if amount_4dec:
                    transfers.append(
                        {
                            "tx_hash": tx_hash.lower(),
                            "amount_4dec": amount_4dec,
                            "network": network,
                        }
                    )
            return transfers
        except Exception as exc:
            logger.warning("Failed eth_getLogs on %s (span=%d): %s", network, block_span, exc)
    return []


async def _fetch_tron_usdt_transfers(
    recipient_address: str,
    min_timestamp_ms: int = 0,
) -> list[dict[str, Any]]:
    """Query TronGrid v1 API for confirmed incoming TRC-20 USDT transfers."""
    base_url = settings.TRONGRID_BASE_URL.rstrip("/")
    url = (
        f"{base_url}/v1/accounts/{recipient_address}/transactions/trc20"
        f"?only_confirmed=true&only_to=true&limit=50&contract_address={TRON_USDT_CONTRACT}"
    )
    headers: dict[str, str] = {"Accept": "application/json"}
    if settings.TRONGRID_API_KEY:
        headers["TRON-PRO-API-KEY"] = settings.TRONGRID_API_KEY

    client = get_usdt_http_client()
    try:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            logger.warning("TronGrid returned HTTP %s: %s", resp.status_code, resp.text[:200])
            return []
        body = resp.json()
        items = body.get("data") or []
        transfers: list[dict[str, Any]] = []
        for item in items:
            if item.get("to") != recipient_address:
                continue
            block_ts = int(item.get("block_timestamp") or 0)
            if min_timestamp_ms and block_ts < min_timestamp_ms:
                continue
            tx_hash = item.get("transaction_id")
            raw_str = item.get("value")
            if not tx_hash or not raw_str:
                continue
            try:
                raw_val = int(raw_str)
            except ValueError:
                continue
            amount_4dec = _raw_units_to_4dec(raw_val, TRON_USDT_DECIMALS)
            if amount_4dec:
                transfers.append(
                    {
                        "tx_hash": str(tx_hash),
                        "amount_4dec": amount_4dec,
                        "network": "TRC20",
                        "block_timestamp": block_ts,
                    }
                )
        return transfers
    except Exception as exc:
        logger.warning("Failed to query TronGrid TRC20 transfers: %s", exc)
        return []


async def check_usdt_transaction_status(
    db: AsyncSession,
    tx: WalletTransaction,
) -> dict[str, Any]:
    """Check whether a pending USDT `WalletTransaction` has been paid on-chain.

    Returns:
        {"status": "PAID", "tx_hash": "...", "crypto_amount": "..."}
        or {"status": "EXPIRED"}
        or {"status": "PENDING"}
    """
    if tx.status in ("approved", "completed"):
        return {"status": "PAID", "tx_hash": tx.tx_hash, "crypto_amount": tx.crypto_amount}

    if not tx.crypto_network or not tx.crypto_address or not tx.crypto_amount:
        return {"status": "PENDING"}

    network = tx.crypto_network.upper()
    try:
        target_dec = Decimal(tx.crypto_amount).quantize(Decimal("0.0001"))
    except (InvalidOperation, ValueError):
        return {"status": "PENDING"}

    created_ts_ms = (
        int(tx.created_at.timestamp() * 1000) - 60_000
        if tx.created_at
        else 0
    )

    if network in ("BEP20", "POLYGON"):
        transfers = await _fetch_evm_usdt_transfers(network, tx.crypto_address)
    elif network == "TRC20":
        transfers = await _fetch_tron_usdt_transfers(tx.crypto_address, min_timestamp_ms=created_ts_ms)
    else:
        transfers = []

    for tr in transfers:
        try:
            tr_dec = Decimal(tr["amount_4dec"]).quantize(Decimal("0.0001"))
        except (InvalidOperation, ValueError):
            continue
        if tr_dec != target_dec:
            continue

        candidate_hash = tr["tx_hash"]
        existing = await db.execute(
            select(WalletTransaction.id).where(WalletTransaction.tx_hash == candidate_hash)
        )
        if existing.scalar_one_or_none() is not None:
            continue

        return {
            "status": "PAID",
            "tx_hash": candidate_hash,
            "crypto_amount": f"{target_dec:.4f}",
        }

    now_utc = datetime.now(timezone.utc)
    if tx.expired_at and now_utc > tx.expired_at:
        return {"status": "EXPIRED"}

    return {"status": "PENDING"}


async def scan_pending_usdt_transactions(db: AsyncSession) -> int:
    """Batch-scan all active pending USDT transactions across networks and fulfill matches.

    Returns the number of transactions fulfilled in this cycle.
    """
    from app.services.wallet_service import fulfill_wallet_transaction

    now_utc = datetime.now(timezone.utc)
    res = await db.execute(
        select(WalletTransaction).where(
            WalletTransaction.status == "pending",
            WalletTransaction.crypto_currency == "USDT",
        )
    )
    pending_txs = list(res.scalars().all())
    if not pending_txs:
        return 0

    # Group by (network, address) to minimize RPC calls
    by_group: dict[tuple[str, str], list[WalletTransaction]] = {}
    for tx in pending_txs:
        if not tx.crypto_network or not tx.crypto_address or not tx.crypto_amount:
            continue
        key = (tx.crypto_network.upper(), tx.crypto_address)
        by_group.setdefault(key, []).append(tx)

    fulfilled_count = 0

    for (network, address), txs in by_group.items():
        if network in ("BEP20", "POLYGON"):
            transfers = await _fetch_evm_usdt_transfers(network, address)
        elif network == "TRC20":
            earliest_ms = min(
                (int(t.created_at.timestamp() * 1000) - 60_000 for t in txs if t.created_at),
                default=0,
            )
            transfers = await _fetch_tron_usdt_transfers(address, min_timestamp_ms=earliest_ms)
        else:
            transfers = []

        for tx in txs:
            # Lock the individual transaction row before mutating
            locked_res = await db.execute(
                select(WalletTransaction)
                .where(WalletTransaction.id == tx.id)
                .with_for_update()
            )
            locked_tx = locked_res.scalar_one_or_none()
            if not locked_tx or locked_tx.status != "pending":
                continue

            try:
                target_dec = Decimal(locked_tx.crypto_amount or "0").quantize(Decimal("0.0001"))
            except (InvalidOperation, ValueError):
                continue

            matched_hash: str | None = None
            for tr in transfers:
                try:
                    tr_dec = Decimal(tr["amount_4dec"]).quantize(Decimal("0.0001"))
                except (InvalidOperation, ValueError):
                    continue
                if tr_dec != target_dec:
                    continue

                candidate_hash = tr["tx_hash"]
                dup_res = await db.execute(
                    select(WalletTransaction.id).where(WalletTransaction.tx_hash == candidate_hash)
                )
                if dup_res.scalar_one_or_none() is None:
                    matched_hash = candidate_hash
                    break

            if matched_hash:
                from app.models.user import User

                user_res = await db.execute(
                    select(User).where(User.id == locked_tx.user_id).with_for_update()
                )
                user = user_res.scalar_one_or_none()
                if not user:
                    continue
                locked_tx.tx_hash = matched_hash
                total_paid = locked_tx.total_amount or locked_tx.amount
                await fulfill_wallet_transaction(db, locked_tx, user, total_paid, now_utc)
                locked_tx.admin_note = (
                    f"Auto-approved via USDT {network} ({locked_tx.crypto_amount} USDT, tx: {matched_hash[:18]}...)"
                )
                await db.commit()
                fulfilled_count += 1
                logger.info(
                    "Auto-fulfilled USDT %s transaction %s (amount=%s USDT, tx_hash=%s)",
                    network,
                    locked_tx.id,
                    locked_tx.crypto_amount,
                    matched_hash,
                )
            elif locked_tx.expired_at and now_utc > locked_tx.expired_at:
                locked_tx.status = "rejected"
                locked_tx.processed_at = now_utc
                locked_tx.admin_note = f"Auto-expired on-chain USDT ({network}) invoice"
                await db.commit()

    return fulfilled_count
