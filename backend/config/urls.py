from django.conf import settings
from django.urls import include, path, re_path
from django.views.decorators.cache import never_cache
from django.views.generic import TemplateView

urlpatterns = [
    path("api/", include("api.urls")),
]

if (settings.FRONTEND_DIST / "index.html").exists():
    urlpatterns.append(re_path(r"^(?!api/).*$", never_cache(TemplateView.as_view(template_name="index.html"))))
