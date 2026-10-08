from django.urls import path, re_path

from .views import HealthView, SummarizeView, api_not_found

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("summarize/", SummarizeView.as_view(), name="summarize"),
    re_path(r"^.*$", api_not_found),
]
