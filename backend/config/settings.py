import logging
import os
import secrets
import tempfile
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


def env_int(name, default):
    return int(os.getenv(name, "").strip() or default)


def env_float(name, default):
    return float(os.getenv(name, "").strip() or default)


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        logging.getLogger(__name__).warning("DJANGO_SECRET_KEY not set, using a random one")
    SECRET_KEY = secrets.token_urlsafe(50)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

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

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIST],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    },
]

DATABASES = {}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None
WHITENOISE_IMMUTABLE_FILE_TEST = r"^/assets/.+-[A-Za-z0-9_-]{8,}\.\w+$"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": os.getenv("CACHE_DIR", os.path.join(tempfile.gettempdir(), "ai-web-scraper-cache")),
    }
}

DATA_UPLOAD_MAX_MEMORY_SIZE = env_int("MAX_REQUEST_BODY_BYTES", 10 * 1024)

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173" if DEBUG else "")
CORS_URLS_REGEX = r"^/api/.*$"
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

if env_bool("DJANGO_SECURE_HTTPS", bool(RENDER_HOST)):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
    SECURE_HSTS_SECONDS = env_int("DJANGO_HSTS_SECONDS", 60 * 60 * 24 * 30)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

SILENCED_SYSTEM_CHECKS = [
    "security.W003",
    "security.W021",
]

SUMMARIES_PER_DAY = env_int("SUMMARIES_PER_DAY", 0)
CANCEL_FLAG_SECONDS = env_int("CANCEL_FLAG_SECONDS", 600)

SCRAPER_MAX_URL_LENGTH = env_int("SCRAPER_MAX_URL_LENGTH", 2000)
SCRAPER_MAX_TEXT_CHARS = env_int("SCRAPER_MAX_TEXT_CHARS", 15000)
SCRAPER_MIN_TEXT_CHARS = env_int("SCRAPER_MIN_TEXT_CHARS", 50)
SCRAPER_MAX_DOWNLOAD_BYTES = env_int("SCRAPER_MAX_DOWNLOAD_BYTES", 20 * 1024 * 1024)
SCRAPER_MAX_IMAGE_BYTES = env_int("SCRAPER_MAX_IMAGE_BYTES", 10 * 1024 * 1024)
SCRAPER_MAX_PDF_PAGES = env_int("SCRAPER_MAX_PDF_PAGES", 60)
SCRAPER_BROWSER = os.getenv("SCRAPER_BROWSER", "auto").strip().lower()
SCRAPER_BROWSER_TIMEOUT = env_float("SCRAPER_BROWSER_TIMEOUT", 20)
SCRAPER_BROWSER_EXECUTABLE = os.getenv("SCRAPER_BROWSER_EXECUTABLE", "").strip()
SCRAPER_BROWSER_CONCURRENCY = env_int("SCRAPER_BROWSER_CONCURRENCY", 1)
SCRAPER_BROWSER_MAX_REQUESTS = env_int("SCRAPER_BROWSER_MAX_REQUESTS", 150)
SCRAPER_MAX_REDIRECTS = env_int("SCRAPER_MAX_REDIRECTS", 5)
SCRAPER_ALLOWED_PORTS = [int(p) for p in env_list("SCRAPER_ALLOWED_PORTS", "80,443,8080,8443")]
SCRAPER_TIMEOUT = env_float("SCRAPER_TIMEOUT", 15)
SCRAPER_CONNECT_TIMEOUT = env_float("SCRAPER_CONNECT_TIMEOUT", 8)
SCRAPER_TOTAL_TIME_LIMIT = env_float("SCRAPER_TOTAL_TIME_LIMIT", 30)
SCRAPER_USER_AGENT = os.getenv(
    "SCRAPER_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
)
SCRAPER_HTML_PARSER = os.getenv("SCRAPER_HTML_PARSER", "lxml")
SCRAPER_MAX_TITLE_CHARS = env_int("SCRAPER_MAX_TITLE_CHARS", 300)
SCRAPER_FALLBACK_MIN_CHARS = env_int("SCRAPER_FALLBACK_MIN_CHARS", 200)
SCRAPER_TEXT_TAGS = env_list("SCRAPER_TEXT_TAGS", "h1,h2,h3,h4,p,li,blockquote,pre,td")
SCRAPER_IGNORED_TAGS = env_list(
    "SCRAPER_IGNORED_TAGS",
    "script,style,noscript,iframe,svg,canvas,form,nav,header,footer,aside,button,template,dialog",
)

GEMINI_API_URL = os.getenv("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")
DEFAULT_GEMINI_MODELS = (
    "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash,gemini-2.5-flash,"
    "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite"
)
GEMINI_MODELS = env_list("GEMINI_MODELS", DEFAULT_GEMINI_MODELS)
PREFERRED_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip()
if PREFERRED_GEMINI_MODEL and not os.getenv("GEMINI_MODELS", "").strip():
    GEMINI_MODELS = [PREFERRED_GEMINI_MODEL] + [m for m in GEMINI_MODELS if m != PREFERRED_GEMINI_MODEL]
GEMINI_LIST_MODELS_URL = os.getenv("GEMINI_LIST_MODELS_URL", "https://generativelanguage.googleapis.com/v1beta/models")
GEMINI_CHECK_MODELS = env_bool("GEMINI_CHECK_MODELS", True)
MODEL_CHECK_CACHE_SECONDS = env_int("MODEL_CHECK_CACHE_SECONDS", 3600)
GROQ_MODELS = env_list("GROQ_MODELS", "llama-3.3-70b-versatile,llama-3.1-8b-instant")
AI_TIMEOUT = env_float("AI_TIMEOUT", 20)
AI_CONNECT_TIMEOUT = env_float("AI_CONNECT_TIMEOUT", 10)
AI_MAX_CONNECTIONS = env_int("AI_MAX_CONNECTIONS", 20)
AI_TOTAL_TIME_LIMIT = env_float("AI_TOTAL_TIME_LIMIT", 90)
AI_MODEL_COOLDOWN_SECONDS = env_int("AI_MODEL_COOLDOWN_SECONDS", 120)
AI_MIN_TIME_FOR_ATTEMPT = env_float("AI_MIN_TIME_FOR_ATTEMPT", 5)
AI_TEMPERATURE = env_float("AI_TEMPERATURE", 0.3)
GEMINI_MAX_OUTPUT_TOKENS = env_int("GEMINI_MAX_OUTPUT_TOKENS", 8192)
GROQ_MAX_OUTPUT_TOKENS = env_int("GROQ_MAX_OUTPUT_TOKENS", 1024)
AI_PROMPT_FILE = Path(os.getenv("AI_PROMPT_FILE", BASE_DIR / "api" / "prompts" / "summary.txt"))

EXAMPLE_LINKS = [
    {"label": label.strip(), "url": url.strip()}
    for label, _, url in (
        item.partition("|")
        for item in os.getenv(
            "EXAMPLE_LINKS",
            "Wikipedia: Web scraping|https://en.wikipedia.org/wiki/Web_scraping;"
            "Paul Graham essay|https://www.paulgraham.com/greatwork.html;"
            "MDN: HTTP|https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview",
        ).split(";")
        if item.strip()
    )
    if url.strip()
]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "api.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "120/min"),
        "summarize": os.getenv("THROTTLE_SUMMARIZE", "10/min"),
    },
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
