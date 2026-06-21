"""SMM Panel service for Buzzerpanel.id integration."""

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def call_smm_api(action: str, extra_params: dict | None = None) -> dict[str, Any]:
    """Make a request to the Buzzerpanel API.

    Args:
        action: API action (services, order, status, profile, etc.)
        extra_params: Additional parameters for the specific action.

    Returns:
        Parsed JSON response from the API.
    """
    params: dict[str, Any] = {
        "api_key": settings.SMM_API_KEY,
        "secret_key": settings.SMM_SECRET_KEY,
        "action": action,
    }
    if extra_params:
        params.update(extra_params)

    logger.info("SMM API call: action=%s params=%s", action, {k: v for k, v in params.items() if k not in ("api_key", "secret_key")})

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(settings.SMM_API_URL, json=params)
            response.raise_for_status()
            data = response.json()
            logger.info("SMM API response for action=%s: %s", action, data)
            return data
        except httpx.HTTPError as e:
            logger.error("SMM API HTTP error for action=%s: %s", action, e)
            return {"status": False, "data": {"msg": f"API request failed: {str(e)}"}}


async def get_services() -> list[dict[str, Any]]:
    """Fetch all services from SMM panel and return them."""
    result = await call_smm_api("services2")  # services2 includes speed column
    if result.get("status") and isinstance(result.get("data"), list):
        return result["data"]
    logger.warning("Failed to fetch services: %s", result.get("data", {}).get("msg", "Unknown error"))
    return []


async def get_telegram_services() -> list[dict[str, Any]]:
    """Filter services to only Telegram and Telegram Reactions categories."""
    all_services = await get_services()
    telegram_services = [
        s for s in all_services
        if s.get("category", "").lower().startswith("telegram")
    ]
    return telegram_services


async def create_order(
    service_id: int,
    data_target: str,
    quantity: int,
    comments: str | None = None,
    usernames: str | None = None,
) -> dict[str, Any]:
    """Place an order on the SMM panel.

    Returns:
        API response with order ID if successful.
    """
    params: dict[str, Any] = {
        "service": service_id,
        "data": data_target,
        "quantity": quantity,
    }
    if comments:
        params["komen"] = comments
    if usernames:
        params["usernames"] = usernames

    return await call_smm_api("order", params)


async def check_order_status(order_id: str) -> dict[str, Any]:
    """Check the status of an order on the SMM panel.

    Args:
        order_id: The SMM panel's order ID string.

    Returns:
        API response with status, start_count, remains.
    """
    return await call_smm_api("status", {"id": order_id})


async def bulk_check_status(order_ids: list[str]) -> list[dict[str, Any]]:
    """Check status of multiple orders.

    Args:
        order_ids: List of SMM panel order IDs.

    Returns:
        List of status responses.
    """
    results = []
    for oid in order_ids:
        result = await check_order_status(oid)
        results.append(result)
    return results


async def get_profile() -> dict[str, Any]:
    """Fetch SMM panel profile and balance."""
    return await call_smm_api("profile")
