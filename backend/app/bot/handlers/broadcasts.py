"""Telegram Bot handlers for managing broadcast jobs."""

import uuid
import logging
from telethon import events
from app.database import async_session_factory
from app.models.broadcast_job import BroadcastJob
from app.models.broadcast_log import BroadcastLog
from app.services.broadcast_service import (
    get_job,
    get_jobs_for_user,
    update_job_status,
    delete_job,
    retry_job
)
from sqlalchemy.future import select
from app.bot.keyboards import broadcasts_list_keyboard, broadcast_detail_keyboard
from app.bot.utils import auth_required, format_job_detail

logger = logging.getLogger(__name__)


def register_broadcasts_handlers(client):
    """Register broadcast management handlers to the Telethon client."""

    async def get_user_jobs(user_id):
        """Helper to fetch recent jobs belonging to a user."""
        async with async_session_factory() as session:
            return await get_jobs_for_user(session, str(user_id), limit=15)

    async def get_job_by_id(job_id, user_id):
        """Helper to fetch a specific job by ID and check user authorization."""
        async with async_session_factory() as session:
            return await get_job(session, job_id, str(user_id))

    # ── ReplyKeyboard Handler ──
    @client.on(events.NewMessage(pattern='📢 Broadcasts'))
    @auth_required
    async def broadcasts_menu_handler(event):
        jobs = await get_user_jobs(event.user.id)
        if not jobs:
            await event.respond(
                "📢 **Broadcast Jobs**\n\n"
                "Belum ada riwayat broadcast job. Silakan buat pekerjaan broadcast baru melalui website TeleBos."
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
        job_id = event.pattern_match.group(1).decode('utf-8')
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
        job_id = event.pattern_match.group(1).decode('utf-8')
        
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
        job_id = event.pattern_match.group(1).decode('utf-8')
        
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
        job_id = event.pattern_match.group(1).decode('utf-8')
        
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
        job_id = event.pattern_match.group(1).decode('utf-8')
        
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
        job_id = event.pattern_match.group(1).decode('utf-8')
        
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
        job_id = event.pattern_match.group(1).decode('utf-8')
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
