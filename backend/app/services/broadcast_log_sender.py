import logging
from datetime import datetime
import html
from telethon import TelegramClient

logger = logging.getLogger(__name__)

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
            dest = "@teleboslogging_bot"
            
    if not dest or dest == "web_only":
        return
        
    try:
        from datetime import timezone
        end_time = datetime.now(timezone.utc)
        start_time = job.created_at # Approximate start time for cycle
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
            await client.send_message(target, text, parse_mode="html", link_preview=False)
    except Exception as exc:
        logger.warning(
            "Failed to send cycle %d log for job %s to %s: %s",
            cycle_number, job.id, dest, exc,
        )
