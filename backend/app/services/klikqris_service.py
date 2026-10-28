"""KlikQRIS Payment Gateway service client.

Official documentation: https://klikqris.com/dokumentasi-api
"""

import hmac
import logging
from typing import Any

import httpx

from app.config import get_settings
from app.services.paymenku_service import (
    check_paymenku_status,
    close_paymenku_http_client,
    create_paymenku_transaction,
    is_paymenku_configured,
)

logger = logging.getLogger(__name__)
settings = get_settings()

_klikqris_client: httpx.AsyncClient | None = None


def get_klikqris_http_client() -> httpx.AsyncClient:
    """Return a shared singleton httpx.AsyncClient with connection pooling."""
    global _klikqris_client
    if _klikqris_client is None or _klikqris_client.is_closed:
        _klikqris_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
                keepalive_expiry=30.0,
            ),
        )
    return _klikqris_client


async def close_klikqris_http_client() -> None:
    """Close the shared KlikQRIS/Paymenku httpx client upon application shutdown."""
    global _klikqris_client
    if _klikqris_client is not None and not _klikqris_client.is_closed:
        await _klikqris_client.aclose()
        _klikqris_client = None
    await close_paymenku_http_client()


def is_klikqris_configured() -> bool:
    """Check if Paymenku (primary) or legacy KlikQRIS credentials are configured."""
    if is_paymenku_configured():
        return True
    settings = get_settings()
    return bool(settings.KLIKQRIS_API_KEY and settings.KLIKQRIS_ID_MERCHANT)


async def create_qris_transaction(
    order_id: str,
    amount: int,
    keterangan: str = "Top Up Saldo TeleBos",
    callback_url: str | None = None,
) -> dict[str, Any]:
    """Create a new dynamic QRIS invoice via KlikQRIS API.

    POST https://klikqris.com/api/qris/create
    Headers:
      x-api-key: <KLIKQRIS_API_KEY>
      id_merchant: <KLIKQRIS_ID_MERCHANT>
    """
    settings = get_settings()
    if is_paymenku_configured():
        return await create_paymenku_transaction(
            reference_id=order_id,
            amount=amount,
            keterangan=keterangan,
            return_url=callback_url,
        )
    if not is_klikqris_configured():
        raise ValueError("Paymenku / KlikQRIS API Key is not configured")

    client = get_klikqris_http_client()
    url = f"{settings.KLIKQRIS_BASE_URL.rstrip('/')}/qris/create"

    headers = {
        "Content-Type": "application/json",
        "x-api-key": settings.KLIKQRIS_API_KEY,
        "id_merchant": settings.KLIKQRIS_ID_MERCHANT,
    }

    payload: dict[str, Any] = {
        "order_id": order_id,
        "id_merchant": settings.KLIKQRIS_ID_MERCHANT,
        "amount": amount,
        "keterangan": keterangan,
    }
    if callback_url:
        payload["callback_url"] = callback_url

    logger.info("Calling KlikQRIS create transaction for order_id=%s, amount=%d", order_id, amount)

    try:
        response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("KlikQRIS HTTP request failed for order %s: %s", order_id, exc)
        raise RuntimeError(f"KlikQRIS error: Gagal menghubungi server pembayaran ({type(exc).__name__})") from exc

    try:
        resp_data = response.json() if response.content else {}
    except ValueError:
        resp_data = {}

    if response.status_code not in (200, 201) or not isinstance(resp_data, dict) or not resp_data.get("status"):
        msg = resp_data.get("message") if isinstance(resp_data, dict) else None
        err_msg = msg or f"HTTP {response.status_code} (gateway tidak mengembalikan respons JSON valid)"
        logger.warning("KlikQRIS create transaction failed: %s", err_msg)
        raise RuntimeError(f"KlikQRIS error: {err_msg}")

    return resp_data.get("data", {})


async def check_qris_status(order_id: str) -> dict[str, Any] | None:
    """Check transaction status directly from KlikQRIS API.

    GET https://klikqris.com/api/qris/status/{order_id}
    Headers:
      x-api-key: <KLIKQRIS_API_KEY>
      id_merchant: <KLIKQRIS_ID_MERCHANT>
    """
    if is_paymenku_configured():
        return await check_paymenku_status(order_id)
    if not is_klikqris_configured():
        return None

    settings = get_settings()
    client = get_klikqris_http_client()
    url = f"{settings.KLIKQRIS_BASE_URL.rstrip('/')}/qris/status/{order_id}"

    headers = {
        "x-api-key": settings.KLIKQRIS_API_KEY,
        "id_merchant": settings.KLIKQRIS_ID_MERCHANT,
    }

    try:
        response = await client.get(url, headers=headers)
        if response.status_code == 404:
            logger.warning("KlikQRIS status check 404 for order_id=%s", order_id)
            return None

        try:
            resp_data = response.json() if response.content else {}
        except ValueError:
            resp_data = {}
        if response.is_success and isinstance(resp_data, dict) and resp_data.get("status"):
            return resp_data.get("data")
        return None
    except Exception as e:
        logger.warning("Error checking KlikQRIS status for order_id=%s: %s", order_id, e)
        return None


def verify_signature(stored_signature: str | None, incoming_signature: str | None) -> bool:
    """Validate webhook callback signature against stored creation signature."""
    if not stored_signature or not incoming_signature:
        return False
    return hmac.compare_digest(stored_signature.strip(), incoming_signature.strip())
