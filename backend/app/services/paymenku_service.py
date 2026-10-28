"""Paymenku Payment Gateway service client.

Official documentation: https://docs.paymenku.com/docs/api
Base URL: https://paymenku.com/api/v1
"""

import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_paymenku_client: httpx.AsyncClient | None = None


def get_paymenku_http_client() -> httpx.AsyncClient:
    """Return a shared singleton httpx.AsyncClient with connection pooling."""
    global _paymenku_client
    if _paymenku_client is None or _paymenku_client.is_closed:
        _paymenku_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
                keepalive_expiry=30.0,
            ),
        )
    return _paymenku_client


async def close_paymenku_http_client() -> None:
    """Close the shared Paymenku httpx client upon application shutdown."""
    global _paymenku_client
    if _paymenku_client is not None and not _paymenku_client.is_closed:
        await _paymenku_client.aclose()
        _paymenku_client = None


def is_paymenku_configured() -> bool:
    """Check if Paymenku API Key is configured."""
    settings = get_settings()
    return bool(settings.PAYMENKU_API_KEY and settings.PAYMENKU_API_KEY.strip())


async def create_paymenku_transaction(
    order_id: str | None = None,
    amount: int = 0,
    keterangan: str = "Top Up Saldo TeleBos",
    customer_name: str = "Pelanggan TeleBos",
    customer_email: str = "user@telebos.app",
    return_url: str | None = None,
    channel_code: str | None = None,
    reference_id: str | None = None,
) -> dict[str, Any]:
    """Create a new dynamic QRIS invoice via Paymenku API.

    POST https://paymenku.com/api/v1/transaction/create
    Headers:
      Authorization: Bearer <PAYMENKU_API_KEY>
      Content-Type: application/json
    """
    order_id = order_id or reference_id or ""
    settings = get_settings()
    if not is_paymenku_configured():
        raise ValueError("Paymenku API Key is not configured")

    client = get_paymenku_http_client()
    base_url = (settings.PAYMENKU_BASE_URL or "https://paymenku.com/api/v1").rstrip("/")
    url = f"{base_url}/transaction/create"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.PAYMENKU_API_KEY.strip()}",
    }

    resolved_return_url = (
        return_url
        or f"{settings.NEXT_PUBLIC_URL.rstrip('/')}/wallet/invoice/{order_id}"
    )
    resolved_channel = channel_code or settings.PAYMENKU_CHANNEL_CODE or "qris"

    payload: dict[str, Any] = {
        "channel_code": resolved_channel,
        "amount": int(amount),
        "reference_id": order_id,
        "customer_name": (customer_name or "Pelanggan TeleBos")[:100],
        "customer_email": customer_email or "user@telebos.app",
        "return_url": resolved_return_url,
        "order_items": [
            {
                "name": (keterangan or "Top Up Saldo TeleBos")[:100],
                "quantity": 1,
            }
        ],
    }

    logger.info(
        "Calling Paymenku create transaction for reference_id=%s, amount=%d, channel=%s",
        order_id,
        amount,
        resolved_channel,
    )

    try:
        response = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("Paymenku HTTP request failed for order %s: %s", order_id, exc)
        raise RuntimeError(
            f"Paymenku error: Gagal menghubungi server pembayaran ({type(exc).__name__})"
        ) from exc

    try:
        resp_data = response.json() if response.content else {}
    except ValueError:
        resp_data = {}

    is_ok = (
        response.status_code in (200, 201)
        and isinstance(resp_data, dict)
        and str(resp_data.get("status", "")).lower() in ("success", "true", "ok")
    )
    if not is_ok:
        msg = None
        if isinstance(resp_data, dict):
            msg = resp_data.get("message") or resp_data.get("error")
        err_msg = msg or f"HTTP {response.status_code} (gateway tidak mengembalikan respons JSON valid)"
        logger.warning("Paymenku create transaction failed: %s", err_msg)
        raise RuntimeError(f"Paymenku error: {err_msg}")

    raw_data = resp_data.get("data") or {}
    payment_info = raw_data.get("payment_info") or {}

    trx_id = raw_data.get("trx_id") or payment_info.get("transaction_id")
    raw_amount = raw_data.get("amount") or amount
    try:
        total_amount = int(round(float(raw_amount)))
    except (ValueError, TypeError):
        total_amount = int(amount)

    qr_string = payment_info.get("qr_string")
    qr_url = payment_info.get("qr_url") or raw_data.get("pay_url")
    expiration_date = payment_info.get("expiration_date")

    return {
        "trx_id": trx_id,
        "order_id": raw_data.get("reference_id") or order_id,
        "reference_id": raw_data.get("reference_id") or order_id,
        "amount": int(amount),
        "total_amount": total_amount,
        "status": raw_data.get("status", "pending"),
        "pay_url": raw_data.get("pay_url"),
        "qr_string": qr_string,
        # Populate qris_url and qris_image for seamless compatibility with existing invoice pipeline
        "qris_url": qr_string or qr_url,
        "qris_image": qr_url,
        "expired_at": expiration_date,
        "signature": trx_id,
        "payment_info": payment_info,
    }


async def check_paymenku_status(order_id: str) -> dict[str, Any] | None:
    """Check transaction status directly from Paymenku API.

    GET https://paymenku.com/api/v1/check-status/{order_id}
    Accepts either Paymenku `trx_id` or merchant `reference_id`.
    """
    if not is_paymenku_configured():
        return None

    settings = get_settings()
    client = get_paymenku_http_client()
    base_url = (settings.PAYMENKU_BASE_URL or "https://paymenku.com/api/v1").rstrip("/")
    url = f"{base_url}/check-status/{order_id}"

    headers = {
        "Authorization": f"Bearer {settings.PAYMENKU_API_KEY.strip()}",
        "Accept": "application/json",
    }

    try:
        response = await client.get(url, headers=headers)
        if response.status_code == 404:
            logger.warning("Paymenku status check 404 for order_id=%s", order_id)
            return None

        try:
            resp_data = response.json() if response.content else {}
        except ValueError:
            resp_data = {}

        if (
            response.is_success
            and isinstance(resp_data, dict)
            and str(resp_data.get("status", "")).lower() in ("success", "true", "ok")
        ):
            data = resp_data.get("data") or {}
            raw_status = str(data.get("status", "")).lower()
            is_sandbox = bool(data.get("is_sandbox", False))

            # Protect live environment against sandbox transactions unless explicitly allowed
            if is_sandbox and not settings.PAYMENKU_ALLOW_SANDBOX:
                api_key = (settings.PAYMENKU_API_KEY or "").strip()
                if not api_key.startswith("sk_test_"):
                    logger.warning(
                        "Paymenku status check returned is_sandbox=True under live mode for order_id=%s; ignoring paid status",
                        order_id,
                    )
                    return {"status": "PENDING", "is_sandbox": True}

            normalized_status = raw_status.upper()
            if raw_status in ("paid", "success", "settled", "completed"):
                normalized_status = "PAID"
            elif raw_status in ("expired", "cancelled", "canceled", "failed"):
                normalized_status = "EXPIRED"

            try:
                total_amount = int(round(float(data.get("amount") or 0)))
            except (ValueError, TypeError):
                total_amount = 0

            return {
                "order_id": data.get("reference_id") or order_id,
                "trx_id": data.get("trx_id"),
                "status": normalized_status,
                "total_amount": total_amount,
                "is_sandbox": is_sandbox,
                "raw": data,
            }
        return None
    except Exception as exc:
        logger.warning("Error checking Paymenku status for order_id=%s: %s", order_id, exc)
        return None


def verify_paymenku_webhook_signature(
    raw_body: bytes | str,
    incoming_signature: str | None,
    timestamp: str | None,
    webhook_secret: str | None = None,
) -> bool:
    """Validate Paymenku webhook HMAC-SHA256 signature.

    Per official docs (https://docs.paymenku.com/docs/webhook):
      X-PaymenKu-Signature = HMAC-SHA256(timestamp + "." + raw_body, webhook_secret) in hex
    """
    settings = get_settings()
    secret = (webhook_secret if webhook_secret is not None else settings.PAYMENKU_WEBHOOK_SECRET) or ""
    secret = secret.strip()
    if not secret or not timestamp or not incoming_signature:
        return False

    body_bytes = raw_body.encode("utf-8") if isinstance(raw_body, str) else raw_body
    signed_payload = timestamp.strip().encode("utf-8") + b"." + body_bytes
    expected_sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig.lower(), incoming_signature.strip().lower())
