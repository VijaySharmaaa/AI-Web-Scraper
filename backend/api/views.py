import logging
import os
import time

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import SummarizeRequestSerializer, SummarySerializer
from .services.ai import summarize
from .services.scraper import scrape_page

logger = logging.getLogger(__name__)


class HealthView(APIView):
    throttle_classes = []

    def get(self, request):
        return Response({"status": "ok", "ai_key_set": bool(os.getenv("GEMINI_API_KEY"))})


class SummarizeView(APIView):
    """
    POST /api/summarize/
    body: {"url": "https://example.com/article"}
    """

    def post(self, request):
        serializer = SummarizeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        url = serializer.validated_data["url"]

        logger.info("Summarize request for %s", url)
        start = time.time()

        page = scrape_page(url)
        summary, model = summarize(page)

        took = round(time.time() - start, 2)
        logger.info("Finished %s in %ss", url, took)

        result = SummarySerializer(
            {
                "title": page["title"],
                "url": page["url"],
                "summary": summary,
                "model": model,
                "char_count": page["char_count"],
                "truncated": page["truncated"],
                "took_seconds": took,
            }
        )
        return Response(result.data, status=status.HTTP_200_OK)
