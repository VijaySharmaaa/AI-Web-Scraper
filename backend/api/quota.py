from datetime import datetime, time, timedelta, timezone

from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import BaseThrottle

from .exceptions import QuotaExceeded


def _now():
    return datetime.now(timezone.utc)


def _resets_at(now):
    return datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=timezone.utc)


def _key(request, now):
    return f"daily-quota:{now.date().isoformat()}:{BaseThrottle().get_ident(request)}"


def usage(request):
    limit = settings.SUMMARIES_PER_DAY
    if not limit:
        return None
    now = _now()
    used = min(cache.get(_key(request, now), 0), limit)
    return {
        "limit": limit,
        "used": used,
        "remaining": limit - used,
        "resets_at": _resets_at(now).isoformat(),
    }


def reserve(request):
    limit = settings.SUMMARIES_PER_DAY
    if not limit:
        return
    now = _now()
    key = _key(request, now)
    seconds_left = int((_resets_at(now) - now).total_seconds()) + 1

    cache.add(key, 0, timeout=seconds_left + 60)
    used = cache.incr(key)
    if used > limit:
        cache.decr(key)
        raise QuotaExceeded(
            f"You've used all {limit} summaries. You can summarize more after the reset.",
            wait=seconds_left,
            resets_at=_resets_at(now).isoformat(),
        )


def refund(request):
    if not settings.SUMMARIES_PER_DAY:
        return
    key = _key(request, _now())
    try:
        if cache.get(key, 0) > 0:
            cache.decr(key)
    except ValueError:
        pass
