"""Telegram Bot handlers for managing Telegram accounts."""

import uuid
import logging
from telethon import events, Button
from app.database import async_session_factory
from app.models.telegram_account import TelegramAccount
from app.services.account_service import check_spam_status, remove_account
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.bot.keyboards import (
    accounts_list_keyboard,
    account_detail_keyboard,
    account_delete_confirm_keyboard,
    account_otp_keyboard
)
from app.bot.utils import (
    auth_required,
    format_account_detail,
    format_accounts_list_message,
    decode_param
)

logger = logging.getLogger(__name__)


def register_accounts_handlers(client):
    """Register account management handlers to the Telethon client."""

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

        page = 1
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        paginated_accounts = accounts[(page - 1) * limit : page * limit]

        keyboard = accounts_list_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_accounts_list_message(paginated_accounts, page, total_pages)
        await event.respond(msg_text, buttons=keyboard)

    # ── Callback Handlers ──

    @client.on(events.CallbackQuery(pattern=r'acc_list_page:(\d+)'))
    @auth_required
    async def acc_list_page_handler(event):
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
        keyboard = accounts_list_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_accounts_list_message(paginated_accounts, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_list_back(?::(\d+))?'))
    @auth_required
    async def acc_list_back_handler(event):
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
        keyboard = accounts_list_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_accounts_list_message(paginated_accounts, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_refresh(?::(\d+))?'))
    @auth_required
    async def acc_refresh_handler(event):
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
        keyboard = accounts_list_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_accounts_list_message(paginated_accounts, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'acc_detail:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_detail_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
        acc = await get_account_by_id(account_id, event.user.id)
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        detail_text = format_account_detail(acc)
        keyboard = account_detail_keyboard(acc.id, acc.is_active, page)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_otp:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_otp_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
        acc = await get_account_by_id(account_id, event.user.id)
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        # Show temporary message (loading)
        await event.edit(
            f"⏳ **Sedang mencari OTP untuk `{acc.phone}`...**\n"
            f"Harap tunggu beberapa detik."
        )

        from app.services.telegram_client import client_pool
        from app.utils.encryption import decrypt
        import re
        from datetime import datetime, timezone

        try:
            session_str = decrypt(acc.session_string)
            acc_client = await client_pool.get(str(acc.id), session_str)
            if not acc_client:
                # Client is not active/expired
                keyboard = account_otp_keyboard(acc.id, page)
                await event.edit(
                    f"❌ **Gagal mengambil OTP**\n\n"
                    f"Sesi akun `{acc.phone}` tidak aktif atau kedaluwarsa. Silakan periksa status akun Anda.",
                    buttons=keyboard
                )
                return

            # Fetch last messages from user 777000 (Telegram official)
            otp_code = None
            messages = await acc_client.get_messages(777000, limit=5)
            now = datetime.now(timezone.utc)
            for msg in messages:
                if msg and msg.text:
                    # check if the message is recent (e.g. less than 10 minutes old)
                    msg_date = msg.date
                    if (now - msg_date).total_seconds() < 600:  # 10 minutes
                        # match a 5 digit number
                        match = re.search(r'\b\d{5}\b', msg.text)
                        if match:
                            otp_code = match.group(0)
                            break

            if otp_code:
                # OTP Found
                acc_name = f"@{acc.username}" if acc.username else acc.first_name or acc.phone
                telegram_id = acc.telegram_id or "-"
                msg_text = (
                    f"⏱️ **OTP Ditemukan!**\n"
                    f"Kode OTP kamu adalah: ||{otp_code}||\n\n"
                    f"Silakan masukkan kode ini untuk login ke akun {acc_name} (ID: `{telegram_id}`)\n\n"
                    f"⏳Segera lakukan login sebelum waktu otp berakhir!!"
                )
            else:
                # OTP Not Found
                msg_text = (
                    f"**❌ Belum ada OTP masuk**\n\n"
                    f"Silakan tunggu beberapa saat lalu ketuk Ambil OTP ulang."
                )

            keyboard = account_otp_keyboard(acc.id, page)
            await event.edit(msg_text, buttons=keyboard)

        except Exception as e:
            logger.error("Failed to get OTP for account %s: %s", acc.id, e)
            keyboard = account_otp_keyboard(acc.id, page)
            await event.edit(
                f"❌ **Gagal mengambil OTP**\n\n"
                f"**Error:** `{str(e)}`",
                buttons=keyboard
            )

    @client.on(events.CallbackQuery(pattern=r'acc_toggle:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_toggle_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
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
        keyboard = account_detail_keyboard(acc.id, acc.is_active, page)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_spam:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_spam_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
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
        keyboard = account_detail_keyboard(acc.id, acc.is_active, page)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_delete_confirm:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_delete_confirm_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        keyboard = account_delete_confirm_keyboard(acc.id, page)
        await event.edit(
            f"⚠️ **Peringatan Penghapusan Akun!**\n\n"
            f"Apakah Anda yakin ingin menghapus akun Telegram `{acc.phone}`?\n"
            f"Tindakan ini tidak dapat dibatalkan dan semua data broadcast yang terkait akan hilang.",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'acc_delete_yes:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_delete_yes_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
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
        keyboard = accounts_list_keyboard(paginated_accounts, page, total_pages)
        msg_text = format_accounts_list_message(paginated_accounts, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'acc_devices:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_devices_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
        acc = await get_account_by_id(account_id, event.user.id)
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        await event.answer("Mengambil data session/device dari Telegram...", alert=False)
        
        # Display temporary loading text
        await event.edit(
            f"⏳ **Mengambil daftar device terhubung untuk `{acc.phone}`...**\n"
            f"Harap tunggu sebentar."
        )

        try:
            from app.services.device_service import get_devices
            devices = await get_devices(acc)
            
            if not devices:
                device_text = (
                    f"💻 **Connected Devices - `{acc.phone}`**\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"Tidak ada device terhubung eksternal yang ditemukan (hanya session aktif saat ini)."
                )
                keyboard = [
                    [Button.inline("🔙 Kembali ke Detail Akun", data=f"acc_detail:{acc.id}:{page}")]
                ]
            else:
                device_text = (
                    f"💻 **Connected Devices ({len(devices)}) - `{acc.phone}`**\n"
                    f"━━━━━━━━━━━━━━━━━━\n\n"
                )
                for idx, dev in enumerate(devices, 1):
                    # Format each device info
                    app_info = f"{dev['app_name']} {dev['app_version']}".strip() or "Unknown App"
                    dev_model = dev['device_model'] or "Unknown Model"
                    platform_info = f"{dev['platform']} {dev['system_version']}".strip() or "Unknown Platform"
                    location = f"{dev['city'] or ''}, {dev['region'] or ''}, {dev['country'] or ''}".strip(", ")
                    location_str = f" ({location})" if location else ""
                    ip_str = f"{dev['ip']}{location_str}"
                    
                    device_text += (
                        f"**{idx}. {dev_model}**\n"
                        f"• App: `{app_info}`\n"
                        f"• OS: `{platform_info}`\n"
                        f"• IP: `{ip_str}`\n"
                        f"• Login pada: `{dev['created'] or 'N/A'}`\n"
                        f"━━━━━━━━━━━━━━━━━━\n\n"
                    )
                keyboard = [
                    [Button.inline("❌ Terminate Sesi Lain", data=f"acc_term_others:{acc.id}:{page}")],
                    [Button.inline("🔙 Kembali ke Detail Akun", data=f"acc_detail:{acc.id}:{page}")]
                ]
            
            await event.edit(device_text, buttons=keyboard)
            
        except Exception as e:
            logger.error("Failed to fetch devices in bot handler: %s", e)
            keyboard = [
                [Button.inline("🔙 Kembali ke Detail Akun", data=f"acc_detail:{acc.id}:{page}")]
            ]
            await event.edit(
                f"❌ **Gagal Mengambil Connected Devices**\n\n"
                f"**Error:** `{str(e)}`\n\n"
                f"Pastikan status akun aktif dan tidak terblokir.",
                buttons=keyboard
            )

    @client.on(events.CallbackQuery(pattern=r'acc_term_others:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_term_others_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        acc = await get_account_by_id(account_id, event.user.id)
        
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        keyboard = [
            [
                Button.inline("⚠️ YA, KELUARKAN LAINNYA", data=f"acc_term_others_yes:{acc.id}:{page}"),
                Button.inline("TIDAK", data=f"acc_devices:{acc.id}:{page}")
            ]
        ]
        await event.edit(
            f"⚠️ **Peringatan Terminate Sesi!**\n\n"
            f"Apakah Anda yakin ingin mengeluarkan semua device/sesi lain kecuali sesi ini untuk akun `{acc.phone}`?\n"
            f"Tindakan ini akan memutus koneksi semua aplikasi Telegram lainnya yang masuk menggunakan nomor ini.",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'acc_term_others_yes:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def acc_term_others_yes_handler(event):
        account_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1
        
        acc = await get_account_by_id(account_id, event.user.id)
        if not acc:
            await event.answer("Akun tidak ditemukan.", alert=True)
            return

        await event.answer("Memproses pemutusan sesi lain...", alert=False)
        
        try:
            from app.services.device_service import terminate_all_other_sessions
            await terminate_all_other_sessions(acc)
            await event.answer("Semua sesi lain berhasil dikeluarkan!", alert=True)
        except Exception as e:
            logger.error("Failed to terminate other sessions in bot: %s", e)
            await event.answer(f"Gagal mengeluarkan sesi lain: {str(e)}", alert=True)

        # Return to details view
        detail_text = format_account_detail(acc)
        keyboard = account_detail_keyboard(acc.id, acc.is_active, page)
        await event.edit(detail_text, buttons=keyboard)
