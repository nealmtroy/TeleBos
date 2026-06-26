"""Base command handlers for /start, /login, /logout, and navigation."""

import logging
from telethon import events
from app.database import async_session_factory
from app.models.user import User
from app.models.telegram_account import TelegramAccount
from app.models.broadcast_job import BroadcastJob
from app.utils.encryption import verify_password
from sqlalchemy.future import select
from sqlalchemy import func
from app.bot.keyboards import (
    main_menu_keyboard,
    back_to_main_keyboard,
    login_start_keyboard,
    login_cancel_keyboard
)
from app.bot.utils import auth_required, format_dashboard_message
from app.services.uptimerobot_status import uptimerobot_service
import json
from app.utils.redis import redis_client
from app.config import get_settings

logger = logging.getLogger(__name__)


def register_base_handlers(client):
    """Register base command handlers to the Telethon client."""

    @client.on(events.NewMessage(pattern='/start'))
    async def start_handler(event):
        sender_id = event.sender_id
        if sender_id is None:
            return

        async with async_session_factory() as session:
            # Check if user already exists
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()

            if user:
                # Welcome authenticated user
                await event.respond(
                    f"🟢 **Selamat datang kembali, {user.full_name or 'User'}!**\n"
                    "Gunakan keyboard di bawah untuk mengoperasikan TeleBos.",
                    buttons=main_menu_keyboard()
                )
            else:
                # Unauthenticated welcome message
                await event.respond(
                    "🤖 **TeleBos Bot - Multi-Account Telegram Manager**\n\n"
                    "Silakan hubungkan akun website TeleBos Anda terlebih dahulu untuk menggunakan bot ini.\n\n"
                    "⚠️ **Belum punya akun TeleBos?**\n"
                    "Silakan register/daftar terlebih dahulu di:\n"
                    "🔗 https://tele.t-me.site/register\n\n"
                    "Jika sudah memiliki akun, silakan klik tombol di bawah ini untuk menghubungkan akun secara interaktif:",
                    buttons=login_start_keyboard()
                )

    # ── Callback Handlers for Login Flow ──

    @client.on(events.CallbackQuery(pattern=b'login_start'))
    async def login_start_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return

        # Initialize state in Redis: step waiting_email (expires in 5 minutes)
        await redis_client.setex(f"bot_auth_state:{sender_id}", 300, json.dumps({"step": "waiting_email"}))
        
        await event.edit(
            "💬 **Langkah 1 dari 2: Email**\n\n"
            "Silakan ketik dan kirimkan **Email** akun TeleBos Anda:",
            buttons=login_cancel_keyboard()
        )

    @client.on(events.CallbackQuery(pattern=b'login_cancel'))
    async def login_cancel_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return

        # Delete state from Redis
        await redis_client.delete(f"bot_auth_state:{sender_id}")
        
        await event.edit(
            "❌ **Login Dibatalkan.**\n\n"
            "Silakan klik tombol di bawah untuk memulai kembali jika Anda ingin menghubungkan akun:",
            buttons=login_start_keyboard()
        )

    # ── General Message Dispatcher for Login Inputs ──

    @client.on(events.NewMessage())
    async def login_input_dispatcher(event):
        sender_id = event.sender_id
        if sender_id is None or event.message.message.startswith('/'):
            return

        # Check if user is in an active login flow
        raw_state = await redis_client.get(f"bot_auth_state:{sender_id}")
        state = json.loads(raw_state) if raw_state else None
        if not state:
            # If not in login flow, ignore or let ReplyKeyboardMarkup buttons handle it
            return

        step = state.get("step")
        if step == "waiting_email":
            email = event.message.message.strip()
            
            # Simple email format check
            if "@" not in email or "." not in email:
                await event.respond(
                    "❌ **Format email tidak valid!**\n\n"
                    "Silakan masukkan email yang benar (contoh: `admin@telebos.com`):",
                    buttons=login_cancel_keyboard()
                )
                return

            # Update state in Redis
            await redis_client.setex(
                f"bot_auth_state:{sender_id}",
                300,
                json.dumps({"step": "waiting_password", "email": email})
            )
            
            await event.respond(
                f"💬 **Langkah 2 dari 2: Password**\n\n"
                f"Email diterima: `{email}`\n\n"
                f"Sekarang silakan kirimkan **Password** akun TeleBos Anda:\n\n"
                f"__Keamanan Anda Terjamin:__ Pesan password Anda akan langsung dihapus oleh bot setelah dibaca.",
                buttons=login_cancel_keyboard()
            )

        elif step == "waiting_password":
            password = event.message.message.strip()
            email = state.get("email")

            # Delete the user's password message immediately for security
            try:
                await client.delete_messages(event.chat_id, [event.id])
            except Exception as e:
                logger.warning("Failed to delete user password message: %s", e)

            # Check credentials in DB
            async with async_session_factory() as session:
                result = await session.execute(
                    select(User).where(User.email == email)
                )
                user = result.scalar_one_or_none()

                if not user or not verify_password(password, user.password_hash):
                    # Clear state on failure
                    await redis_client.delete(f"bot_auth_state:{sender_id}")
                    await event.respond(
                        "❌ **Email atau password salah!** Login gagal.\n\n"
                        "Silakan klik tombol di bawah untuk mencoba kembali:",
                        buttons=login_start_keyboard()
                    )
                    return

                if not user.is_active:
                    await redis_client.delete(f"bot_auth_state:{sender_id}")
                    await event.respond("❌ **Akun Anda telah dinonaktifkan oleh administrator.**")
                    return

                # Enforce 1-to-1 mapping:
                # 1. Check if this TeleBos user is already linked to another Telegram chat ID
                if user.telegram_chat_id is not None and user.telegram_chat_id != sender_id:
                    await redis_client.delete(f"bot_auth_state:{sender_id}")
                    await event.respond(
                        f"❌ **Gagal Menghubungkan!**\n\n"
                        f"Akun TeleBos dengan email `{email}` sudah terhubung ke akun Telegram lain. "
                        f"Silakan putuskan hubungan terlebih dahulu dari akun Telegram tersebut.",
                        buttons=login_start_keyboard()
                    )
                    return

                # 2. Check if this Telegram chat ID is already linked to another TeleBos user
                result_other = await session.execute(
                    select(User).where(User.telegram_chat_id == sender_id).where(User.id != user.id)
                )
                other_user = result_other.scalar_one_or_none()
                if other_user:
                    await redis_client.delete(f"bot_auth_state:{sender_id}")
                    await event.respond(
                        "❌ **Gagal Menghubungkan!**\n\n"
                        "Akun Telegram Anda sudah terhubung ke akun TeleBos lain. "
                        "Silakan kirim perintah `/logout` terlebih dahulu untuk memutuskan tautan sebelum menghubungkan akun baru.",
                        buttons=login_start_keyboard()
                    )
                    return

                # Link telegram_chat_id
                user.telegram_chat_id = sender_id
                await session.commit()

            # Clear state on success
            await redis_client.delete(f"bot_auth_state:{sender_id}")

            await event.respond(
                f"🟢 **Hubungkan Akun Berhasil!**\n\n"
                f"Akun TeleBos Anda (`{email}`) telah dikaitkan dengan Telegram ini.\n\n"
                f"Selamat menggunakan!",
                buttons=main_menu_keyboard()
            )

    @client.on(events.NewMessage(pattern='/logout'))
    @auth_required
    async def logout_handler(event):
        # Disassociate telegram_chat_id
        async with async_session_factory() as session:
            # We can re-fetch the user to ensure session binding
            result = await session.execute(
                select(User).where(User.id == event.user.id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.telegram_chat_id = None
                await session.commit()

        await event.respond(
            "🔴 **Akun Anda telah dinonaktifkan dari bot ini.**\n\n"
            "Gunakan `/login <email> <password>` jika ingin masuk kembali.",
            buttons=[] # Removes reply keyboard
        )

    # ── ReplyKeyboardMarkup Navigation Handlers ──

    @client.on(events.NewMessage(pattern='📊 Dashboard'))
    @auth_required
    async def dashboard_btn_handler(event):
        async with async_session_factory() as session:
            # Count user accounts
            acc_count_result = await session.execute(
                select(func.count(TelegramAccount.id)).where(TelegramAccount.user_id == event.user.id)
            )
            acc_count = acc_count_result.scalar() or 0

            # Count running jobs
            running_jobs_result = await session.execute(
                select(func.count(BroadcastJob.id))
                .where(BroadcastJob.user_id == event.user.id)
                .where(BroadcastJob.status == "running")
            )
            running_jobs = running_jobs_result.scalar() or 0

            # Count completed jobs
            completed_jobs_result = await session.execute(
                select(func.count(BroadcastJob.id))
                .where(BroadcastJob.user_id == event.user.id)
                .where(BroadcastJob.status == "completed")
            )
            completed_jobs = completed_jobs_result.scalar() or 0

        dash_msg = format_dashboard_message(event.user, acc_count, running_jobs, completed_jobs)
        await event.respond(dash_msg)

    @client.on(events.NewMessage(pattern='⚙️ System Status'))
    @auth_required
    async def status_btn_handler(event):
        try:
            # 1. Check Database connection
            db_status = "🔴 OFFLINE"
            try:
                async with async_session_factory() as session:
                    await session.execute(select(1))
                    db_status = "🟢 ONLINE"
            except Exception as e:
                logger.error(f"DB health check failed: {e}")

            # 2. Check Redis connection
            redis_status = "🔴 OFFLINE"
            try:
                await redis_client.ping()
                redis_status = "🟢 ONLINE"
            except Exception as e:
                logger.error(f"Redis health check failed: {e}")

            # 3. Check UptimeRobot Status
            settings = get_settings()
            if settings.UPTIMEROBOT_API_KEY:
                status_data = await uptimerobot_service.get_status()
                uptime_robot_status = status_data.overall.upper()
                if status_data.overall == 'down':
                    gateway_status = '🔴 OFFLINE'
                elif status_data.overall == 'degraded':
                    gateway_status = '🟡 DEGRADED'
                else:
                    gateway_status = '🟢 ONLINE'
                latency = status_data.debug_info.get('latency', 'N/A') if hasattr(status_data, 'debug_info') else 'N/A'
            else:
                uptime_robot_status = "⚪ NOT CONFIGURED"
                gateway_status = "🟢 ONLINE"  # The bot is currently responding, so gateway works
                latency = "N/A"

            status_msg = (
                f"⚙️ **System & Connection Status**\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"• **Telegram Bot (this):** 🟢 ONLINE\n"
                f"• **Database (Postgres):** {db_status}\n"
                f"• **Cache & Queue (Redis):** {redis_status}\n"
                f"• **Telegram Gateway:** {gateway_status}\n"
                f"• **Latency:** {latency}\n"
                f"• **Monitor Status:** {uptime_robot_status}\n\n"
                f"Semua sistem backend berjalan dengan normal."
            )
        except Exception as e:
            status_msg = (
                f"⚙️ **System Status**\n"
                f"━━━━━━━━━━━━━━━━━━\n"
                f"• **Database Connection:** 🟢 OK\n"
                f"• **Uptime Robot Monitoring:** ⚠️ API Error / Offline\n"
                f"• **Error Detail:** `{str(e)}`"
            )
        await event.respond(status_msg)

    @client.on(events.NewMessage(pattern='🔙 Kembali ke Menu Utama'))
    @auth_required
    async def back_to_main_handler(event):
        await event.respond(
            "Kembali ke Menu Utama.",
            buttons=main_menu_keyboard()
        )
