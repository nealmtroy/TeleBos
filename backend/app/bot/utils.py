"""Helper functions and decorators for the Telegram Bot."""

import functools
import logging
import unicodedata
from app.database import async_session_factory
from app.models.user import User
from sqlalchemy.future import select

logger = logging.getLogger(__name__)


def decode_param(param) -> str:
    """Helper to decode regex matched groups safely whether they are bytes or string."""
    if isinstance(param, bytes):
        return param.decode('utf-8')
    return str(param) if param is not None else ""


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
                "📌 **Belum punya akun TeleBos?**\n"
                "Silakan register/daftar terlebih dahulu di:\n"
                "🔗 https://tele.t-me.site/register\n\n"
                "Silakan klik tombol di bawah ini untuk menghubungkan akun:",
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
    role_name = user.role.upper() if user.role else "BASIC"
    if user.subscription_expires_at:
        expired_str = user.subscription_expires_at.strftime('%Y-%m-%d %H:%M')
    else:
        expired_str = "Permanen" if user.role == "owner" else "-"

    return (
        f"📊 **Dashboard TeleBos**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"👤 **User:** {user.full_name or user.email}\n"
        f"💳 **Plan:** {role_name}\n"
        f"⏳ **Expired:** {expired_str}\n"
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
        f"• **Delay:** {job.delay_per_group} detik\n"
        f"• **Looping:** {'🟢 Ya' if job.loop_enabled else '🔴 Tidak'}\n"
        f"• **Progress:** {sent_count} / {total_targets} terkirim{progress_bar}\n"
        f"• **Gagal:** {failed_count} pesan\n"
        f"• **Dibuat Pada:** {job.created_at.strftime('%Y-%m-%d %H:%M')}"
    )


def extract_emoji(text: str) -> str:
    """Extract the first emoji or special symbol from a string if it starts with one."""
    if not text:
        return ""
    first_char = text[0]
    if unicodedata.category(first_char) == 'So' or ord(first_char) > 0x2000:
        return first_char
    return ""


def get_account_status_emoji(acc) -> str:
    """Get status emoji from account's folders or default to active/inactive status."""
    if hasattr(acc, "folders") and acc.folders:
        for folder in acc.folders:
            emoji = extract_emoji(folder.name)
            if emoji:
                return emoji
    return "🟢" if acc.is_active else "🔴"


def get_twofa_display_value(acc) -> str:
    """Decrypt the twofa password safely or return appropriate status string."""
    if acc.twofa_password:
        from app.utils.encryption import decrypt
        val = decrypt(acc.twofa_password)
        if val:
            return val
        return acc.twofa_password
    return "Enabled" if acc.twofa_enabled else "-"


def format_accounts_list_message(accounts: list, page: int, total_pages: int) -> str:
    """Format a list of Telegram accounts according to the user's design."""
    lines = []
    for idx, acc in enumerate(accounts, 1):
        emoji = get_account_status_emoji(acc)
        telegram_id = acc.telegram_id if acc.telegram_id else "-"
        username = f"@{acc.username}" if acc.username else "-"
        phone = acc.phone
        twofa = get_twofa_display_value(acc)
        email = acc.recovery_email if acc.recovery_email else "-"
        
        lines.append(
            f"{idx}. {emoji} {telegram_id}\n"
            f"Username: {username}\n"
            f"Nomor HP: {phone}\n"
            f"Twofa: {twofa}\n"
            f"Email: {email}"
        )
    
    if not lines:
        return "Belum ada akun Telegram terdaftar."
        
    text_content = "\n\n".join(lines)
    text_content += f"\n\n🛫Halaman {page}/{total_pages}\n\n"
    text_content += "📄Klik tombol angka untuk pilih akun sesuai list"
    return text_content


def format_autoreply_list_message(accounts: list, page: int, total_pages: int) -> str:
    """Format a list of Telegram accounts for auto-reply menu according to the user's design."""
    lines = []
    for idx, acc in enumerate(accounts, 1):
        emoji = get_account_status_emoji(acc)
        telegram_id = acc.telegram_id if acc.telegram_id else "-"
        username = f"@{acc.username}" if acc.username else "-"
        phone = acc.phone
        twofa = get_twofa_display_value(acc)
        email = acc.recovery_email if acc.recovery_email else "-"
        ar_status = "🤖 🟢 ON" if acc.auto_reply_enabled else "🤖 🔴 OFF"
        
        lines.append(
            f"{idx}. {emoji} {telegram_id}\n"
            f"Username: {username}\n"
            f"Nomor HP: {phone}\n"
            f"Auto-Reply: {ar_status}\n"
            f"Twofa: {twofa}\n"
            f"Email: {email}"
        )
    
    if not lines:
        return "Belum ada akun Telegram terdaftar."
        
    text_content = "🤖 **Pengaturan Auto-Reply Akun**\n\n"
    text_content += "\n\n".join(lines)
    text_content += f"\n\n🛫Halaman {page}/{total_pages}\n\n"
    text_content += "📄Klik tombol angka untuk mengaktifkan/menonaktifkan Auto-Reply:"
    return text_content


def format_group_lists_message(group_lists: list, page: int, total_pages: int) -> str:
    """Format a list of GroupLists according to the user's design."""
    lines = []
    for idx, gl in enumerate(group_lists, 1):
        num_targets = len(gl.items) if gl.items else 0
        lines.append(f"{idx}. 📁 **{gl.name}** ({num_targets} target)")
        
    if not lines:
        return "Belum ada target grup terdaftar. Silakan buat di website TeleBos."
        
    text_content = "📁 **Daftar Target Grup Anda**\n\n"
    text_content += "\n".join(lines)
    text_content += f"\n\n🛫Halaman {page}/{total_pages}\n\n"
    text_content += "📄Klik tombol angka untuk melihat detail atau menghapus list."
    return text_content


def format_group_list_detail(gl) -> str:
    """Format a specific GroupList's details into a markdown message."""
    items = gl.items or []
    targets_str = ""
    limit = 15
    for item in items[:limit]:
        targets_str += f"  - `{item.get('value', '')}` ({item.get('type', 'unknown')})\n"
        
    if len(items) > limit:
        targets_str += f"  - ... dan {len(items) - limit} target lainnya.\n"
        
    if not targets_str:
        targets_str = "  (Tidak ada target dalam list ini)\n"
        
    return (
        f"📁 **Detail Target Grup**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• **Nama:** {gl.name}\n"
        f"• **ID List:** `{str(gl.id)}`\n"
        f"• **Jumlah Target:** {len(items)}\n"
        f"• **Target:**\n{targets_str}"
    )


def format_text_lists_message(text_lists: list, page: int, total_pages: int) -> str:
    """Format a list of TextLists according to the user's design."""
    lines = []
    for idx, tl in enumerate(text_lists, 1):
        num_texts = len(tl.texts) if tl.texts else 0
        lines.append(f"{idx}. 📄 **{tl.name}** ({num_texts} template)")
        
    if not lines:
        return "Belum ada template pesan terdaftar. Silakan buat di website TeleBos."
        
    text_content = "📄 **Daftar Template Pesan Anda**\n\n"
    text_content += "\n".join(lines)
    text_content += f"\n\n🛫Halaman {page}/{total_pages}\n\n"
    text_content += "📄Klik tombol angka untuk melihat detail atau menghapus template."
    return text_content


def format_text_list_detail(tl) -> str:
    """Format a specific TextList's details into a markdown message."""
    texts = tl.texts or []
    texts_str = ""
    for idx, text in enumerate(texts[:5], 1):
        truncated = text if len(text) <= 150 else text[:147] + "..."
        texts_str += f"**Variasi {idx}:**\n> {truncated}\n\n"
        
    if len(texts) > 5:
        texts_str += f"  - ... dan {len(texts) - 5} variasi lainnya.\n"
        
    if not texts_str:
        texts_str = "  (Tidak ada teks dalam template ini)\n"
        
    return (
        f"📄 **Detail Template Pesan**\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"• **Nama:** {tl.name}\n"
        f"• **ID Template:** `{str(tl.id)}`\n"
        f"• **Jumlah Variasi:** {len(texts)}\n\n"
        f"{texts_str}"
    )



