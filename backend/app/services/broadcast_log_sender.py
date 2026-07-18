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


async def _resolve_dest_entity(client: TelegramClient, target):
    """Resolve a destination to a Telethon entity, with bot /start fallback.

    Bots require the user to have /started them before messages can be sent.
    If the initial resolution fails (username not found in cache), we try
    get_entity first, and if that also fails for a bot username, we send
    /start to establish the dialog.
    """
    # Check module-level cache
    me = await client.get_me()
    cache_key = (me.id, str(target))
    if cache_key in _resolved_dest_cache:
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
            # Resolve entity first (handles bot /start if needed)
            entity = await _resolve_dest_entity(client, target)
            if entity:
                await client.send_message(entity, text, parse_mode="html", link_preview=False)
            else:
                logger.warning(
                    "Could not resolve log destination %s — broadcasting account may need to /start the bot first",
                    dest,
                )
    except Exception as exc:
        logger.warning(
            "Failed to send cycle %d log for job %s to %s: %s",
            cycle_number, job.id, dest, exc,
        )
