import logging

from rest_framework.exceptions import APIException, Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ScrapeError(APIException):
    status_code = 400
    default_detail = "Could not scrape that page."
    default_code = "scrape_error"

    def __init__(self, detail=None, status_code=None, code=None):
        super().__init__(detail)
        if status_code:
            self.status_code = status_code
        self.error_code = code or self.default_code


class AIError(APIException):
    status_code = 502
    default_detail = "The AI service failed to summarize the page."
    default_code = "ai_error"

    def __init__(self, detail=None, status_code=None, code=None):
        super().__init__(detail)
        if status_code:
            self.status_code = status_code
        self.error_code = code or self.default_code


class QuotaExceeded(APIException):
    status_code = 429
    default_detail = "Daily limit reached."
    default_code = "daily_limit"

    def __init__(self, detail=None, wait=None, resets_at=None):
        super().__init__(detail)
        self.wait = wait
        self.resets_at = resets_at
        self.error_code = self.default_code


def first_message(data):
    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])
        if data:
            return first_message(next(iter(data.values())))
    if isinstance(data, list) and data:
        return first_message(data[0])
    return str(data)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled error in %s", context.get("view"))
        return Response(
            {"error": "Something went wrong on our side. Please try again.", "code": "server_error"},
            status=500,
        )

    code = getattr(exc, "error_code", None) or getattr(exc, "default_code", "error")
    if isinstance(exc, QuotaExceeded):
        message = str(exc.detail)
        response.data = {"error": message, "code": "daily_limit", "retry_after": exc.wait, "resets_at": exc.resets_at}
        if exc.wait:
            response["Retry-After"] = str(exc.wait)
    elif isinstance(exc, Throttled):
        wait = int(exc.wait or 60)
        message = f"You're sending requests too fast. Please wait {wait} seconds and try again."
        response.data = {"error": message, "code": "throttled", "retry_after": wait}
    else:
        message = first_message(response.data)
        if code == "invalid":
            code = "validation_error"
        response.data = {"error": message, "code": code}

    logger.warning("Request failed (%s): %s", response.status_code, message)
    return response
