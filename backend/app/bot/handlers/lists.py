"""Telegram Bot handlers for managing Group Lists and Text Templates."""

import uuid
import logging
import json
import re
from telethon import events
from app.database import async_session_factory
from app.models.group_list import GroupList
from app.models.text_list import TextList
from app.models.user import User
from sqlalchemy.future import select
from sqlalchemy import delete
from app.utils.redis import redis_client
from app.bot.keyboards import (
    group_lists_keyboard,
    group_list_detail_keyboard,
    group_list_delete_confirm_keyboard,
    text_lists_keyboard,
    text_list_detail_keyboard,
    text_list_delete_confirm_keyboard,
    list_add_cancel_keyboard
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


    # ── Interactive Group List Creation ──

    @client.on(events.CallbackQuery(pattern=b'gl_add_start'))
    @auth_required
    async def gl_add_start_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return
        
        # Set state in Redis: waiting_name
        await redis_client.setex(f"bot_add_gl_state:{sender_id}", 300, json.dumps({"step": "waiting_name"}))
        
        await event.edit(
            "💬 **Tambah List Target Grup Baru (Langkah 1/2)**\n\n"
            "Silakan ketik dan kirimkan **Nama List** untuk grup target Anda:",
            buttons=list_add_cancel_keyboard("gl")
        )

    @client.on(events.CallbackQuery(pattern=b'gl_add_cancel'))
    @auth_required
    async def gl_add_cancel_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return
        
        # Delete state
        await redis_client.delete(f"bot_add_gl_state:{sender_id}")
        
        # Redraw Group Lists main page
        group_lists = await get_user_group_lists(event.user.id)
        page = 1
        limit = 10
        total_lists = len(group_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        paginated_lists = group_lists[(page - 1) * limit : page * limit]

        keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_group_lists_message(paginated_lists, page, total_pages)
        
        await event.edit(
            "❌ **Penambahan list dibatalkan.**\n\n" + msg_text,
            buttons=keyboard
        )

    # ── Interactive Text Template Creation ──

    @client.on(events.CallbackQuery(pattern=b'tl_add_start'))
    @auth_required
    async def tl_add_start_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return
        
        # Set state in Redis: waiting_name
        await redis_client.setex(f"bot_add_tl_state:{sender_id}", 300, json.dumps({"step": "waiting_name"}))
        
        await event.edit(
            "💬 **Tambah Template Pesan Baru (Langkah 1/2)**\n\n"
            "Silakan ketik dan kirimkan **Nama Template**:",
            buttons=list_add_cancel_keyboard("tl")
        )

    @client.on(events.CallbackQuery(pattern=b'tl_add_cancel'))
    @auth_required
    async def tl_add_cancel_callback(event):
        sender_id = event.sender_id
        if sender_id is None:
            return
        
        # Delete state
        await redis_client.delete(f"bot_add_tl_state:{sender_id}")
        
        # Redraw Text Lists main page
        text_lists = await get_user_text_lists(event.user.id)
        page = 1
        limit = 10
        total_lists = len(text_lists)
        total_pages = max((total_lists + limit - 1) // limit, 1)
        paginated_lists = text_lists[(page - 1) * limit : page * limit]

        keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
        msg_text = format_text_lists_message(paginated_lists, page, total_pages)
        
        await event.edit(
            "❌ **Penambahan template dibatalkan.**\n\n" + msg_text,
            buttons=keyboard
        )

    # ── General Input Dispatcher for Lists/Templates Creation ──

    @client.on(events.NewMessage())
    async def list_creation_input_handler(event):
        sender_id = event.sender_id
        if sender_id is None or event.message.message.startswith('/'):
            return

        gl_state_raw = await redis_client.get(f"bot_add_gl_state:{sender_id}")
        tl_state_raw = await redis_client.get(f"bot_add_tl_state:{sender_id}")

        if not gl_state_raw and not tl_state_raw:
            return

        # Fetch authenticated user
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.telegram_chat_id == sender_id)
            )
            user = result.scalar_one_or_none()

        if not user or not user.is_active:
            return

        # Handle Group List state machine
        if gl_state_raw:
            state = json.loads(gl_state_raw)
            step = state.get("step")
            message_text = event.message.message.strip()

            if step == "waiting_name":
                if not message_text:
                    await event.respond("❌ Nama list tidak boleh kosong. Silakan kirimkan nama list:")
                    return
                
                # Update state to waiting_targets
                await redis_client.setex(
                    f"bot_add_gl_state:{sender_id}",
                    300,
                    json.dumps({"step": "waiting_targets", "name": message_text})
                )
                await event.respond(
                    f"💬 **Nama List:** `{message_text}`\n\n"
                    f"Sekarang silakan kirimkan **Target Grup/Channel** (satu target per baris).\n\n"
                    f"Target bisa berupa:\n"
                    f"• Username (contoh: `@groupname`)\n"
                    f"• Invite Link (contoh: `https://t.me/joinchat/...` atau `https://t.me/+...`)\n"
                    f"• Group ID (contoh: `-100123456789`)",
                    buttons=list_add_cancel_keyboard("gl")
                )
                return

            elif step == "waiting_targets":
                name = state.get("name")
                lines = message_text.split('\n')
                items = []
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Parse target
                    if line.startswith("-") or line.isdigit():
                        items.append({"type": "group_id", "value": line})
                    elif "t.me/" in line or "telegram.dog/" in line:
                        items.append({"type": "link", "value": line})
                    elif line.startswith("@"):
                        items.append({"type": "username", "value": line})
                    elif len(line) >= 4 and not line.startswith("http"):
                        if all(c.isalnum() or c == '_' for c in line):
                            items.append({"type": "username", "value": f"@{line}"})
                        else:
                            items.append({"type": "username", "value": line})
                    elif line.startswith("http"):
                        items.append({"type": "link", "value": line})
                    else:
                        items.append({"type": "username", "value": line})

                if not items:
                    await event.respond(
                        "❌ Target grup tidak valid atau kosong. "
                        "Silakan kirimkan setidaknya satu target grup yang valid:",
                        buttons=list_add_cancel_keyboard("gl")
                    )
                    return

                # Create in Database
                async with async_session_factory() as session:
                    new_gl = GroupList(user_id=user.id, name=name, items=items)
                    session.add(new_gl)
                    await session.commit()

                # Clean state
                await redis_client.delete(f"bot_add_gl_state:{sender_id}")

                # Redraw menu
                group_lists = await get_user_group_lists(user.id)
                page = 1
                limit = 10
                total_lists = len(group_lists)
                total_pages = max((total_lists + limit - 1) // limit, 1)
                paginated_lists = group_lists[(page - 1) * limit : page * limit]

                keyboard = group_lists_keyboard(paginated_lists, page, total_pages)
                
                await event.respond(
                    f"✅ **List Target Grup Berhasil Ditambahkan!**\n\n"
                    f"• **Nama:** {name}\n"
                    f"• **Jumlah Target:** {len(items)} grup/channel\n\n"
                    f"Gunakan keyboard di bawah untuk mengelola target grup Anda:",
                    buttons=keyboard
                )
                return

        # Handle Text Template state machine
        if tl_state_raw:
            state = json.loads(tl_state_raw)
            step = state.get("step")
            message_text = event.message.message.strip()

            if step == "waiting_name":
                if not message_text:
                    await event.respond("❌ Nama template tidak boleh kosong. Silakan kirimkan nama template:")
                    return
                
                # Update state to waiting_texts
                await redis_client.setex(
                    f"bot_add_tl_state:{sender_id}",
                    300,
                    json.dumps({"step": "waiting_texts", "name": message_text})
                )
                await event.respond(
                    f"💬 **Nama Template:** `{message_text}`\n\n"
                    f"Sekarang silakan kirimkan **Pesan Template** Anda.\n\n"
                    f"__Catatan:__ Anda dapat mengirimkan beberapa variasi pesan sekaligus. "
                    f"Gunakan pemisah `---` (tiga tanda minus) di baris tersendiri untuk memisahkan variasi.",
                    buttons=list_add_cancel_keyboard("tl")
                )
                return

            elif step == "waiting_texts":
                name = state.get("name")
                
                # Split variations by lines with exactly '---'
                parts = re.split(r'\n---\n|\n---$', message_text)
                variations = [p.strip() for p in parts if p.strip()]

                # Fallback if splitting fails or no --- is found but there is text
                if not variations and message_text:
                    variations = [message_text]

                if not variations:
                    await event.respond(
                        "❌ Isi template tidak boleh kosong. Silakan kirimkan pesan template Anda:",
                        buttons=list_add_cancel_keyboard("tl")
                    )
                    return

                # Create in Database
                async with async_session_factory() as session:
                    new_tl = TextList(user_id=user.id, name=name, texts=variations)
                    session.add(new_tl)
                    await session.commit()

                # Clean state
                await redis_client.delete(f"bot_add_tl_state:{sender_id}")

                # Redraw menu
                text_lists = await get_user_text_lists(user.id)
                page = 1
                limit = 10
                total_lists = len(text_lists)
                total_pages = max((total_lists + limit - 1) // limit, 1)
                paginated_lists = text_lists[(page - 1) * limit : page * limit]

                keyboard = text_lists_keyboard(paginated_lists, page, total_pages)
                
                await event.respond(
                    f"✅ **Template Pesan Berhasil Ditambahkan!**\n\n"
                    f"• **Nama:** {name}\n"
                    f"• **Jumlah Variasi:** {len(variations)} pesan\n\n"
                    f"Gunakan keyboard di bawah untuk mengelola template pesan Anda:",
                    buttons=keyboard
                )
                return
