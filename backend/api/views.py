import logging
import time

from django.http import JsonResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import SummarizeRequestSerializer, SummarySerializer
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
            # only names, never the keys
            "providers": sorted({m["provider"] for m in models}),
            "models": [m["model"] for m in models],
            # same list with the provider of each model, for the model picker
            "model_options": models,
        })


class SummarizeView(APIView):
    """
    POST /api/summarize/
    body: {"url": "https://example.com/article"}
    """

    throttle_scope = "summarize"

    def post(self, request):
        serializer = SummarizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        url = serializer.validated_data["url"]
        model = serializer.validated_data.get("model") or None

        # check the model before spending time on scraping
        if model and model not in {m["model"] for m in available_models()}:
            raise AIError(f"The model '{model}' isn't available on this server.", 400, "invalid_model")

        logger.info("Summarize request for %s (model: %s)", url, model or "auto")
        start = time.time()

        page = scrape_page(url)
        ai = summarize(page, preferred_model=model)

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
        return Response(result.data, status=status.HTTP_200_OK)


def api_not_found(request, *args, **kwargs):
    return JsonResponse({"error": "API endpoint not found"}, status=404)
