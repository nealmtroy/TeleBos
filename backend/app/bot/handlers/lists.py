"""Telegram Bot handlers for managing Group Lists and Text Templates."""

import uuid
import logging
from telethon import events
from app.database import async_session_factory
from app.models.group_list import GroupList
from app.models.text_list import TextList
from sqlalchemy.future import select
from sqlalchemy import delete
from app.bot.keyboards import (
    group_lists_keyboard,
    group_list_detail_keyboard,
    group_list_delete_confirm_keyboard,
    text_lists_keyboard,
    text_list_detail_keyboard,
    text_list_delete_confirm_keyboard
)
from app.bot.utils import (
    auth_required,
    decode_param,
    format_group_lists_message,
    format_group_list_detail,
    format_text_lists_message,
    format_text_list_detail
)

logger = logging.getLogger(__name__)


def register_lists_handlers(client):
    """Register GroupList and TextList management handlers to the Telethon client."""

    # ── Helpers for Group Lists ──

    async def get_user_group_lists(user_id):
        """Helper to fetch all GroupLists belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(GroupList)
                .where(GroupList.user_id == user_id)
                .order_by(GroupList.created_at.desc())
            )
            return result.scalars().all()

    async def get_group_list_by_id(gl_id, user_id):
        """Helper to fetch a specific GroupList by ID and ensure it belongs to the user."""
        try:
            gl_uuid = uuid.UUID(gl_id)
        except ValueError:
            return None

        async with async_session_factory() as session:
            result = await session.execute(
                select(GroupList)
                .where(GroupList.id == gl_uuid)
                .where(GroupList.user_id == user_id)
            )
            return result.scalar_one_or_none()

    # ── Helpers for Text Lists ──

    async def get_user_text_lists(user_id):
        """Helper to fetch all TextLists belonging to a user."""
        async with async_session_factory() as session:
            result = await session.execute(
                select(TextList)
                .where(TextList.user_id == user_id)
                .order_by(TextList.created_at.desc())
            )
            return result.scalars().all()

    async def get_text_list_by_id(tl_id, user_id):
        """Helper to fetch a specific TextList by ID and ensure it belongs to the user."""
        try:
            tl_uuid = uuid.UUID(tl_id)
        except ValueError:
            return None

        async with async_session_factory() as session:
            result = await session.execute(
                select(TextList)
                .where(TextList.id == tl_uuid)
                .where(TextList.user_id == user_id)
            )
            return result.scalar_one_or_none()

    # ── Group Lists ReplyKeyboard & Callback Handlers ──

    @client.on(events.NewMessage(pattern='📁 Group Lists'))
    @auth_required
    async def group_lists_menu_handler(event):
        group_lists = await get_user_group_lists(event.user.id)
        page = 1
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        paginated_lists = group_lists[(page - 1) * limit : page * limit]

        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        await event.respond(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'gl_list_page:(\d+)'))
    @auth_required
    async def gl_list_page_handler(event):
        page = int(decode_param(event.pattern_match.group(1)))
        group_lists = await get_user_group_lists(event.user.id)
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = group_lists[(page - 1) * limit : page * limit]
        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'gl_list_back(?::(\d+))?'))
    @auth_required
    async def gl_list_back_handler(event):
        match = event.pattern_match.group(1)
        page = int(decode_param(match)) if match is not None else 1
        group_lists = await get_user_group_lists(event.user.id)
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = group_lists[(page - 1) * limit : page * limit]
        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'gl_refresh(?::(\d+))?'))
    @auth_required
    async def gl_refresh_handler(event):
        match = event.pattern_match.group(1)
        page = int(decode_param(match)) if match is not None else 1
        group_lists = await get_user_group_lists(event.user.id)
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = group_lists[(page - 1) * limit : page * limit]
        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'gl_detail:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def gl_detail_handler(event):
        gl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        gl = await get_group_list_by_id(gl_id, event.user.id)
        if not gl:
            await event.answer("List target grup tidak ditemukan.", alert=True)
            return

        detail_text = format_group_list_detail(gl)
        keyboard = group_list_detail_keyboard(gl.id, page)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'gl_delete_confirm:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def gl_delete_confirm_handler(event):
        gl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        gl = await get_group_list_by_id(gl_id, event.user.id)
        if not gl:
            await event.answer("List target grup tidak ditemukan.", alert=True)
            return

        keyboard = group_list_delete_confirm_keyboard(gl.id, page)
        await event.edit(
            f"⚠️ **Peringatan Penghapusan List!**\n\n"
            f"Apakah Anda yakin ingin menghapus list target grup **{gl.name}**?\n"
            f"Tindakan ini tidak dapat dibatalkan.",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'gl_delete_yes:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def gl_delete_yes_handler(event):
        gl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        async with async_session_factory() as session:
            gl_uuid = uuid.UUID(gl_id)
            result = await session.execute(
                select(GroupList)
                .where(GroupList.id == gl_uuid)
                .where(GroupList.user_id == event.user.id)
            )
            db_gl = result.scalar_one_or_none()

            if not db_gl:
                await event.answer("List tidak ditemukan.", alert=True)
                return

            try:
                await session.delete(db_gl)
                await session.commit()
                await event.answer("List target grup berhasil dihapus.", alert=True)
            except Exception as e:
                logger.error("Failed to delete group list in bot handler: %s", e)
                await event.answer(f"Gagal menghapus: {str(e)}", alert=True)

        # Redraw lists
        group_lists = await get_user_group_lists(event.user.id)
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = group_lists[(page - 1) * limit : page * limit]
        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)


    # ── Text Lists ReplyKeyboard & Callback Handlers ──

    @client.on(events.NewMessage(pattern='📄 Text Lists'))
    @auth_required
    async def text_lists_menu_handler(event):
        text_lists = await get_user_text_lists(event.user.id)
        page = 1
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        paginated_lists = text_lists[(page - 1) * limit : page * limit]

        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        await event.respond(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'tl_list_page:(\d+)'))
    @auth_required
    async def tl_list_page_handler(event):
        page = int(decode_param(event.pattern_match.group(1)))
        text_lists = await get_user_text_lists(event.user.id)
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = text_lists[(page - 1) * limit : page * limit]
        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'tl_list_back(?::(\d+))?'))
    @auth_required
    async def tl_list_back_handler(event):
        match = event.pattern_match.group(1)
        page = int(decode_param(match)) if match is not None else 1
        text_lists = await get_user_text_lists(event.user.id)
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = text_lists[(page - 1) * limit : page * limit]
        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'tl_refresh(?::(\d+))?'))
    @auth_required
    async def tl_refresh_handler(event):
        match = event.pattern_match.group(1)
        page = int(decode_param(match)) if match is not None else 1
        text_lists = await get_user_text_lists(event.user.id)
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = text_lists[(page - 1) * limit : page * limit]
        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        try:
            await event.edit(msg_text, buttons=keyboard)
        except Exception:
            await event.answer("Daftar sudah terbaru.")

    @client.on(events.CallbackQuery(pattern=r'tl_detail:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def tl_detail_handler(event):
        tl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        tl = await get_text_list_by_id(tl_id, event.user.id)
        if not tl:
            await event.answer("Template pesan tidak ditemukan.", alert=True)
            return

        detail_text = format_text_list_detail(tl)
        keyboard = text_list_detail_keyboard(tl.id, page)
        await event.edit(detail_text, buttons=keyboard)

    @client.on(events.CallbackQuery(pattern=r'tl_delete_confirm:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def tl_delete_confirm_handler(event):
        tl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        tl = await get_text_list_by_id(tl_id, event.user.id)
        if not tl:
            await event.answer("Template pesan tidak ditemukan.", alert=True)
            return

        keyboard = text_list_delete_confirm_keyboard(tl.id, page)
        await event.edit(
            f"⚠️ **Peringatan Penghapusan Template Pesan!**\n\n"
            f"Apakah Anda yakin ingin menghapus template pesan **{tl.name}**?\n"
            f"Tindakan ini tidak dapat dibatalkan.",
            buttons=keyboard
        )

    @client.on(events.CallbackQuery(pattern=r'tl_delete_yes:([a-fA-F0-9-]{36})(?::(\d+))?'))
    @auth_required
    async def tl_delete_yes_handler(event):
        tl_id = decode_param(event.pattern_match.group(1))
        match_page = event.pattern_match.group(2)
        page = int(decode_param(match_page)) if match_page is not None else 1

        async with async_session_factory() as session:
            tl_uuid = uuid.UUID(tl_id)
            result = await session.execute(
                select(TextList)
                .where(TextList.id == tl_uuid)
                .where(TextList.user_id == event.user.id)
            )
            db_tl = result.scalar_one_or_none()

            if not db_tl:
                await event.answer("Template pesan tidak ditemukan.", alert=True)
                return

            try:
                await session.delete(db_tl)
                await session.commit()
                await event.answer("Template pesan berhasil dihapus.", alert=True)
            except Exception as e:
                logger.error("Failed to delete text template in bot handler: %s", e)
                await event.answer(f"Gagal menghapus: {str(e)}", alert=True)

        # Redraw lists
        text_lists = await get_user_text_lists(event.user.id)
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        if page < 1:
            page = 1
        elif page > total_pages:
            page = total_pages

        paginated_lists = text_lists[(page - 1) * limit : page * limit]
        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        await event.edit(msg_text, buttons=keyboard)
