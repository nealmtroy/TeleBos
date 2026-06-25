"""Telegram Bot handlers for managing Telegram accounts."""

import uuid
import logging
from telethon import events
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.account_service import check_spam_status, remove_account
from sqlalchemy.future import select
from app.bot.keyboards import (
    accounts_list_keyboard,
    account_detail_keyboard,
    account_delete_confirm_keyboard
)
from app.bot.utils import auth_required, format_account_detail

logger = logging.getLogger(__name__)


def register_accounts_handlers(client):
    """Register account management handlers to the Telethon client."""

    async def get_user_accounts(user_id):
        """Helper to fetch all accounts belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.user_id == user_id)
                .order_by(TelegramAccount.created_at.desc())
            )
            return result.scalars().all()

    async def get_account_by_id(account_id, user_id):
        """Helper to fetch a specific account by ID and ensure it belongs to the user."""
        try:
            acc_uuid = uuid.UUID(account_id)
        except ValueError:
            return None

        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.id == acc_uuid)
                .where(TelegramAccount.user_id == user_id)
            )
            return result.scalar_one_or_none()

    # ── ReplyKeyboard Handler ──
    @client.on(events.NewMessage(pattern='👥 Accounts'))
    @auth_required
    async def accounts_menu_handler(event):
        accounts = await get_user_accounts(event.user.id)
        if not accounts:
            await event.respond(
                "👥 **Daftar Akun Telegram**\n\n"
                "Belum ada akun Telegram terdaftar. Silakan login akun Telegram baru lewat website TeleBos."
            )
            return

        keyboard = accounts_list_keyboard(accounts)
        await event.respond(
            "👥 **Daftar Akun Telegram Anda**\n"
            "Pilih salah satu akun di bawah untuk melihat detail atau mengelola:",
            buttons=keyboard
        )

    # ── Callback Handlers ──

    @client.on(events.CallbackQuery(pattern=b'acc_list_back'))
    @auth_required
    async def acc_list_back_handler(event):
        accounts = await get_user_accounts(event.user.id)
        keyboard = accounts_list_keyboard(accounts)
        await event.edit(
            "👥 **Daftar Akun Telegram Anda**\n"
            "Pilih salah satu akun di bawah untuk melihat detail atau mengelola:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=b'acc_refresh'))
    @auth_required
    async def acc_refresh_handler(event):
        accounts = await get_user_accounts(event.user.id)
        keyboard = accounts_list_keyboard(accounts)
        try:
            await event.edit(
                "👥 **Daftar Akun Telegram Anda** (Dinkini)\n"
                "Pilih salah satu akun di bawah untuk melihat detail atau mengelola:",
                buttons=keyboard
            )
        except Exception:
            # Edit throws error if content is exactly the same, which is fine
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'acc_detail:(.+)'))
    @auth_required
    async def acc_detail_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        detail_text = format_account_detail(acc)
        keyboard = account_detail_keyboard(acc.id, acc.is_active)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_toggle:(.+)'))
    @auth_required
    async def acc_toggle_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        # Toggle active status
        new_status = not acc.is_active
        async with async_session_factory() as session:
            # Re-fetch in a transaction session to modify
            result = await session.execute(
                select(TelegramAccount).where(TelegramAccount.id == acc.id)
            )
            db_acc = result.scalar_one()
            db_acc.is_active = new_status
            await session.commit()
            
            # Update local ref for UI
            acc.is_active = new_status

        await event.answer(f"Status akun berhasil diubah menjadi {'Aktif' if new_status else 'Nonaktif'}.")
        
        # Redraw detail
        detail_text = format_account_detail(acc)
        keyboard = account_detail_keyboard(acc.id, acc.is_active)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_spam:(.+)'))
    @auth_required
    async def acc_spam_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        await event.answer("Memulai pengecekan spam via @SpamBot...", alert=False)
        
        # Temporary loading text
        await event.edit(
            f"⏳ **Sedang memeriksa status spam untuk `{acc.phone}`...**\n"
            f"Proses ini mengirim pesan ke @SpamBot dan menunggu responnya. Harap tunggu beberapa detik."
        )

        async with async_session_factory() as session:
            # Fetch inside transaction session
            result = await session.execute(
                select(TelegramAccount).where(TelegramAccount.id == acc.id)
            )
            db_acc = result.scalar_one()
            
            try:
                # Perform the spam check using Telethon client pool inside account_service
                db_acc = await check_spam_status(session, db_acc)
                await session.commit()
                # Update local ref for UI
                acc.spam_status = db_acc.spam_status
                acc.spam_detail = db_acc.spam_detail
                acc.spam_last_checked_at = db_acc.spam_last_checked_at
                await event.answer("Pengecekan spam selesai!")
            except Exception as e:
                logger.error("Spam check failed inside bot handler: %s", e)
                await event.answer(f"Gagal melakukan pengecekan: {str(e)}", alert=True)

        # Redraw detail
        detail_text = format_account_detail(acc)
        keyboard = account_detail_keyboard(acc.id, acc.is_active)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_delete_confirm:(.+)'))
    @auth_required
    async def acc_delete_confirm_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        keyboard = account_delete_confirm_keyboard(acc.id)
        await event.edit(
            f"⚠️ **Peringatan Penghapusan Akun!**\n\n"
            f"Apakah Anda yakin ingin menghapus akun Telegram `{acc.phone}`?\n"
            f"Tindakan ini tidak dapat dibatalkan dan semua data broadcast yang terkait akan hilang.",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'acc_delete_yes:(.+)'))
    @auth_required
    async def acc_delete_yes_handler(event):
        account_id = event.pattern_match.group(1).decode('utf-8')
        
        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.id == uuid.UUID(account_id))
                .where(TelegramAccount.user_id == event.user.id)
            )
            db_acc = result.scalar_one_or_none()
            
            if not db_acc:
                await event.answer("Akun tidak ditemukan.", alert=True)
                return

            try:
                # Call remove_account from account_service which detaches event relay, cleans files etc.
                await remove_account(session, db_acc)
                await session.commit()
                await event.answer("Akun berhasil dihapus dari TeleBos.", alert=True)
            except Exception as e:
                logger.error("Failed to delete account inside bot handler: %s", e)
                await event.answer(f"Gagal menghapus: {str(e)}", alert=True)

        # Go back to account list
        accounts = await get_user_accounts(event.user.id)
        keyboard = accounts_list_keyboard(accounts)
        await event.edit(
            "👥 **Daftar Akun Telegram Anda**\n"
            "Pilih salah satu akun di bawah untuk melihat detail atau mengelola:",
            buttons=keyboard
        )
