from django.conf import settings
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("api/", include("api.urls")),
]

# serve the react app for every other route (only if it has been built)
if (settings.FRONTEND_DIST / "index.html").exists():
    urlpatterns.append(re_path(r"^(?!api/).*$", TemplateView.as_view(template_name="index.html")))
