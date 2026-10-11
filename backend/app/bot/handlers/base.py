"""Base command handlers for /start, /logout, navigation, and authenticator token linking."""

import logging
from telethon import events, Button
from app.database import async_session_factory
from app.models.user import User
from app.models.telegram_account import TelegramAccount
from app.models.broadcast_job import BroadcastJob
from sqlalchemy.future import select
from sqlalchemy import func
from app.bot.keyboards import (
    main_menu_keyboard,
    back_to_main_keyboard,
)
from app.bot.utils import auth_required, format_dashboard_message
from app.services.uptimerobot_status import uptimerobot_service
from app.services import telegram_bot_service
from app.config import get_settings

logger = logging.getLogger(__name__)


def register_base_handlers(client):
    """Register base command handlers to the Telethon client."""

    @client.on(events.NewMessage(pattern=r'^/start(?:\s+(.+))?$'))
    async def start_handler(event):
        sender_id = event.sender_id
        if sender_id is None:
            return

        param = event.pattern_match.group(1)
        token_candidate = param.strip() if param else None

        async with async_session_factory() as session:
            # 1. If deep-link token is provided (e.g. /start TB-K7D9P2), verify immediately
            if token_candidate:
                success, msg, user = await telegram_bot_service.verify_and_link_token(
                    session, token_candidate, sender_id
                )
                if success and user:
                    await event.respond(
                        f"🎉 **Akun Berhasil Terhubung!**\n\n"
                        f"Akun TeleBos Anda (`{user.email}`) telah berhasil dikaitkan dengan Telegram ini.\n\n"
                        f"Gunakan keyboard di bawah untuk mengoperasikan TeleBos:",
                        buttons=main_menu_keyboard(),
                    )
                else:
                    await event.respond(
                        f"❌ **Gagal Menghubungkan Akun:**\n\n{msg}\n\n"
                        f"Silakan buat token baru melalui menu **Settings** > **Bot Telegram** di Dashboard Web TeleBos.",
                        buttons=[
                            [Button.url("🌐 Buka Settings Dashboard", "https://telebos.app/settings?tab=telegram")],
                        ],
                    )
                return

            # 2. Check if user already linked
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()

            if user:
                # Welcome authenticated user
                await event.respond(
                    f"🟢 **Selamat datang kembali, {user.full_name or user.email}!**\n\n"
                    "Gunakan keyboard di bawah untuk mengoperasikan TeleBos.",
                    buttons=main_menu_keyboard(),
                )
            else:
                # Unauthenticated welcome message with token instructions
                await event.respond(
                    "🤖 **TeleBos Bot - Multi-Account Telegram Manager**\n\n"
                    "Bot ini menggunakan sistem otentikasi **Token Penghubung** (mirip Authenticator) untuk menjaga keamanan akun Anda tanpa perlu memasukkan password di chat.\n\n"
                    "📌 **Cara Menghubungkan Akun:**\n"
                    "1. Buka Dashboard TeleBos Anda di web\n"
                    "2. Masuk ke menu **Settings** > **Bot Telegram**\n"
                    "3. Klik tombol **Buat Token Penghubung**\n"
                    "4. Kirimkan token (contoh: `TB-K7D9P2`) ke chat bot ini (atau gunakan link otomatis).\n\n"
                    "Silakan ketik atau tempelkan token Anda di bawah ini:",
                    buttons=[
                        [Button.url("🌐 Buka Settings Dashboard", "https://telebos.app/settings?tab=telegram")],
                        [Button.url("📝 Daftar Akun TeleBos", "https://telebos.app/register")],
                    ],
                )

    # ── Text Message Dispatcher for Linking Tokens ──

    @client.on(events.NewMessage())
    async def token_input_dispatcher(event):
        sender_id = event.sender_id
        if sender_id is None:
            return

        text_msg = (event.message.message or "").strip()
        if not text_msg or text_msg.startswith("/"):
            return

        # Check if already authenticated
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()
            if user:
                # Already authenticated; let menu handlers handle normal button text
                return

            # User is NOT authenticated, treat message as a candidate linking token
            # Formats: TB-XXXXXX, or XXXXXX (6 chars)
            norm = text_msg.upper()
            if norm.startswith("TB-") or len(norm) == 6 or len(norm) == 9:
                success, msg, linked_user = await telegram_bot_service.verify_and_link_token(
                    session, text_msg, sender_id
                )
                if success and linked_user:
                    await event.respond(
                        f"🎉 **Akun Berhasil Terhubung!**\n\n"
                        f"Akun TeleBos Anda (`{linked_user.email}`) telah berhasil dikaitkan dengan Telegram ini.\n\n"
                        f"Gunakan menu di bawah untuk mulai mengelola akun Telegram Anda:",
                        buttons=main_menu_keyboard(),
                    )
                else:
                    await event.respond(
                        f"❌ **Verifikasi Gagal:**\n\n{msg}\n\n"
                        f"Pastikan token yang Anda masukkan sesuai dengan yang muncul di menu **Settings** > **Bot Telegram** di Dashboard Web.",
                        buttons=[
                            [Button.url("🌐 Buka Settings Dashboard", "https://telebos.app/settings?tab=telegram")],
                        ],
                    )
            else:
                await event.respond(
                    "⚠️ **Format Token Tidak Sesuai.**\n\n"
                    "Token penghubung akun memiliki format `TB-XXXXXX` (contoh: `TB-K7D9P2`).\n"
                    "Silakan dapatkan token Anda di menu **Settings** > **Bot Telegram** pada Dashboard Web.",
                    buttons=[
                        [Button.url("🌐 Buka Settings Dashboard", "https://telebos.app/settings?tab=telegram")],
                    ],
                )

    # ── Logout / Disconnect Handler ──

    @client.on(events.NewMessage(pattern=r'^/(?:logout|disconnect|putus)$'))
    @auth_required
    async def logout_handler(event):
        # Disassociate telegram_chat_id
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.id == event.user.id)
            )
            user = result.scalar_one_or_none()
            if user:
                user.telegram_chat_id = None
                await session.commit()

        await event.respond(
            "🔴 **Akun Anda telah diputuskan dari bot ini.**\n\n"
            "Untuk menghubungkan kembali di kemudian hari, buat token baru di menu **Settings** > **Bot Telegram** pada Dashboard Web.",
            buttons=[],  # Removes reply keyboard
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
