from rest_framework import serializers


class SummarizeRequestSerializer(serializers.Serializer):
    url = serializers.URLField(max_length=2000)

    def to_internal_value(self, data):
        # let people paste "example.com" without the https://
        url = data.get("url") if isinstance(data, dict) else None
        if isinstance(url, str):
            url = url.strip()
            if url and not url.startswith(("http://", "https://")):
                url = "https://" + url
            data = {**data, "url": url}
        return super().to_internal_value(data)


class SummarySerializer(serializers.Serializer):
    title = serializers.CharField()
    url = serializers.URLField()
    summary = serializers.CharField()
    model = serializers.CharField()
    char_count = serializers.IntegerField()
    truncated = serializers.BooleanField()
    took_seconds = serializers.FloatField()
