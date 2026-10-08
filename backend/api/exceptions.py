import logging

from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ScrapeError(APIException):
    status_code = 400
    default_detail = "Could not scrape that page."

    def __init__(self, detail=None, status_code=None):
        super().__init__(detail)
        if status_code:
            self.status_code = status_code


class AIError(APIException):
    status_code = 502
    default_detail = "The AI service failed to summarize the page."

    def __init__(self, detail=None, status_code=None):
        super().__init__(detail)
        if status_code:
            self.status_code = status_code


def custom_exception_handler(exc, context):
    """Return every error as {"error": "message"} so the frontend only has to check one key."""
    response = exception_handler(exc, context)
    if response is None:
        # unhandled crash, DRF would turn this into an html 500 page
        logger.exception("Unhandled error in %s", context.get("view"))
        return None

    data = response.data
    if isinstance(data, dict) and "detail" in data:
        message = str(data["detail"])
    elif isinstance(data, dict):
        # serializer validation errors look like {"url": ["Enter a valid URL."]}
        field, errors = next(iter(data.items()))
        message = str(errors[0]) if isinstance(errors, list) else str(errors)
    else:
        message = str(data)

    logger.warning("Request failed (%s): %s", response.status_code, message)
    response.data = {"error": message}
    return response
