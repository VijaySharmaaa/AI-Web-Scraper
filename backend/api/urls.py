from django.urls import path

from .views import HealthView, SummarizeView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("summarize/", SummarizeView.as_view(), name="summarize"),
]
