"""Telegram Bot handlers for managing auto-reply settings."""

import uuid
import logging
from telethon import events
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from sqlalchemy.future import select
from app.bot.keyboards import autoreply_menu_keyboard
from app.bot.utils import auth_required

logger = logging.getLogger(__name__)


def register_autoreply_handlers(client):
    """Register auto-reply management handlers to the Telethon client."""

    async def get_user_accounts(user_id):
        """Helper to fetch all accounts belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.user_id == user_id)
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

        keyboard = autoreply_menu_keyboard(accounts)
        await event.respond(
            "🤖 **Pengaturan Auto-Reply Akun**\n"
            "Klik salah satu akun di bawah untuk mengaktifkan atau menonaktifkan fitur Auto-Reply:\n\n"
            "__Catatan: Template Auto-Reply default dapat disesuaikan melalui website TeleBos.__",
            buttons=keyboard
        )

    # ── Callback Handlers ──

    @client.on(events.CallbackQuery(pattern=b'auto_reply_refresh'))
    @auth_required
    async def auto_reply_refresh_handler(event):
        accounts = await get_user_accounts(event.user.id)
        keyboard = autoreply_menu_keyboard(accounts)
        try:
            await event.edit(
                "🤖 **Pengaturan Auto-Reply Akun** (Dinkini)\n"
                "Klik salah satu akun di bawah untuk mengaktifkan atau menonaktifkan fitur Auto-Reply:\n\n"
                "__Catatan: Template Auto-Reply default dapat disesuaikan melalui website TeleBos.__",
                buttons=keyboard
            )
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'auto_reply_toggle:(.+)'))
    @auth_required
    async def auto_reply_toggle_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        
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
        keyboard = autoreply_menu_keyboard(accounts)
        await event.edit(
            "🤖 **Pengaturan Auto-Reply Akun**\n"
            "Klik salah satu akun di bawah untuk mengaktifkan atau menonaktifkan fitur Auto-Reply:\n\n"
            "__Catatan: Template Auto-Reply default dapat disesuaikan melalui website TeleBos.__",
            buttons=keyboard
        )
