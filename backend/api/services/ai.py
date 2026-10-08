import hashlib
import logging
import os
import threading
import time
from functools import lru_cache

import httpx
from django.conf import settings
from django.core.cache import cache

from ..exceptions import AIError

logger = logging.getLogger(__name__)

RATE_LIMITED = "rate limited / quota used up"

_client = None
_client_lock = threading.Lock()


def http_client():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                limits = httpx.Limits(
                    max_connections=settings.AI_MAX_CONNECTIONS,
                    max_keepalive_connections=settings.AI_MAX_CONNECTIONS,
                )
                _client = httpx.Client(limits=limits, timeout=settings.AI_TIMEOUT)
    return _client


def send(method, url, **kwargs):
    return http_client().request(method, url, **kwargs)
BAD_KEY = "API key rejected"


class ModelFailed(Exception):
    def __init__(self, reason, user_message=None):
        super().__init__(reason)
        self.reason = reason
        self.user_message = user_message


@lru_cache(maxsize=4)
def read_prompt(path):
    return path.read_text(encoding="utf-8").strip()


def system_prompt():
    return read_prompt(settings.AI_PROMPT_FILE)


def build_prompt(page):
    return f"""Title: {page['title']}
URL: {page['url']}

<page_text>
{page['text']}
</page_text>"""


def check_status(response, provider):
    if response.status_code == 200:
        return
    logger.warning("%s returned %s: %s", provider, response.status_code, response.text[:500])
    code = response.status_code
    if code == 429:
        raise ModelFailed(RATE_LIMITED)
    if code in (401, 403):
        raise ModelFailed(BAD_KEY)
    if code == 404:
        raise ModelFailed("model not found (maybe retired)")
    if code == 413:
        raise ModelFailed("page too long for this model")
    if code >= 500:
        raise ModelFailed("service error")
    raise ModelFailed(f"request rejected (HTTP {code})")


def post(url, timeout, **kwargs):
    try:
        connect = min(settings.AI_CONNECT_TIMEOUT, timeout)
        return send("POST", url, timeout=httpx.Timeout(timeout, connect=connect), **kwargs)
    except httpx.TimeoutException:
        raise ModelFailed("timed out") from None
    except httpx.HTTPError as e:
        logger.warning("Request to %s failed: %r", url, e)
        raise ModelFailed("could not connect") from None


def call_gemini(model, page, api_key, timeout):
    body = {
        "system_instruction": {"parts": [{"text": system_prompt()}]},
        "contents": [{"role": "user", "parts": [{"text": build_prompt(page)}]}],
        "generationConfig": {
            "temperature": settings.AI_TEMPERATURE,
            "maxOutputTokens": settings.GEMINI_MAX_OUTPUT_TOKENS,
        },
    }
    url = settings.GEMINI_API_URL.format(model=model)
    response = post(url, timeout, headers={"x-goog-api-key": api_key}, json=body)
    check_status(response, "Gemini")

    data = response.json()
    candidate = (data.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
    finish = candidate.get("finishReason")
    logger.debug("Gemini %s finishReason=%s", model, finish)

    if not text:
        blocked = (data.get("promptFeedback") or {}).get("blockReason")
        if blocked or finish in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"):
            raise ModelFailed("blocked by safety filter", "The AI refused to summarize this page because of its content.")
        raise ModelFailed("empty response")
    return text, finish == "MAX_TOKENS"


def call_groq(model, page, api_key, timeout):
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt()},
            {"role": "user", "content": build_prompt(page)},
        ],
        "temperature": settings.AI_TEMPERATURE,
        "max_tokens": settings.GROQ_MAX_OUTPUT_TOKENS,
    }
    response = post(settings.GROQ_API_URL, timeout, headers={"Authorization": f"Bearer {api_key}"}, json=body)
    check_status(response, "Groq")

    choice = (response.json().get("choices") or [{}])[0]
    text = ((choice.get("message") or {}).get("content") or "").strip()
    if not text:
        raise ModelFailed("empty response")
    return text, choice.get("finish_reason") == "length"


def model_label(model):
    labels = cache.get("model-labels") or {}
    if model in labels:
        return labels[model]
    words = model.replace("-preview", "").split("-")
    return " ".join(w if any(c.isdigit() for c in w) and len(w) > 2 and not w[0].isdigit() else w.capitalize() for w in words)


def remember_labels(labels):
    known = cache.get("model-labels") or {}
    known.update(labels)
    cache.set("model-labels", known, settings.MODEL_CHECK_CACHE_SECONDS)


def resolve_models(configured, available):
    resolved = []
    for name in configured:
        for candidate in (name, f"{name}-preview"):
            if candidate in available and candidate not in resolved:
                resolved.append(candidate)
                break
    return resolved


def gemini_models_for_key(api_key):
    configured = settings.GEMINI_MODELS
    if not settings.GEMINI_CHECK_MODELS:
        return configured

    key_id = hashlib.sha256(api_key.encode()).hexdigest()[:16]
    cache_key = f"gemini-models:{key_id}:{','.join(configured)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        response = send(
            "GET",
            settings.GEMINI_LIST_MODELS_URL,
            params={"pageSize": 1000},
            headers={"x-goog-api-key": api_key},
            timeout=settings.AI_CONNECT_TIMEOUT,
        )
        response.raise_for_status()
        available = {
            m.get("name", "").removeprefix("models/"): m.get("displayName") or ""
            for m in response.json().get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        }
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Could not check which Gemini models exist, using the configured list: %r", e)
        return configured

    models = resolve_models(configured, available)
    missing = [m for m in configured if m not in models and f"{m}-preview" not in models]
    if missing:
        logger.warning("Gemini models not available for this key, hiding them: %s", ", ".join(missing))
    remember_labels({m: available[m] for m in models if available[m]})
    cache.set(cache_key, models, settings.MODEL_CHECK_CACHE_SECONDS)
    return models


def providers():
    return [
        ("Google Gemini", "GEMINI_API_KEY", settings.GEMINI_MODELS, call_gemini),
        ("Groq", "GROQ_API_KEY", settings.GROQ_MODELS, call_groq),
    ]


def configured_models():
    chain = []
    for name, key_var, models, func in providers():
        api_key = os.getenv(key_var, "").strip()
        if not api_key:
            continue
        if func is call_gemini:
            models = gemini_models_for_key(api_key)
        chain += [(name, model, func, api_key) for model in models]
    return chain


def available_models():
    return [
        {"provider": provider, "model": model, "label": model_label(model)}
        for provider, model, *_ in configured_models()
    ]


def all_failed(attempts):
    messages = {a["user_message"] for a in attempts if a["user_message"]}
    if len(messages) == 1 and all(a["user_message"] for a in attempts):
        return AIError(messages.pop(), 422, "ai_refused")
    reasons = {a["error"] for a in attempts}
    if reasons == {RATE_LIMITED}:
        return AIError("All AI models are out of free quota right now. Wait a minute and try again.", 429, "ai_quota")
    if reasons == {BAD_KEY}:
        return AIError("The server's AI API keys are invalid. If you run this app, check backend/.env", 503, "ai_bad_key")
    return AIError(f"All {len(attempts)} AI models failed to answer. Please try again in a moment.", 502, "ai_failed")


def summarize(page, preferred_model=None, check_cancelled=lambda: None):
    chain = configured_models()
    if preferred_model:
        chosen = [c for c in chain if c[1] == preferred_model]
        if not chosen:
            raise AIError(f"The model '{preferred_model}' isn't available on this server.", 400, "invalid_model")
        chain = chosen + [c for c in chain if c[1] != preferred_model]
    if not chain:
        logger.error("No AI API keys are set (GEMINI_API_KEY / GROQ_API_KEY)")
        raise AIError(
            "The server has no AI API key set up. If you run this app, add GEMINI_API_KEY or GROQ_API_KEY to backend/.env",
            503,
            "ai_not_configured",
        )

    attempts = []
    deadline = time.monotonic() + settings.AI_TOTAL_TIME_LIMIT
    for provider, model, func, api_key in chain:
        check_cancelled()
        time_left = deadline - time.monotonic()
        if time_left < settings.AI_MIN_TIME_FOR_ATTEMPT:
            logger.warning("Out of time, not trying %s / %s", provider, model)
            attempts.append({"provider": provider, "model": model, "error": "skipped, out of time", "user_message": None})
            continue

        logger.info("Trying %s / %s", provider, model)
        try:
            text, cut_off = func(model, page, api_key, timeout=min(settings.AI_TIMEOUT, time_left))
        except ModelFailed as e:
            logger.warning("%s / %s failed: %s", provider, model, e.reason)
            attempts.append({"provider": provider, "model": model, "error": e.reason, "user_message": e.user_message})
            continue
        except (ValueError, KeyError, TypeError, IndexError):
            logger.exception("Bad response from %s / %s", provider, model)
            attempts.append({"provider": provider, "model": model, "error": "unexpected response", "user_message": None})
            continue

        if cut_off:
            text += "\n\n_(the summary was cut off)_"
        logger.info("Got summary from %s / %s after %d failed attempt(s)", provider, model, len(attempts))
        failed = [{k: a[k] for k in ("provider", "model", "error")} for a in attempts]
        return {
            "summary": text,
            "provider": provider,
            "model": model,
            "model_label": model_label(model),
            "failed_attempts": failed,
        }

    raise all_failed(attempts)
