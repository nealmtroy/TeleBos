import logging
from datetime import datetime
import html
from telethon import TelegramClient

logger = logging.getLogger(__name__)

# Cache resolved log destinations per client to avoid repeated API calls
_resolved_dest_cache: dict[tuple[int, str], object] = {}
# Cache FloodWait expiration per client and target to prevent repetitive flood errors
_dest_flood_cooldown: dict[tuple[int, str], float] = {}


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
    if dest.startswith("+"):
        return dest
    # Automatically prepend @ for usernames
    return f"@{dest}"

def _get_val(obj, attr, default=None):
    """Retrieve attribute or dict key safely."""
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return getattr(obj, attr, default)


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

    success_count = sum(1 for log in cycle_logs if _get_val(log, "status") == "success")
    error_count = sum(1 for log in cycle_logs if _get_val(log, "status") == "error")

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
    success_logs = [log for log in cycle_logs if _get_val(log, "status") == "success"]
    error_logs = [log for log in cycle_logs if _get_val(log, "status") == "error"]

    MAX_LIST_DISPLAY = 25
    if success_logs:
        lines.append("")
        lines.append("<b>Berhasil Terkirim</b>:")
        for log in success_logs[:MAX_LIST_DISPLAY]:
            target_display = html.escape(str(_get_val(log, "group_identifier") or ""))
            lines.append(f"✅ {target_display}")
        if len(success_logs) > MAX_LIST_DISPLAY:
            lines.append(f"<i>... dan {len(success_logs) - MAX_LIST_DISPLAY} grup lainnya</i>")

    if error_logs:
        lines.append("")
        lines.append("<b>Gagal Terkirim</b>:")
        for log in error_logs[:MAX_LIST_DISPLAY]:
            target_display = html.escape(str(_get_val(log, "group_identifier") or ""))
            reason = html.escape(str(_get_val(log, "error_type") or "Unknown Error"))
            lines.append(f"❌ {target_display} — {reason}")
        if len(error_logs) > MAX_LIST_DISPLAY:
            lines.append(f"<i>... dan {len(error_logs) - MAX_LIST_DISPLAY} target gagal lainnya</i>")

    formatted = "\n".join(lines)
    # Telegram strict limit is 4096 characters
    if len(formatted) > 4000:
        formatted = formatted[:3900] + "\n\n<i>[Log dipotong karena batas karakter Telegram]</i>"
    return formatted


async def _send_message_safe(client: TelegramClient, target, message: str, **kwargs) -> None:
    """Send a message to target, starting a configured log bot when needed."""
    from telethon.errors import PeerIdInvalidError, YouBlockedUserError, FloodWaitError

    # Hard guard: Ensure message length does not exceed Telegram 4096 limit
    if len(message) > 4000:
        message = message[:3900] + "\n\n<i>[Log dipotong karena batas karakter Telegram]</i>"

    me = await client.get_me()
    cache_key = (me.id, str(target))

    import time
    now_ts = time.time()
    if cache_key in _dest_flood_cooldown and now_ts < _dest_flood_cooldown[cache_key]:
        return

    # Try using cached entity first
    entity = _resolved_dest_cache.get(cache_key)

    if not entity:
        try:
            entity = await client.get_entity(target)
            _resolved_dest_cache[cache_key] = entity
        except FloodWaitError as fw:
            _dest_flood_cooldown[cache_key] = now_ts + fw.seconds
            logger.warning(
                "FloodWait (%ds) resolving log destination %s for account %s. Skipping log dispatch for %ds.",
                fw.seconds, target, me.id, fw.seconds,
            )
            return
        except Exception:
            pass

    try:
        await client.send_message(entity or target, message, **kwargs)
    except FloodWaitError as fw:
        _dest_flood_cooldown[cache_key] = now_ts + fw.seconds
        logger.warning(
            "FloodWait (%ds) sending log message to %s for account %s. Skipping log dispatch for %ds.",
            fw.seconds, target, me.id, fw.seconds,
        )
        return
    except (PeerIdInvalidError, ValueError, YouBlockedUserError) as exc:
        _resolved_dest_cache.pop(cache_key, None)
        is_bot = bool(getattr(entity, "bot", False)) or str(target).lower().lstrip("@").endswith("bot")

        # If the target is blocked, attempt to unblock first
        if isinstance(exc, YouBlockedUserError) or "you blocked this user" in str(exc).lower():
            try:
                from telethon import functions
                await client(functions.contacts.UnblockRequest(id=entity or target))
                logger.info("Unblocked target %s to deliver log message", target)
            except Exception as unblock_err:
                logger.warning("Failed to unblock target %s: %s", target, unblock_err)
                raise exc

            # Attempt direct retry after unblocking
            try:
                await client.send_message(entity or target, message, **kwargs)
                return
            except FloodWaitError as fw:
                logger.warning("FloodWait (%ds) sending log after unblock. Skipping.", fw.seconds)
                return
            except Exception as retry_exc:
                if not is_bot:
                    raise retry_exc
                # If it's a bot and still fails, proceed to start sequence below

        if not is_bot:
            raise exc
        try:
            # Telegram only permits a user account to message a bot after it has
            # started that bot. Sending /start creates the required dialog.
            await client.send_message(target, "/start")
            logger.info("Started log bot %s, retrying cycle log delivery", target)
            entity = await client.get_entity(target)
            _resolved_dest_cache[cache_key] = entity
            await client.send_message(entity, message, **kwargs)
        except FloodWaitError as fw:
            logger.warning(
                "FloodWait (%ds) starting log bot %s for account %s. Skipping log delivery.",
                fw.seconds, target, me.id,
            )
            return
        except Exception as start_exc:
            logger.debug("Failed to start log bot %s: %s", target, start_exc)
            raise exc


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
            raw_sent_at = _get_val(cycle_logs[0], "sent_at")
            if isinstance(raw_sent_at, str):
                try:
                    start_time = datetime.fromisoformat(raw_sent_at)
                except Exception:
                    start_time = job.created_at
            elif isinstance(raw_sent_at, datetime):
                start_time = raw_sent_at
            
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
