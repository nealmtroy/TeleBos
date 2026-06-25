"""Main entry point for the standalone TeleBos Telegram Bot service."""

import logging
import asyncio
from telethon import TelegramClient
from app.config import get_settings
from app.bot.handlers.base import register_base_handlers
from app.bot.handlers.accounts import register_accounts_handlers
from app.bot.handlers.broadcasts import register_broadcasts_handlers
from app.bot.handlers.autoreply import register_autoreply_handlers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("telebos_bot")

# Suppress verbose Telethon logs
logging.getLogger("telethon").setLevel(logging.WARNING)


async def main():
    settings = get_settings()
    
    # Validation check
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set in environment! Exiting.")
        return
        
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        logger.error("TELEGRAM_API_ID or TELEGRAM_API_HASH is not set! Exiting.")
        return

    logger.info("Initializing Telegram Bot client...")
    
    # Initialize the Telethon client in Bot Mode
    # Uses api_id and api_hash from configuration, with session name "telebos_bot_session"
    client = TelegramClient(
        "telebos_bot_session",
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH
    )

    logger.info("Registering event handlers...")
    register_base_handlers(client)
    register_accounts_handlers(client)
    register_broadcasts_handlers(client)
    register_autoreply_handlers(client)

    # Connect to Redis
    from app.core.redis import redis_client
    await redis_client.connect()

    try:
        logger.info("Starting Telegram Bot (Polling)...")
        await client.start(bot_token=settings.TELEGRAM_BOT_TOKEN)
        
        bot_me = await client.get_me()
        logger.info("🤖 Bot @%s is online and ready!", bot_me.username)
        
        # Block and run until disconnected
        await client.run_until_disconnected()
    finally:
        await redis_client.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user.")
    except Exception as e:
        logger.exception("Bot crashed with unexpected error: %s", e)
