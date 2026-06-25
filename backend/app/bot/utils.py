"""Helper functions and decorators for the Telegram Bot."""

import functools
import logging
from app.database import async_session_factory
from app.models.user import User
from sqlalchemy.future import select

logger = logging.getLogger(__name__)


def auth_required(func):
    """Decorator to ensure the Telegram user has linked their TeleBos web account."""
    @functools.wraps(func)
    async def wrapper(event, *args, **kwargs):
        sender_id = event.sender_id
        if sender_id is None:
            return

        async with async_session_factory() as session:
            # Query User by telegram_chat_id
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()

        if not user:
            # Check if they are currently in the middle of a login flow
            import json
            from app.utils.redis import redis_client
            raw_state = await redis_client.get(f"bot_auth_state:{sender_id}")
            if raw_state:
                # If they are in a login flow, let the text handler process the input
                return

            # Not in login flow and not authenticated, prompt to login
            from app.bot.keyboards import login_start_keyboard
            await event.respond(
                "⚠️ **Akun TeleBos Belum Tertaut!**\n\n"
                "Untuk menggunakan bot ini, silakan tautkan akun website TeleBos Anda terlebih dahulu "
                "secara interaktif.\n\n"
                "Silakan klik tombol di bawah ini untuk memulai:",
                buttons=login_start_keyboard()
            )
            return

        if not user.is_active:
            await event.respond("❌ **Akun Anda dinonaktifkan oleh administrator.**")
            return

        # Pass user to the handler
        event.user = user
        return await func(event, *args, **kwargs)
    return wrapper


def format_dashboard_message(user: User, accounts_count: int, running_jobs: int, completed_jobs: int) -> str:
    """Format dashboard metrics into a clean markdown message."""
    return (
        f"📊 **Dashboard TeleBos**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"👤 **User:** {user.full_name or user.email}\n"
        f"💰 **Saldo:** Rp {user.balance:,}\n"
        f"👥 **Total Akun:** {accounts_count} akun\n"
        f"🏃 **Broadcast Berjalan:** {running_jobs} job\n"
        f"✅ **Broadcast Selesai:** {completed_jobs} job\n\n"
        f"Gunakan menu di bawah untuk mengelola akun dan pekerjaan broadcast Anda secara langsung!"
    )


def format_account_detail(acc) -> str:
    """Format a TelegramAccount model instance's details into a markdown message."""
    status = "🟢 Aktif" if acc.is_active else "🔴 Nonaktif/Expired"
    name = f"{acc.first_name or ''} {acc.last_name or ''}".strip() or "No Name"
    username = f"@{acc.username}" if acc.username else "Tidak ada"
    
    spam_status = acc.spam_status or "unknown"
    spam_indicator = "🟢 Aman (Safe)" if "safe" in spam_status.lower() else "🔴 Dibatasi (Restrict)" if "restrict" in spam_status.lower() else "❓ Tidak Diketahui"
    
    contacts = acc.contacts_count or 0
    groups = acc.total_groups or 0
    channels = acc.total_channels or 0
    
    return (
        f"👤 **Detail Akun Telegram**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• **No. Telp:** `{acc.phone}`\n"
        f"• **Nama:** {name}\n"
        f"• **Username:** {username}\n"
        f"• **Status Akun:** {status}\n"
        f"• **Cek Spam:** {spam_indicator}\n"
        f"• **Detail Spam:** {acc.spam_detail or 'Belum dicek'}\n"
        f"• **Kontak:** {contacts} orang\n"
        f"• **Grup Diikuti:** {groups} grup\n"
        f"• **Channel Diikuti:** {channels} channel\n"
        f"• **Auto Reply:** {'🟢 Aktif' if acc.auto_reply_enabled else '🔴 Nonaktif'}\n"
        f"• **Terakhir Sinkron:** {acc.last_sync_at.strftime('%Y-%m-%d %H:%M') if acc.last_sync_at else 'Belum pernah'}"
    )


def format_job_detail(job, sent_count: int, failed_count: int, total_targets: int) -> str:
    """Format a BroadcastJob's status and progress into a markdown message."""
    status_map = {
        "pending": "⏳ Pending",
        "running": "🏃 Berjalan (Running)",
        "paused": "⏸️ Dijeda (Paused)",
        "cancelled": "⏹️ Dibatalkan (Stopped)",
        "completed": "✅ Selesai (Completed)",
        "failed": "❌ Gagal (Failed)"
    }
    
    status_str = status_map.get(job.status, job.status)
    group_name = job.group_list.name if job.group_list else "Target List"
    text_name = job.text_list.name if job.text_list else "Template"
    
    progress_bar = ""
    if total_targets > 0:
        percent = int((sent_count / total_targets) * 100)
        filled = int((sent_count / total_targets) * 10)
        progress_bar = f"\n`[{'■' * filled}{' ' * (10 - filled)}] {percent}%`"
        
    return (
        f"📢 **Detail Broadcast Job**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• **ID Job:** `{str(job.id)[:8]}...`\n"
        f"• **Status:** {status_str}\n"
        f"• **Target Grup:** {group_name}\n"
        f"• **Template Pesan:** {text_name}\n"
        f"• **Delay:** {job.delay_seconds} detik\n"
        f"• **Looping:** {'🟢 Ya' if job.loop_enabled else '🔴 Tidak'}\n"
        f"• **Progress:** {sent_count} / {total_targets} terkirim{progress_bar}\n"
        f"• **Gagal:** {failed_count} pesan\n"
        f"• **Dibuat Pada:** {job.created_at.strftime('%Y-%m-%d %H:%M')}"
    )
