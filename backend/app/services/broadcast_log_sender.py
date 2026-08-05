import logging
from datetime import datetime
import html
from telethon import TelegramClient

logger = logging.getLogger(__name__)

# Cache resolved log destinations per client to avoid repeated API calls
_resolved_dest_cache: dict[tuple[int, str], object] = {}


def _parse_dest(dest: str):
    """Parse a destination string into the form Telethon's send_message accepts."""
    if not dest:
        return None
    dest = dest.strip()
    if dest.startswith("https://t.me/"):
        dest = dest.split("/")[-1]
    
    if dest.startswith("@"):
        return dest
    if dest.lstrip("-").isdigit():
        return int(dest)
    return dest

def _format_cycle_summary(
    job_name: str,
    cycle_number: int,
    start_time: datetime,
    end_time: datetime,
    text_list_name: str | None,
    group_list_name: str | None,
    total_groups: int,
    active_this_round: int,
    cycle_logs: list,
    accounts_by_id: dict[str, str],
    item_type_by_identifier: dict[str, str],
) -> str:
    elapsed = end_time - start_time
    minutes, seconds = divmod(int(elapsed.total_seconds()), 60)
    duration_str = f"{minutes}m {seconds}s"

    success_count = sum(1 for log in cycle_logs if log.status == "success")
    error_count = sum(1 for log in cycle_logs if log.status == "error")

    lines = [
        f"<b>Broadcast Cycle #{cycle_number} 🚀</b>",
        "",
        "<blockquote>",
        f"<b>Job</b>: {html.escape(job_name)}",
        f"<b>Duration</b>: {duration_str}",
    ]

    if text_list_name:
        lines.append(f"<b>Text List</b>: {html.escape(text_list_name)}")
    if group_list_name:
        lines.append(f"<b>Group List</b>: {html.escape(group_list_name)}")

    lines.append(f"<b>Groups Total</b>: {total_groups} | <b>Active</b>: {active_this_round}")
    lines.append(f"<b>Sent</b>: ✅ {success_count}  |  <b>Failed</b>: ❌ {error_count}")
    lines.append("</blockquote>")

    # Separate success and failed
    success_logs = [log for log in cycle_logs if log.status == "success"]
    error_logs = [log for log in cycle_logs if log.status == "error"]

    if success_logs:
        lines.append("")
        lines.append("<b>Berhasil Terkirim</b>:")
        for log in success_logs:
            target_display = html.escape(log.group_identifier)
            lines.append(f"✅ {target_display}")

    if error_logs:
        lines.append("")
        lines.append("<b>Gagal Terkirim</b>:")
        for log in error_logs:
            target_display = html.escape(log.group_identifier)
            reason = html.escape(log.error_type or "Unknown Error")
            lines.append(f"❌ {target_display} — {reason}")

    return "\n".join(lines)


async def _resolve_dest_entity(client: TelegramClient, target, force_fresh: bool = False):
    """Resolve a destination to a Telethon entity, with bot /start fallback.

    Bots require the user to have /started them before messages can be sent.
    If the initial resolution fails (username not found in cache), we try
    get_entity first, and if that also fails for a bot username, we send
    /start to establish the dialog.
    """
    # Check module-level cache
    me = await client.get_me()
    cache_key = (me.id, str(target))
    if not force_fresh and cache_key in _resolved_dest_cache:
        return _resolved_dest_cache[cache_key]

    entity = None
    try:
        entity = await client.get_entity(target)
    except Exception:
        # If target looks like a bot username, try /start to create the dialog
        target_str = str(target).lstrip("@")
        if target_str.lower().endswith("bot") or target_str.endswith("_bot"):
            try:
                from telethon.tl.functions.contacts import ResolveUsernameRequest
                result = await client(ResolveUsernameRequest(target_str))
                if result.users:
                    entity = result.users[0]
                    # Send /start to establish dialog so future sends work
                    try:
                        await client.send_message(entity, "/start")
                        logger.info("Auto-started bot @%s for broadcast logging", target_str)
                    except Exception:
                        pass
            except Exception:
                pass

    if entity:
        _resolved_dest_cache[cache_key] = entity
    return entity


async def _send_message_safe(client: TelegramClient, target, message: str, **kwargs) -> None:
    """Send a message to target, handling peer resolution, bot /start, and caching.
    
    If the initial attempt fails due to invalid peer, it clears the cache,
    re-resolves the entity, sends /start (if it's a bot), and retries.
    """
    from telethon.errors import PeerIdInvalidError

    me = await client.get_me()
    cache_key = (me.id, str(target))
    
    # Try using cached entity first
    entity = _resolved_dest_cache.get(cache_key)
    
    if not entity:
        entity = await _resolve_dest_entity(client, target)
        
    if not entity:
        # Fallback to passing target directly to send_message, let Telethon handle it
        await client.send_message(target, message, **kwargs)
        return

    try:
        await client.send_message(entity, message, **kwargs)
    except (PeerIdInvalidError, ValueError) as exc:
        logger.info(
            "Failed to send to destination %s using cached/resolved entity. Clearing cache and retrying. Error: %s",
            target,
            exc,
        )
        # Clear cache and force re-resolution
        _resolved_dest_cache.pop(cache_key, None)
        
        # Re-resolve entity freshly
        entity = await _resolve_dest_entity(client, target, force_fresh=True)
        if not entity:
            # Fallback to passing target directly
            await client.send_message(target, message, **kwargs)
            return

        # If it's a bot, explicitly try to send /start first to establish dialog
        is_bot = getattr(entity, "bot", False)
        target_str = str(target).lstrip("@")
        if not is_bot and (target_str.lower().endswith("bot") or target_str.endswith("_bot")):
            is_bot = True

        if is_bot:
            try:
                await client.send_message(entity, "/start")
                logger.info("Sent /start to bot %s to establish dialog", target)
            except Exception as start_exc:
                logger.warning("Failed to send /start to bot %s: %s", target, start_exc)

        # Retry sending the message. Let any exception from this attempt propagate to the caller.
        await client.send_message(entity, message, **kwargs)


async def send_cycle_summary(
    client: TelegramClient,
    job,
    cycle_number: int,
    group_list_name: str,
    total_groups: int,
    active_this_round: int,
    cycle_logs: list,
    accounts_by_id: dict,
    item_type_by_identifier: dict,
    text_list_name: str | None = None,
) -> None:
    dest = job.log_destination
    if dest == "web_only":
        return
    if not dest:
        from app.config import get_settings
        try:
            settings = get_settings()
            dest = settings.BROADCAST_LOG_DEFAULT_DEST
        except Exception:
            return

    if not dest or dest == "web_only":
        return
    try:
        from datetime import timezone
        end_time = datetime.now(timezone.utc)
        start_time = job.created_at  # Approximate start time for cycle
        if cycle_logs:
            first_log = min(cycle_logs, key=lambda l: l.sent_at)
            start_time = first_log.sent_at
            
        # Extract account phone/name mappings
        accounts_map = {}
        for acc_id, acc in accounts_by_id.items():
            if acc:
                accounts_map[str(acc_id)] = acc.first_name or acc.phone
        
        text = _format_cycle_summary(
            job_name=f"Job {str(job.id)[:8]}",
            cycle_number=cycle_number,
            start_time=start_time,
            end_time=end_time,
            text_list_name=text_list_name,
            group_list_name=group_list_name,
            total_groups=total_groups,
            active_this_round=active_this_round,
            cycle_logs=cycle_logs,
            accounts_by_id=accounts_map,
            item_type_by_identifier=item_type_by_identifier,
        )
        target = _parse_dest(dest)
        if target:
            await _send_message_safe(client, target, text, parse_mode="html", link_preview=False)
    except Exception as exc:
        logger.warning(
            "Failed to send cycle %d log for job %s to %s: %s",
            cycle_number, job.id, dest, exc,
        )


async def send_job_log_message(
    client: TelegramClient,
    job,
    message: str,
) -> None:
    dest = job.log_destination
    if dest == "web_only":
        return
    if not dest:
        from app.config import get_settings
        try:
            settings = get_settings()
            dest = settings.BROADCAST_LOG_DEFAULT_DEST
        except Exception:
            return

    if not dest or dest == "web_only":
        return

    try:
        target = _parse_dest(dest)
        if target:
            await _send_message_safe(client, target, message)
    except Exception as exc:
        logger.warning("Failed to send log message to %s: %s", dest, exc)
