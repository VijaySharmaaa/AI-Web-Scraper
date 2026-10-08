import logging
import time

from django.conf import settings
from django.http import JsonResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import SummarizeRequestSerializer, SummarySerializer
from . import quota
from .exceptions import AIError
from .services.ai import available_models, summarize
from .services.scraper import scrape_page

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
            "usage": quota.usage(request),
            "limits": {
                "max_url_length": settings.SCRAPER_MAX_URL_LENGTH,
                "summaries_per_day": settings.SUMMARIES_PER_DAY or None,
            },
            "examples": settings.EXAMPLE_LINKS,
        })


class SummarizeView(APIView):

    throttle_scope = "summarize"

    def post(self, request):
        serializer = SummarizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        url = serializer.validated_data["url"]
        model = serializer.validated_data.get("model") or None

        if model and model not in {m["model"] for m in available_models()}:
            raise AIError(f"The model '{model}' isn't available on this server.", 400, "invalid_model")

        logger.info("Summarize request for %s (model: %s)", url, model or "auto")
        start = time.time()

        quota.reserve(request)
        try:
            page = scrape_page(url)
            ai = summarize(page, preferred_model=model)
        except Exception:
            quota.refund(request)
            raise

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
        })
        return Response({**result.data, "usage": quota.usage(request)}, status=status.HTTP_200_OK)


def api_not_found(request, *args, **kwargs):
    return JsonResponse({"error": "API endpoint not found"}, status=404)
