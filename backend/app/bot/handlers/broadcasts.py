"""Telegram Bot handlers for managing broadcast jobs."""

import uuid
import json
import logging
from telethon import events, Button
from app.database import async_session_factory
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.models.telegram_account import TelegramAccount
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.services.broadcast_service import (
    get_job,
    get_jobs_for_user,
    update_job_status,
    delete_job,
    retry_job,
    start_broadcast
)
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.utils.redis import redis_client
from app.bot.keyboards import (
    broadcasts_list_keyboard,
    broadcast_detail_keyboard,
    job_accounts_select_keyboard_paginated,
    job_gl_select_keyboard,
    job_mode_select_keyboard,
    job_tl_select_keyboard,
    job_confirm_keyboard
)
from app.bot.utils import (
    auth_required,
    format_job_detail,
    decode_param,
    format_job_accounts_select_message
)

logger = logging.getLogger(__name__)


def register_broadcasts_handlers(client):
    """Register broadcast management handlers to the Telethon client."""

    async def get_user_jobs(user_id):
        """Helper to fetch recent jobs belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(BroadcastJob)
                .where(BroadcastJob.user_id == user_id)
                .options(selectinload(BroadcastJob.group_list), selectinload(BroadcastJob.text_list))
                .order_by(BroadcastJob.created_at.desc())
                .limit(15)
            )
            return result.scalars().all()

    async def get_job_by_id(job_id, user_id):
        """Helper to fetch a specific job by ID and check user authorization."""
        try:
            job_uuid = uuid.UUID(job_id)
        except ValueError:
            return None
        async with async_session_factory() as session:
            result = await session.execute(
                select(BroadcastJob)
                .where(BroadcastJob.id == job_uuid)
                .where(BroadcastJob.user_id == user_id)
                .options(selectinload(BroadcastJob.group_list), selectinload(BroadcastJob.text_list))
            )
            return result.scalar_one_or_none()

    # ── ReplyKeyboard Handler ──
    @client.on(events.NewMessage(pattern='📢 Broadcasts'))
    @auth_required
    async def broadcasts_menu_handler(event):
        jobs = await get_user_jobs(event.user.id)
        if not jobs:
            await event.respond(
                "📢 **Broadcast Jobs**\n\n"
                "Belum ada riwayat broadcast job.\n"
                "Klik tombol di bawah untuk membuat broadcast baru:",
                buttons=[[Button.inline("➕ Buat Broadcast Baru", data="job_add_start")]]
            )
            return

        keyboard = broadcasts_list_keyboard(jobs)
        await event.respond(
            "📢 **Daftar Pekerjaan Broadcast**\n"
            "Pilih salah satu job di bawah untuk melihat detail, menjeda, atau melanjutkan:",
            buttons=keyboard
        )

    # ── Callback Handlers ──

    @client.on(events.CallbackQuery(pattern=b'job_list_back'))
    @auth_required
    async def job_list_back_handler(event):
        jobs = await get_user_jobs(event.user.id)
        keyboard = broadcasts_list_keyboard(jobs)
        await event.edit(
            "📢 **Daftar Pekerjaan Broadcast**\n"
            "Pilih salah satu job di bawah untuk melihat detail, menjeda, atau melanjutkan:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=b'job_refresh'))
    @auth_required
    async def job_refresh_handler(event):
        jobs = await get_user_jobs(event.user.id)
        keyboard = broadcasts_list_keyboard(jobs)
        try:
            await event.edit(
                "📢 **Daftar Pekerjaan Broadcast** (Dinkini)\n"
                "Pilih salah satu job di bawah untuk melihat detail, menjeda, atau melanjutkan:",
                buttons=keyboard
            )
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'job_detail:(.+)'))
    @auth_required
    async def job_detail_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        job = await get_job_by_id(job_id, event.user.id)
        
        if not job:
            await event.answer("Job tidak ditemukan.", alert=True)
            return

        # Fetch targets count
        total_targets = job.total_groups or 0
        detail_text = format_job_detail(job, job.sent_count, job.fail_count, total_targets)
        keyboard = broadcast_detail_keyboard(job.id, job.status)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_pause:(.+)'))
    @auth_required
    async def job_pause_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        
        async with async_session_factory() as session:
            db_job = await get_job(session, job_id, str(event.user.id))
            if not db_job:
                await event.answer("Job tidak ditemukan.", alert=True)
                return
            if db_job.status != "running":
                await event.answer("Job tidak sedang berjalan.", alert=True)
                return
                
            await update_job_status(session, db_job, "paused")
            await session.commit()
            
            # Local clone for UI redraw
            job = db_job

        await event.answer("Broadcast berhasil dijeda.")
        
        # Redraw
        total_targets = job.total_groups or 0
        detail_text = format_job_detail(job, job.sent_count, job.fail_count, total_targets)
        keyboard = broadcast_detail_keyboard(job.id, job.status)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_resume:(.+)'))
    @auth_required
    async def job_resume_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        
        async with async_session_factory() as session:
            db_job = await get_job(session, job_id, str(event.user.id))
            if not db_job:
                await event.answer("Job tidak ditemukan.", alert=True)
                return
            if db_job.status != "paused":
                await event.answer("Job tidak sedang dijeda.", alert=True)
                return
                
            await update_job_status(session, db_job, "running")
            await session.commit()
            
            # Local clone for UI redraw
            job = db_job

        await event.answer("Broadcast dilanjutkan.")
        
        # Redraw
        total_targets = job.total_groups or 0
        detail_text = format_job_detail(job, job.sent_count, job.fail_count, total_targets)
        keyboard = broadcast_detail_keyboard(job.id, job.status)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_cancel:(.+)'))
    @auth_required
    async def job_cancel_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        
        async with async_session_factory() as session:
            db_job = await get_job(session, job_id, str(event.user.id))
            if not db_job:
                await event.answer("Job tidak ditemukan.", alert=True)
                return
            if db_job.status not in ("running", "paused", "pending"):
                await event.answer("Job tidak dapat dibatalkan.", alert=True)
                return
                
            await update_job_status(session, db_job, "cancelled")
            await session.commit()
            
            # Local clone for UI redraw
            job = db_job

        await event.answer("Broadcast dibatalkan.")
        
        # Redraw
        total_targets = job.total_groups or 0
        detail_text = format_job_detail(job, job.sent_count, job.fail_count, total_targets)
        keyboard = broadcast_detail_keyboard(job.id, job.status)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_retry:(.+)'))
    @auth_required
    async def job_retry_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        
        async with async_session_factory() as session:
            try:
                # retry_job resets counters and starts execution in background task
                job = await retry_job(session, job_id, str(event.user.id))
                await session.commit()
                await event.answer("Job berhasil dipicu kembali!")
            except Exception as e:
                logger.error("Failed to retry job inside bot: %s", e)
                await event.answer(f"Gagal memicu kembali: {str(e)}", alert=True)
                return

        # Redraw
        total_targets = job.total_groups or 0
        detail_text = format_job_detail(job, job.sent_count, job.fail_count, total_targets)
        keyboard = broadcast_detail_keyboard(job.id, job.status)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_delete:(.+)'))
    @auth_required
    async def job_delete_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        
        async with async_session_factory() as session:
            try:
                await delete_job(session, job_id, str(event.user.id))
                await session.commit()
                await event.answer("Job berhasil dihapus dari riwayat.")
            except Exception as e:
                logger.error("Failed to delete job: %s", e)
                await event.answer(f"Gagal menghapus: {str(e)}", alert=True)
                return

        # Go back to lists
        jobs = await get_user_jobs(event.user.id)
        keyboard = broadcasts_list_keyboard(jobs)
        await event.edit(
            "📢 **Daftar Pekerjaan Broadcast**\n"
            "Pilih salah satu job di bawah untuk melihat detail, menjeda, atau melanjutkan:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'job_logs:(.+)'))
    @auth_required
    async def job_logs_handler(event):
        job_id = decode_param(event.pattern_match.group(1))
        job = await get_job_by_id(job_id, event.user.id)
        
        if not job:
            await event.answer("Job tidak ditemukan.", alert=True)
            return

        async with async_session_factory() as session:
            # Fetch last 10 logs for this job
            result = await session.execute(
                select(BroadcastLog)
                .where(BroadcastLog.job_id == job.id)
                .order_by(BroadcastLog.sent_at.desc())
                .limit(10)
            )
            logs = result.scalars().all()

        log_lines = []
        for log in logs:
            sent_time = log.sent_at.strftime('%H:%M:%S')
            status_icon = "🟢" if log.status == "success" else "🔴"
            target = log.group_identifier
            # Truncate target if too long
            if len(target) > 25:
                target = target[:22] + "..."
            
            error_desc = f" ({log.error_type})" if log.error_type else ""
            log_lines.append(f"[{sent_time}] {status_icon} `{target}`{error_desc}")

        if not log_lines:
            log_text = "Belum ada log pengiriman untuk job ini."
        else:
            log_text = "\n".join(log_lines)

        await event.edit(
            f"📋 **Log Pengiriman Terbaru (10 Log Terakhir)**\n"
            f"Job: #{str(job.id)[:8]}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"{log_text}",
            buttons=[[Button.inline("🔙 Kembali ke Detail Job", data=f"job_detail:{job.id}")]]
        )


    # ── Helpers for Broadcast Creation ──

    async def get_user_active_accounts(user_id):
        """Fetch active Telegram accounts for a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TelegramAccount)
                .where(TelegramAccount.user_id == user_id)
                .where(TelegramAccount.is_active == True)
                .options(selectinload(TelegramAccount.folders))
                .order_by(TelegramAccount.created_at.desc())
            )
            return result.scalars().all()

    async def get_user_group_lists(user_id):
        """Fetch all GroupLists belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(GroupList)
                .where(GroupList.user_id == user_id)
                .order_by(GroupList.created_at.desc())
            )
            return result.scalars().all()

    async def get_user_text_lists(user_id):
        """Fetch all TextLists belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TextList)
                .where(TextList.user_id == user_id)
                .order_by(TextList.created_at.desc())
            )
            return result.scalars().all()

    REDIS_KEY = "bot_add_job_state"

    # ── Step 1: Start — Select Accounts ──

    @client.on(events.CallbackQuery(pattern=b'job_add_start'))
    @auth_required
    async def job_add_start_callback(event):
        sender_id = event.sender_id
        accounts = await get_user_active_accounts(event.user.id)
        if not accounts:
            await event.answer("Anda belum memiliki akun Telegram yang aktif.", alert=True)
            return

        state = {"step": "select_accounts", "selected_account_ids": []}
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        page = 1
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        paginated_accounts = accounts[(page - 1) * limit : page * limit]

        msg_text = format_job_accounts_select_message(paginated_accounts, [], page, total_pages)
        keyboard = job_accounts_select_keyboard_paginated(paginated_accounts, [], page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_add_acc_toggle:([a-fA-F0-9-]{36}):(\d+)'))
    @auth_required
    async def job_add_acc_toggle_callback(event):
        sender_id = event.sender_id
        acc_id = decode_param(event.pattern_match.group(1))
        page = int(decode_param(event.pattern_match.group(2)))

        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa, silakan mulai ulang.", alert=True)
            return
        state = json.loads(raw)

        selected = state.get("selected_account_ids", [])
        if acc_id in selected:
            selected.remove(acc_id)
        else:
            selected.append(acc_id)
        state["selected_account_ids"] = selected
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        accounts = await get_user_active_accounts(event.user.id)
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        msg_text = format_job_accounts_select_message(paginated_accounts, selected, page, total_pages)
        keyboard = job_accounts_select_keyboard_paginated(paginated_accounts, selected, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer()

    @client.on(events.CallbackQuery(pattern=r'job_add_acc_page:(\d+)'))
    @auth_required
    async def job_add_acc_page_callback(event):
        sender_id = event.sender_id
        page = int(decode_param(event.pattern_match.group(1)))

        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa, silakan mulai ulang.", alert=True)
            return
        state = json.loads(raw)
        selected = state.get("selected_account_ids", [])

        accounts = await get_user_active_accounts(event.user.id)
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        msg_text = format_job_accounts_select_message(paginated_accounts, selected, page, total_pages)
        keyboard = job_accounts_select_keyboard_paginated(paginated_accounts, selected, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'job_add_acc_all:(\d+)'))
    @auth_required
    async def job_add_acc_all_callback(event):
        sender_id = event.sender_id
        page = int(decode_param(event.pattern_match.group(1)))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)

        accounts = await get_user_active_accounts(event.user.id)
        selected = [str(a.id) for a in accounts]
        state["selected_account_ids"] = selected
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        msg_text = format_job_accounts_select_message(paginated_accounts, selected, page, total_pages)
        keyboard = job_accounts_select_keyboard_paginated(paginated_accounts, selected, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer()

    @client.on(events.CallbackQuery(pattern=r'job_add_acc_none:(\d+)'))
    @auth_required
    async def job_add_acc_none_callback(event):
        sender_id = event.sender_id
        page = int(decode_param(event.pattern_match.group(1)))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)
        state["selected_account_ids"] = []
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        accounts = await get_user_active_accounts(event.user.id)
        limit = 10
        total_accounts = len(accounts)
        total_pages = (total_accounts + limit - 1) // limit
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_accounts = accounts[(page - 1) * limit : page * limit]
        msg_text = format_job_accounts_select_message(paginated_accounts, [], page, total_pages)
        keyboard = job_accounts_select_keyboard_paginated(paginated_accounts, [], page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer()

    # ── Step 2: Select Group List ──

    @client.on(events.CallbackQuery(pattern=b'job_add_acc_next'))
    @auth_required
    async def job_add_acc_next_callback(event):
        sender_id = event.sender_id
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)

        if not state.get("selected_account_ids"):
            await event.answer("Pilih minimal 1 akun!", alert=True)
            return

        state["step"] = "select_group_list"
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        group_lists = await get_user_group_lists(event.user.id)
        if not group_lists:
            await event.edit(
                "📢 **Buat Broadcast Baru (Langkah 2/4)**\n\n"
                "⚠️ Anda belum memiliki Target Grup List.\n"
                "Silakan buat terlebih dahulu di menu **📁 Group Lists**.",
                buttons=[[Button.inline("❌ Batal", data="job_add_cancel")]]
            )
            return

        keyboard = job_gl_select_keyboard(group_lists)
        await event.edit(
            "📢 **Buat Broadcast Baru (Langkah 2/4)**\n\n"
            "Pilih **Target Grup List** untuk broadcast:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'job_add_gl_select:(.+)'))
    @auth_required
    async def job_add_gl_select_callback(event):
        sender_id = event.sender_id
        gl_id = decode_param(event.pattern_match.group(1))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)
        state["group_list_id"] = gl_id
        state["step"] = "select_text_mode"
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        from app.bot.keyboards import job_mode_select_keyboard
        keyboard = job_mode_select_keyboard()
        await event.edit(
            "📢 **Buat Broadcast Baru (Langkah 3/4)**\n\n"
            "Pilih **Mode Teks** untuk pesan broadcast:",
            buttons=keyboard
        )

    # ── Step 3: Select Text Mode ──

    @client.on(events.CallbackQuery(pattern=r'job_add_mode_select:(.+)'))
    @auth_required
    async def job_add_mode_select_callback(event):
        sender_id = event.sender_id
        mode = decode_param(event.pattern_match.group(1))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)

        if mode == "template":
            state["mode"] = "multi_random"
            state["step"] = "select_text_list"
            await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

            text_lists = await get_user_text_lists(event.user.id)
            if not text_lists:
                await event.edit(
                    "📢 **Buat Broadcast Baru (Langkah 3/4)**\n\n"
                    "⚠️ Anda belum memiliki Template Pesan.\n"
                    "Silakan buat terlebih dahulu di menu **📄 Text Lists**.",
                    buttons=[
                        [Button.inline("🔙 Kembali ke Mode Teks", data="job_add_back_mode")],
                        [Button.inline("❌ Batal", data="job_add_cancel")]
                    ]
                )
                return

            keyboard = job_tl_select_keyboard(text_lists)
            await event.edit(
                "📢 **Buat Broadcast Baru (Langkah 3/4)**\n\n"
                "Pilih **Template Pesan** untuk broadcast:",
                buttons=keyboard
            )
        elif mode == "custom":
            state["mode"] = "single_text"
            state["step"] = "waiting_custom_text"
            await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

            await event.edit(
                "📢 **Buat Broadcast Baru (Langkah 3/4)**\n\n"
                "Silakan ketik dan kirimkan **Teks Custom** untuk pesan broadcast Anda:",
                buttons=[[Button.inline("❌ Batal", data="job_add_cancel")]]
            )

    @client.on(events.CallbackQuery(pattern=b'job_add_back_mode'))
    @auth_required
    async def job_add_back_mode_callback(event):
        sender_id = event.sender_id
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)
        state["step"] = "select_text_mode"
        state.pop("mode", None)
        state.pop("text_list_id", None)
        state.pop("custom_text", None)
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        keyboard = job_mode_select_keyboard()
        await event.edit(
            "📢 **Buat Broadcast Baru (Langkah 3/4)**\n\n"
            "Pilih **Mode Teks** untuk pesan broadcast:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'job_add_tl_select:(.+)'))
    @auth_required
    async def job_add_tl_select_callback(event):
        sender_id = event.sender_id
        tl_id = decode_param(event.pattern_match.group(1))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)
        state["text_list_id"] = tl_id
        state["step"] = "confirm"
        state["loop_enabled"] = True
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        await _show_confirmation(event, state)

    # ── Step 4: Confirmation ──

    async def _show_confirmation(event, state):
        """Helper to render the confirmation screen."""
        num_accounts = len(state.get("selected_account_ids", []))
        mode = state.get("mode", "single_text")
        loop_enabled = state.get("loop_enabled", True)

        # Fetch group list name
        gl_name = "?"
        gl_id = state.get("group_list_id")
        if gl_id:
            async with async_session_factory() as session:
                result = await session.execute(select(GroupList).where(GroupList.id == uuid.UUID(gl_id)))
                gl = result.scalar_one_or_none()
                if gl:
                    gl_name = gl.name

        if mode == "multi_random":
            tl_id = state.get("text_list_id")
            tl_name = "?"
            if tl_id:
                async with async_session_factory() as session:
                    result = await session.execute(select(TextList).where(TextList.id == uuid.UUID(tl_id)))
                    tl = result.scalar_one_or_none()
                    if tl:
                        tl_name = tl.name
            text_info = f"📄 Template: **{tl_name}**"
        else:
            custom_text = state.get("custom_text", "")
            preview = custom_text[:100] + "..." if len(custom_text) > 100 else custom_text
            text_info = f"✍️ Teks Custom:\n> {preview}"

        keyboard = job_confirm_keyboard(loop_enabled)
        await event.edit(
            f"📢 **Buat Broadcast Baru (Langkah 4/4 - Konfirmasi)**\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"• **Akun:** {num_accounts} akun\n"
            f"• **Target Grup:** {gl_name}\n"
            f"• {text_info}\n"
            f"• **Looping:** {'🟢 Aktif' if loop_enabled else '🔴 Nonaktif'}\n"
            f"• **Delay per Grup:** 3 detik\n"
            f"• **Delay Antar Siklus:** 70 detik\n\n"
            f"Klik **MULAI BROADCAST** untuk memulai:",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'job_add_confirm_toggle_loop:(.+)'))
    @auth_required
    async def job_add_confirm_toggle_loop_callback(event):
        sender_id = event.sender_id
        new_val = decode_param(event.pattern_match.group(1))
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)
        state["loop_enabled"] = (new_val == "1")
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))
        await _show_confirmation(event, state)

    @client.on(events.CallbackQuery(pattern=b'job_add_confirm_yes'))
    @auth_required
    async def job_add_confirm_yes_callback(event):
        sender_id = event.sender_id
        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            await event.answer("Sesi kadaluarsa.", alert=True)
            return
        state = json.loads(raw)

        # Extract parameters
        account_ids = state.get("selected_account_ids", [])
        group_list_id = state.get("group_list_id")
        mode = state.get("mode", "single_text")
        text_list_id = state.get("text_list_id") if mode == "multi_random" else None
        custom_text = state.get("custom_text") if mode == "single_text" else None
        loop_enabled = state.get("loop_enabled", True)

        # Clean state immediately
        await redis_client.delete(f"{REDIS_KEY}:{sender_id}")

        try:
            async with async_session_factory() as session:
                from app.models.user import User
                result = await session.execute(select(User).where(User.id == event.user.id))
                user = result.scalar_one_or_none()
                if not user:
                    await event.answer("User tidak ditemukan.", alert=True)
                    return

                job = await start_broadcast(
                    db=session,
                    user=user,
                    account_ids=account_ids,
                    group_list_id=group_list_id,
                    text_list_id=text_list_id,
                    mode=mode,
                    custom_text=custom_text,
                    delay_per_group=3,
                    delay_after_all=70,
                    loop_enabled=loop_enabled,
                )

            await event.edit(
                f"✅ **Broadcast Berhasil Dimulai!**\n\n"
                f"• **Job ID:** `{str(job.id)[:8]}...`\n"
                f"• **Akun:** {len(account_ids)} akun\n"
                f"• **Looping:** {'🟢 Aktif' if loop_enabled else '🔴 Nonaktif'}\n\n"
                f"Gunakan menu **📢 Broadcasts** untuk memantau progres.",
                buttons=[[Button.inline("📢 Lihat Daftar Broadcast", data="job_list_back")]]
            )

        except Exception as e:
            logger.error("Failed to start broadcast from bot: %s", e)
            await event.edit(
                f"❌ **Gagal Memulai Broadcast!**\n\n"
                f"Error: `{str(e)}`",
                buttons=[[Button.inline("📢 Kembali ke Broadcast", data="job_list_back")]]
            )

    # ── Cancel Creation ──

    @client.on(events.CallbackQuery(pattern=b'job_add_cancel'))
    @auth_required
    async def job_add_cancel_callback(event):
        sender_id = event.sender_id
        await redis_client.delete(f"{REDIS_KEY}:{sender_id}")

        jobs = await get_user_jobs(event.user.id)
        if jobs:
            keyboard = broadcasts_list_keyboard(jobs)
            await event.edit(
                "❌ **Pembuatan broadcast dibatalkan.**\n\n"
                "📢 **Daftar Pekerjaan Broadcast**\n"
                "Pilih salah satu job di bawah untuk melihat detail:",
                buttons=keyboard
            )
        else:
            await event.edit(
                "❌ **Pembuatan broadcast dibatalkan.**\n\n"
                "📢 **Broadcast Jobs**\n\n"
                "Belum ada riwayat broadcast job.",
                buttons=[[Button.inline("➕ Buat Broadcast Baru", data="job_add_start")]]
            )

    # ── Text Input Dispatcher for Custom Text ──

    @client.on(events.NewMessage())
    async def broadcast_creation_input_handler(event):
        sender_id = event.sender_id
        if sender_id is None or event.message.message.startswith('/'):
            return

        raw = await redis_client.get(f"{REDIS_KEY}:{sender_id}")
        if not raw:
            return

        state = json.loads(raw)
        step = state.get("step")

        if step != "waiting_custom_text":
            return

        # Fetch user
        from app.models.user import User
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()
        if not user or not user.is_active:
            return

        message_text = event.message.message.strip()
        if not message_text:
            await event.respond("❌ Teks tidak boleh kosong. Silakan kirimkan teks broadcast:")
            return

        state["custom_text"] = message_text
        state["step"] = "confirm"
        state["loop_enabled"] = True
        await redis_client.setex(f"{REDIS_KEY}:{sender_id}", 600, json.dumps(state))

        # Show confirmation - need to send new message since we can't edit the user's text message
        num_accounts = len(state.get("selected_account_ids", []))
        gl_name = "?"
        gl_id = state.get("group_list_id")
        if gl_id:
            async with async_session_factory() as session:
                result = await session.execute(select(GroupList).where(GroupList.id == uuid.UUID(gl_id)))
                gl = result.scalar_one_or_none()
                if gl:
                    gl_name = gl.name

        preview = message_text[:100] + "..." if len(message_text) > 100 else message_text
        loop_enabled = state.get("loop_enabled", True)
        keyboard = job_confirm_keyboard(loop_enabled)

        await event.respond(
            f"📢 **Buat Broadcast Baru (Langkah 4/4 - Konfirmasi)**\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"• **Akun:** {num_accounts} akun\n"
            f"• **Target Grup:** {gl_name}\n"
            f"• ✍️ Teks Custom:\n> {preview}\n"
            f"• **Looping:** {'🟢 Aktif' if loop_enabled else '🔴 Nonaktif'}\n"
            f"• **Delay per Grup:** 3 detik\n"
            f"• **Delay Antar Siklus:** 70 detik\n\n"
            f"Klik **MULAI BROADCAST** untuk memulai:",
            buttons=keyboard
        )

