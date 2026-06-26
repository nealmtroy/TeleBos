"""Telegram Bot keyboard markups using Telethon Button class."""

from telethon import Button
from app.models.telegram_account import TelegramAccount
from app.models.broadcast_job import BroadcastJob
from app.models.group_list import GroupList
from app.models.text_list import TextList
from typing import List


def main_menu_keyboard():
    """Persistent ReplyKeyboardMarkup for the bot admin home menu."""
    return [
        [Button.text("📊 Dashboard", resize=True), Button.text("👥 Accounts", resize=True)],
        [Button.text("📢 Broadcasts", resize=True), Button.text("🤖 Auto-Reply", resize=True)],
        [Button.text("📁 Group Lists", resize=True), Button.text("📄 Text Lists", resize=True)],
        [Button.text("⚙️ System Status", resize=True)]
    ]


def back_to_main_keyboard():
    """ReplyKeyboard to return to the main menu."""
    return [
        [Button.text("🔙 Kembali ke Menu Utama", resize=True)]
    ]


def accounts_list_keyboard(accounts: List[TelegramAccount], page: int = 1, total_pages: int = 1):
    """InlineKeyboardMarkup with numbered buttons (1-10) for page items, plus navigation."""
    buttons = []
    
    # Selection buttons (1 to N)
    num_buttons = []
    for idx, acc in enumerate(accounts, 1):
        num_buttons.append(Button.inline(str(idx), data=f"acc_detail:{acc.id}:{page}"))
    
    # Group number buttons into rows of up to 5
    chunk_size = 5
    for i in range(0, len(num_buttons), chunk_size):
        buttons.append(num_buttons[i : i + chunk_size])
    
    # Pagination Row
    nav_buttons = []
    if page > 1:
        nav_buttons.append(Button.inline("⬅️ Prev", data=f"acc_list_page:{page-1}"))
    if page < total_pages:
        nav_buttons.append(Button.inline("Next ➡️", data=f"acc_list_page:{page+1}"))
    
    if nav_buttons:
        buttons.append(nav_buttons)
        
    # Bottom actions
    buttons.append([Button.inline("🔄 Refresh List", data=f"acc_refresh:{page}")])
    return buttons



def account_detail_keyboard(account_id: str, is_active: bool, page: int = 1):
    """InlineKeyboardMarkup for a specific Telegram account's details."""
    toggle_label = "🔴 Nonaktifkan" if is_active else "🟢 Aktifkan"
    return [
        [
            Button.inline("🔄 Cek Spam (@SpamBot)", data=f"acc_spam:{account_id}:{page}"),
            Button.inline(toggle_label, data=f"acc_toggle:{account_id}:{page}")
        ],
        [
            Button.inline("💻 Connected Devices", data=f"acc_devices:{account_id}:{page}")
        ],
        [
            Button.inline("🗑️ Hapus Akun", data=f"acc_delete_confirm:{account_id}:{page}")
        ],
        [
            Button.inline("🔙 Kembali ke Daftar Akun", data=f"acc_list_back:{page}")
        ]
    ]


def account_delete_confirm_keyboard(account_id: str, page: int = 1):
    """InlineKeyboardMarkup to confirm deletion of a Telegram Account."""
    return [
        [
            Button.inline("⚠️ YA, HAPUS AKUN", data=f"acc_delete_yes:{account_id}:{page}"),
            Button.inline("TIDAK", data=f"acc_detail:{account_id}:{page}")
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


def autoreply_menu_keyboard(accounts: List[TelegramAccount], page: int = 1, total_pages: int = 1):
    """InlineKeyboardMarkup with numbered buttons (1-10) to toggle auto-reply for page items, plus navigation."""
    buttons = []
    
    # Selection buttons (1 to N)
    num_buttons = []
    for idx, acc in enumerate(accounts, 1):
        num_buttons.append(Button.inline(str(idx), data=f"auto_reply_toggle:{acc.id}:{page}"))
    
    # Group number buttons into rows of up to 5
    chunk_size = 5
    for i in range(0, len(num_buttons), chunk_size):
        buttons.append(num_buttons[i : i + chunk_size])
    
    # Pagination Row
    nav_buttons = []
    if page > 1:
        nav_buttons.append(Button.inline("⬅️ Prev", data=f"auto_reply_page:{page-1}"))
    if page < total_pages:
        nav_buttons.append(Button.inline("Next ➡️", data=f"auto_reply_page:{page+1}"))
    
    if nav_buttons:
        buttons.append(nav_buttons)
        
    # Bottom actions
    buttons.append([Button.inline("🔄 Refresh List", data=f"auto_reply_refresh:{page}")])
    return buttons



def login_start_keyboard():
    """InlineKeyboardMarkup to start login flow."""
    return [
        [Button.inline("🔑 Hubungkan Akun TeleBos", data="login_start")],
        [Button.url("📝 Daftar Akun TeleBos", url="https://tele.t-me.site/register")]
    ]


def login_cancel_keyboard():
    """InlineKeyboardMarkup to cancel active login flow."""
    return [
        [Button.inline("❌ Batal", data="login_cancel")]
    ]


def group_lists_keyboard(group_lists: List[GroupList], page: int = 1, total_pages: int = 1):
    """InlineKeyboardMarkup with numbered buttons (1-10) for page items, plus navigation."""
    buttons = []
    
    # Selection buttons (1 to N)
    num_buttons = []
    for idx, gl in enumerate(group_lists, 1):
        num_buttons.append(Button.inline(str(idx), data=f"gl_detail:{gl.id}:{page}"))
        
    chunk_size = 5
    for i in range(0, len(num_buttons), chunk_size):
        buttons.append(num_buttons[i : i + chunk_size])
        
    # Pagination Row
    nav_buttons = []
    if page > 1:
        nav_buttons.append(Button.inline("⬅️ Prev", data=f"gl_list_page:{page-1}"))
    if page < total_pages:
        nav_buttons.append(Button.inline("Next ➡️", data=f"gl_list_page:{page+1}"))
        
    if nav_buttons:
        buttons.append(nav_buttons)
        
    # Bottom actions
    buttons.append([
        Button.inline("➕ Tambah List", data="gl_add_start"),
        Button.inline("🔄 Refresh List", data=f"gl_refresh:{page}")
    ])
    return buttons


def group_list_detail_keyboard(group_list_id: str, page: int = 1):
    """InlineKeyboardMarkup for a specific GroupList's details."""
    return [
        [
            Button.inline("🗑️ Hapus List", data=f"gl_delete_confirm:{group_list_id}:{page}")
        ],
        [
            Button.inline("🔙 Kembali ke Daftar List", data=f"gl_list_back:{page}")
        ]
    ]


def group_list_delete_confirm_keyboard(group_list_id: str, page: int = 1):
    """InlineKeyboardMarkup to confirm deletion of a GroupList."""
    return [
        [
            Button.inline("⚠️ YA, HAPUS LIST", data=f"gl_delete_yes:{group_list_id}:{page}"),
            Button.inline("TIDAK", data=f"gl_detail:{group_list_id}:{page}")
        ]
    ]


def text_lists_keyboard(text_lists: List[TextList], page: int = 1, total_pages: int = 1):
    """InlineKeyboardMarkup with numbered buttons (1-10) for page items, plus navigation."""
    buttons = []
    
    # Selection buttons (1 to N)
    num_buttons = []
    for idx, tl in enumerate(text_lists, 1):
        num_buttons.append(Button.inline(str(idx), data=f"tl_detail:{tl.id}:{page}"))
        
    chunk_size = 5
    for i in range(0, len(num_buttons), chunk_size):
        buttons.append(num_buttons[i : i + chunk_size])
        
    # Pagination Row
    nav_buttons = []
    if page > 1:
        nav_buttons.append(Button.inline("⬅️ Prev", data=f"tl_list_page:{page-1}"))
    if page < total_pages:
        nav_buttons.append(Button.inline("Next ➡️", data=f"tl_list_page:{page+1}"))
        
    if nav_buttons:
        buttons.append(nav_buttons)
        
    # Bottom actions
    buttons.append([
        Button.inline("➕ Tambah Template", data="tl_add_start"),
        Button.inline("🔄 Refresh List", data=f"tl_refresh:{page}")
    ])
    return buttons


def text_list_detail_keyboard(text_list_id: str, page: int = 1):
    """InlineKeyboardMarkup for a specific TextList's details."""
    return [
        [
            Button.inline("🗑️ Hapus Template", data=f"tl_delete_confirm:{text_list_id}:{page}")
        ],
        [
            Button.inline("🔙 Kembali ke Daftar Template", data=f"tl_list_back:{page}")
        ]
    ]


def text_list_delete_confirm_keyboard(text_list_id: str, page: int = 1):
    """InlineKeyboardMarkup to confirm deletion of a TextList."""
    return [
        [
            Button.inline("⚠️ YA, HAPUS TEMPLATE", data=f"tl_delete_yes:{text_list_id}:{page}"),
            Button.inline("TIDAK", data=f"tl_detail:{text_list_id}:{page}")
        ]
    ]


def list_add_cancel_keyboard(callback_prefix: str):
    """InlineKeyboardMarkup to cancel adding list or template."""
    return [
        [Button.inline("❌ Batal", data=f"{callback_prefix}_add_cancel")]
    ]


