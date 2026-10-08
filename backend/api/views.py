import json
import logging
import time

from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView

from . import cancellation, quota
from .exceptions import Cancelled
from .serializers import CancelRequestSerializer, SummarizeRequestSerializer, SummarySerializer
from .services.ai import available_models, hidden_models, model_chain, summarize_steps, unavailable_models
from .services.scraper import precheck_url, scrape_page

logger = logging.getLogger(__name__)


class HealthView(APIView):
    throttle_classes = []

    def get(self, request):
        models = available_models()
        return Response({
            "status": "ok",
            "ai_ready": bool(models),
            "providers": sorted({m["provider"] for m in models}),
            "models": [m["model"] for m in models],
            "model_options": models,
            "hidden_models": hidden_models(),
            "unavailable_models": unavailable_models(),
            "usage": quota.usage(request),
            "limits": {
                "max_url_length": settings.SCRAPER_MAX_URL_LENGTH,
                "summaries_per_day": settings.SUMMARIES_PER_DAY or None,
            },
            "examples": settings.EXAMPLE_LINKS,
        })


def stream_line(event):
    return json.dumps(event, ensure_ascii=False) + "\n"


class SummarizeView(APIView):

    throttle_scope = "summarize"

    def post(self, request):
        serializer = SummarizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        url = serializer.validated_data["url"]
        model = serializer.validated_data.get("model") or None

        precheck_url(url)
        model_chain(model)
        check_cancelled = cancellation.checker(request, serializer.validated_data.get("request_id"))
        quota.reserve(request)

        logger.info("Summarize request for %s (model: %s)", url, model or "auto")
        response = StreamingHttpResponse(
            self.events(request, url, model, check_cancelled),
            content_type="application/x-ndjson",
        )
        response["X-Accel-Buffering"] = "no"
        return response

    def events(self, request, url, model, check_cancelled):
        start = time.time()
        try:
            check_cancelled()
            yield stream_line({"type": "step", "step": "fetching"})
            page = scrape_page(url, check_cancelled)
            yield stream_line({"type": "step", "step": "reading", "title": page["title"]})

            ai = None
            for step in summarize_steps(page, preferred_model=model, check_cancelled=check_cancelled):
                if step["type"] == "done":
                    ai = step["result"]
                else:
                    yield stream_line(step)
            check_cancelled()
        except APIException as e:
            quota.refund(request)
            if isinstance(e, Cancelled):
                logger.info("Cancelled by the user: %s", url)
            else:
                logger.warning("Summarize failed (%s): %s", e.status_code, e.detail)
            yield stream_line({
                "type": "error",
                "status": e.status_code,
                "code": getattr(e, "error_code", None) or e.default_code,
                "error": str(e.detail),
            })
            return
        except Exception:
            quota.refund(request)
            logger.exception("Unexpected error while summarizing %s", url)
            yield stream_line({
                "type": "error",
                "status": 500,
                "code": "server_error",
                "error": "Something went wrong on our side. Please try again.",
            })
            return

        took = round(time.time() - start, 2)
        logger.info("Finished %s in %ss using %s / %s", url, took, ai["provider"], ai["model"])
        result = SummarySerializer({
            "title": page["title"],
            "requested_model": model,
            "url": page["url"],
            "char_count": page["char_count"],
            "word_count": page["word_count"],
            "truncated": page["truncated"],
            "took_seconds": took,
            **ai,
        }).data
        yield stream_line({"type": "result", "result": {**result, "usage": quota.usage(request)}})


class CancelView(APIView):

    def post(self, request):
        serializer = CancelRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cancellation.cancel(request, serializer.validated_data["request_id"])
        return Response({"cancelled": True}, status=status.HTTP_202_ACCEPTED)


def api_not_found(request, *args, **kwargs):
    return JsonResponse({"error": "API endpoint not found"}, status=404)
