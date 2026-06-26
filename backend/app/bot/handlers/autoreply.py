"""Telegram Bot handlers for managing auto-reply settings."""

import uuid
import logging
from telethon import events
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.bot.keyboards import autoreply_menu_keyboard
from app.bot.utils import (
    auth_required,
    decode_param,
    format_autoreply_list_message
)

logger = logging.getLogger(__name__)


def register_autoreply_handlers(client):
    """Register auto-reply management handlers to the Telethon client."""

    async def get_user_accounts(user_id):
        """Helper to fetch all accounts belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.user_id == user_id)
                .options(selectinload(TelegramAccount.folders))
                .order_by(TelegramAccount.created_at.desc())
            )
            return result.scalars().all()

    # ── ReplyKeyboard Handler ──
    @client.on(events.NewMessage(pattern='🤖 Auto-Reply'))
    @auth_required
    async def autoreply_menu_handler(event):
        accounts = await get_user_accounts(event.user.id)
        if not accounts:
            await event.respond(
                "🤖 **Auto-Reply Settings**\n\n"
                "Belum ada akun Telegram terdaftar. Silakan login akun baru lewat website TeleBos."
            )
            return

        page = 1
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        paginated_accounts = accounts[(page - 1) * limit : page * limit]

        keyboard = autoreply_menu_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_autoreply_list_message(paginated_accounts, page, total_pages)
        await event.respond(msg_text, buttons=keyboard)

    # ── Callback Handlers ──

    @client.on(events.CallbackQuery(pattern=r'auto_reply_page:(\d+)'))
    @auth_required
    async def auto_reply_page_handler(event):
        page = int(decode_param(event.pattern_match.group(1)))
        accounts = await get_user_accounts(event.user.id)
        if not accounts:
            await event.edit("Belum ada akun Telegram terdaftar.")
            return

        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        keyboard = autoreply_menu_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_autoreply_list_message(paginated_accounts, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'auto_reply_refresh(?::(\d+))?'))
    @auth_required
    async def auto_reply_refresh_handler(event):
        match = event.pattern_match.group(1)
        page = int(decode_param(match)) if match is not None else 1
        accounts = await get_user_accounts(event.user.id)
        if not accounts:
            await event.edit("Belum ada akun Telegram terdaftar.")
            return

        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        keyboard = autoreply_menu_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_autoreply_list_message(paginated_accounts, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'auto_reply_toggle:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def auto_reply_toggle_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
        try:
            acc_uuid = uuid.UUID(account_id)
        except ValueError:
            await event.answer("ID Akun tidak valid.", alert=True)
            return

        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.id == acc_uuid)
                .where(TelegramAccount.user_id == event.user.id)
            )
            db_acc = result.scalar_one_or_none()
            
            if not db_acc:
                await event.answer("Akun tidak ditemukan.", alert=True)
                return

            # Toggle status
            new_status = not db_acc.auto_reply_enabled
            db_acc.auto_reply_enabled = new_status
            await session.commit()

        await event.answer(
            f"Auto-Reply untuk {'@' + db_acc.username if db_acc.username else db_acc.phone} "
            f"berhasil {'diaktifkan' if new_status else 'dinonaktifkan'}."
        )

        # Redraw lists
        accounts = await get_user_accounts(event.user.id)
        if not accounts:
            await event.edit("Belum ada akun Telegram terdaftar.")
            return

        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        keyboard = autoreply_menu_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_autoreply_list_message(paginated_accounts, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

