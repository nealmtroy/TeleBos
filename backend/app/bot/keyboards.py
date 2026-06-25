"""Telegram Bot keyboard markups using Telethon Button class."""

from telethon import Button
from app.models.telegram_account import TelegramAccount
from app.models.broadcast_job import BroadcastJob
from typing import List


def main_menu_keyboard():
    """Persistent ReplyKeyboardMarkup for the bot admin home menu."""
    return [
        [Button.text("📊 Dashboard", resize=True), Button.text("👥 Accounts", resize=True)],
        [Button.text("📢 Broadcasts", resize=True), Button.text("🤖 Auto-Reply", resize=True)],
        [Button.text("⚙️ System Status", resize=True)]
    ]


def back_to_main_keyboard():
    """ReplyKeyboard to return to the main menu."""
    return [
        [Button.text("🔙 Kembali ke Menu Utama", resize=True)]
    ]


def accounts_list_keyboard(accounts: List[TelegramAccount]):
    """InlineKeyboardMarkup listing accounts with status indicator and action buttons."""
    buttons = []
    for acc in accounts:
        status_indicator = "🟢" if acc.is_active else "🔴"
        name_str = acc.first_name if acc.first_name else ""
        if acc.username:
            name_str = f"@{acc.username}"
        elif acc.first_name:
            name_str = f"{acc.first_name}"
        else:
            name_str = "No Username"
        
        btn_label = f"{status_indicator} {acc.phone} ({name_str})"
        buttons.append([Button.inline(btn_label, data=f"acc_detail:{acc.id}")])
    
    # Bottom actions
    buttons.append([Button.inline("🔄 Refresh List", data="acc_refresh")])
    return buttons


def account_detail_keyboard(account_id: str, is_active: bool):
    """InlineKeyboardMarkup for a specific Telegram account's details."""
    toggle_label = "🔴 Nonaktifkan" if is_active else "🟢 Aktifkan"
    return [
        [
            Button.inline("🔄 Cek Spam (@SpamBot)", data=f"acc_spam:{account_id}"),
            Button.inline(toggle_label, data=f"acc_toggle:{account_id}")
        ],
        [
            Button.inline("🗑️ Hapus Akun", data=f"acc_delete_confirm:{account_id}")
        ],
        [
            Button.inline("🔙 Kembali ke Daftar Akun", data="acc_list_back")
        ]
    ]


def account_delete_confirm_keyboard(account_id: str):
    """InlineKeyboardMarkup to confirm deletion of a Telegram Account."""
    return [
        [
            Button.inline("⚠️ YA, HAPUS AKUN", data=f"acc_delete_yes:{account_id}"),
            Button.inline("TIDAK", data=f"acc_detail:{account_id}")
        ]
    ]


def broadcasts_list_keyboard(jobs: List[BroadcastJob]):
    """InlineKeyboardMarkup listing active or recent broadcast jobs."""
    buttons = []
    for job in jobs:
        status_icon = "⏳" if job.status == "pending" else "🏃" if job.status == "running" else "⏸️" if job.status == "paused" else "✅" if job.status == "completed" else "❌"
        # Truncate text lists if needed
        text_lists = job.text_list.name if job.text_list else "Template"
        group_lists = job.group_list.name if job.group_list else "Target"
        
        btn_label = f"{status_icon} #{str(job.id)[:8]} ({group_lists} -> {text_lists})"
        buttons.append([Button.inline(btn_label, data=f"job_detail:{job.id}")])
    
    buttons.append([Button.inline("🔄 Refresh List", data="job_refresh")])
    return buttons


def broadcast_detail_keyboard(job_id: str, status: str):
    """InlineKeyboardMarkup for a specific Broadcast Job's control."""
    buttons = []
    
    # Control buttons based on current state
    if status == "running":
        buttons.append([
            Button.inline("⏸️ Jeda (Pause)", data=f"job_pause:{job_id}"),
            Button.inline("⏹️ Stop (Cancel)", data=f"job_cancel:{job_id}")
        ])
    elif status == "paused":
        buttons.append([
            Button.inline("▶️ Lanjutkan (Resume)", data=f"job_resume:{job_id}"),
            Button.inline("⏹️ Stop (Cancel)", data=f"job_cancel:{job_id}")
        ])
    elif status in ["pending"]:
        buttons.append([
            Button.inline("⏹️ Stop (Cancel)", data=f"job_cancel:{job_id}")
        ])
    elif status in ["completed", "failed", "cancelled"]:
        buttons.append([
            Button.inline("🔄 Coba Lagi (Retry)", data=f"job_retry:{job_id}"),
            Button.inline("🗑️ Hapus Job", data=f"job_delete:{job_id}")
        ])
        
    buttons.append([
        Button.inline("📋 Lihat Delivery Logs", data=f"job_logs:{job_id}")
    ])
    buttons.append([
        Button.inline("🔙 Kembali ke Daftar Job", data="job_list_back")
    ])
    return buttons


def autoreply_menu_keyboard(accounts: List[TelegramAccount]):
    """InlineKeyboardMarkup listing accounts and their auto-reply status."""
    buttons = []
    for acc in accounts:
        status_indicator = "🤖 🟢 ON" if acc.auto_reply_enabled else "🤖 🔴 OFF"
        name_str = f"@{acc.username}" if acc.username else acc.phone
        btn_label = f"{status_indicator} | {name_str}"
        buttons.append([Button.inline(btn_label, data=f"auto_reply_toggle:{acc.id}")])
        
    buttons.append([Button.inline("🔄 Refresh List", data="auto_reply_refresh")])
    return buttons


def login_start_keyboard():
    """InlineKeyboardMarkup to start login flow."""
    return [
        [Button.inline("🔑 Hubungkan Akun TeleBos", data="login_start")]
    ]


def login_cancel_keyboard():
    """InlineKeyboardMarkup to cancel active login flow."""
    return [
        [Button.inline("❌ Batal", data="login_cancel")]
    ]
