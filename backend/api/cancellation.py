from django.conf import settings
from django.core.cache import cache
from rest_framework.throttling import BaseThrottle

from .exceptions import Cancelled


def _key(request, request_id):
    return f"cancel:{BaseThrottle().get_ident(request)}:{request_id}"


def cancel(request, request_id):
    cache.set(_key(request, request_id), True, settings.CANCEL_FLAG_SECONDS)


def checker(request, request_id):
    if not request_id:
        return lambda: None

    key = _key(request, request_id)

    def check():
        if cache.get(key):
            raise Cancelled()

    return check
