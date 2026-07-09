"""Messaging schedule — verify if the current time is within allowed sending hours."""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

# Python weekday() → day key  (0=Mon … 6=Sun)
_WEEKDAY_KEY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


async def is_messaging_allowed(db: AsyncSession) -> bool:
    """Return True if the current local time falls within the configured schedule.

    Returns True (unrestricted) when:
    - No schedule is saved in SystemConfig, OR
    - Schedule has enabled=False (feature toggled off)
    """
    from app.modules.admin.models import SystemConfig

    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_messaging_schedule")
    )
    row = result.scalar_one_or_none()

    if not row or not row.value:
        return True

    config = row.value
    if not config.get("enabled", True):
        return True

    tz_name = config.get("timezone", settings.FIRM_TIMEZONE)
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        tz = ZoneInfo("America/Sao_Paulo")

    now = datetime.now(tz)

    # --- Holiday check ---
    today_str = now.strftime("%Y-%m-%d")
    if today_str in config.get("holidays", []):
        return False

    # --- Weekly schedule check ---
    day_key = _WEEKDAY_KEY[now.weekday()]
    allowed_slots = config.get("allowed_slots", {})

    if day_key not in allowed_slots:
        return True  # Day not configured → unrestricted

    return now.hour in allowed_slots[day_key]


async def next_allowed_window(db: AsyncSession) -> str | None:
    """Return a human-readable string of the next allowed window, or None if unrestricted."""
    from app.modules.admin.models import SystemConfig

    result = await db.execute(
        select(SystemConfig).where(SystemConfig.key == "lead_messaging_schedule")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return None

    config = row.value
    if not config.get("enabled", True):
        return None

    tz_name = config.get("timezone", settings.FIRM_TIMEZONE)
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/Sao_Paulo")

    allowed_slots = config.get("allowed_slots", {})
    now = datetime.now(tz)

    # Look up to 7 days ahead for the next window
    for day_offset in range(8):
        from datetime import timedelta
        candidate = now + timedelta(days=day_offset)
        day_key = _WEEKDAY_KEY[candidate.weekday()]
        hours = sorted(allowed_slots.get(day_key, []))
        if not hours:
            continue
        if day_offset == 0:
            future_hours = [h for h in hours if h > now.hour]
        else:
            future_hours = hours

        if future_hours:
            start_h = future_hours[0]
            label = candidate.strftime("%A") if day_offset > 0 else "hoje"
            return f"{label} às {start_h:02d}h"

    return None
