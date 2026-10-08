"""
Django settings for the AI Web Scraper backend.
"""

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# the .env file lives in backend/.env
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        # the app has no logins or sessions, so a random key per start is fine
        logging.getLogger(__name__).warning("DJANGO_SECRET_KEY not set, using a random one")
    SECRET_KEY = secrets.token_urlsafe(50)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Render sets this automatically
RENDER_HOST = os.getenv("RENDER_EXTERNAL_HOSTNAME")
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "config.middleware.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# the built react app (frontend/dist) is served by django in production
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIST],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    },
]

# no models in this project, so no database needed
DATABASES = {}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# serves frontend/dist/assets/* etc. from the site root
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# the api only accepts small json bodies
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024

# --- CORS ---
# in production the frontend is served from the same domain, so no CORS is needed.
# set CORS_ALLOWED_ORIGINS only if the frontend is hosted somewhere else.
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173" if DEBUG else ""
)
CORS_URLS_REGEX = r"^/api/.*$"
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]

# --- security headers ---
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# force https only when deployed (Render sets RENDER_EXTERNAL_HOSTNAME),
# otherwise `runserver` on http://localhost would redirect to https and break
if env_bool("DJANGO_SECURE_HTTPS", bool(RENDER_HOST)):
    # Render (and most hosts) terminate https at a proxy and pass this header
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]  # health checks come over plain http
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    # no logins in this app, so no auth (and no csrf, since there are no cookies)
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
    # the AI apis are free but rate limited, so don't let one person spam them
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "120/min"),
        "summarize": os.getenv("THROTTLE_SUMMARIZE", "10/min"),
    },
    # how many proxies sit in front of the app. Render has 1, which makes DRF
    # use the real client ip from X-Forwarded-For instead of the proxy's ip.
    # 0 = use REMOTE_ADDR directly (local dev), so the header can't be faked.
    "NUM_PROXIES": int(os.getenv("NUM_PROXIES", "0")),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "loggers": {
        "api": {"handlers": ["console"], "level": "DEBUG" if DEBUG else "INFO"},
        "django.request": {"handlers": ["console"], "level": "WARNING"},
    },
}
