from django.conf import settings
from rest_framework import serializers


class SummarizeRequestSerializer(serializers.Serializer):
    url = serializers.URLField(
        max_length=settings.SCRAPER_MAX_URL_LENGTH,
        error_messages={
            "required": "Please enter a URL.",
            "blank": "Please enter a URL.",
            "invalid": "That doesn't look like a valid URL. Example: https://example.com/article",
            "max_length": "That URL is too long.",
        },
    )

    # optional, one of the models from /api/health/. Empty = automatic order
    model = serializers.RegexField(
        r"^[A-Za-z0-9._:/-]+$",
        max_length=100,
        required=False,
        allow_blank=True,
        error_messages={"invalid": "That model name isn't valid."},
    )

    def to_internal_value(self, data):
        # let people paste "example.com" without the https://
        url = data.get("url") if hasattr(data, "get") else None
        if isinstance(url, str):
            url = url.strip()
            if url and "://" not in url:
                url = "https://" + url
            data = {"url": url, **({"model": data["model"]} if "model" in data else {})}
        return super().to_internal_value(data)


class FailedAttemptSerializer(serializers.Serializer):
    provider = serializers.CharField()
    model = serializers.CharField()
    error = serializers.CharField()


class SummarySerializer(serializers.Serializer):
    title = serializers.CharField()
    requested_model = serializers.CharField(allow_null=True)
    url = serializers.URLField()
    summary = serializers.CharField()
    provider = serializers.CharField()
    model = serializers.CharField()
    failed_attempts = FailedAttemptSerializer(many=True)
    char_count = serializers.IntegerField()
    word_count = serializers.IntegerField()
    truncated = serializers.BooleanField()
    took_seconds = serializers.FloatField()
