from rest_framework import serializers

from .services.scraper import MAX_URL_LENGTH


class SummarizeRequestSerializer(serializers.Serializer):
    url = serializers.URLField(
        max_length=MAX_URL_LENGTH,
        error_messages={
            "required": "Please enter a URL.",
            "blank": "Please enter a URL.",
            "invalid": "That doesn't look like a valid URL. Example: https://example.com/article",
            "max_length": "That URL is too long.",
        },
    )

    def to_internal_value(self, data):
        # let people paste "example.com" without the https://
        url = data.get("url") if hasattr(data, "get") else None
        if isinstance(url, str):
            url = url.strip()
            if url and "://" not in url:
                url = "https://" + url
            data = {"url": url}
        return super().to_internal_value(data)


class FailedAttemptSerializer(serializers.Serializer):
    provider = serializers.CharField()
    model = serializers.CharField()
    error = serializers.CharField()


class SummarySerializer(serializers.Serializer):
    title = serializers.CharField()
    url = serializers.URLField()
    summary = serializers.CharField()
    provider = serializers.CharField()
    model = serializers.CharField()
    failed_attempts = FailedAttemptSerializer(many=True)
    char_count = serializers.IntegerField()
    word_count = serializers.IntegerField()
    truncated = serializers.BooleanField()
    took_seconds = serializers.FloatField()
