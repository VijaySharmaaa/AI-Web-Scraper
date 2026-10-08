import hashlib
import logging
import os
import re
import threading
import time
from functools import lru_cache

import httpx
from django.conf import settings
from django.core.cache import cache

from ..exceptions import AIError

logger = logging.getLogger(__name__)

RATE_LIMITED = "rate limited / quota used up"
OVERLOADED = "overloaded"
TIMED_OUT = "timed out"
SLOW_OR_BUSY = {RATE_LIMITED, OVERLOADED, TIMED_OUT}

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
    if code == 503:
        raise ModelFailed(OVERLOADED)
    if code >= 500:
        raise ModelFailed("service error")
    raise ModelFailed(f"request rejected (HTTP {code})")


def post(url, timeout, **kwargs):
    try:
        connect = min(settings.AI_CONNECT_TIMEOUT, timeout)
        return send("POST", url, timeout=httpx.Timeout(timeout, connect=connect), **kwargs)
    except httpx.TimeoutException:
        raise ModelFailed(TIMED_OUT) from None
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
    words = []
    for word in model.split("-"):
        if word in VERSION_WORDS or (word.isdigit() and len(word) >= 3):
            break
        words.append(word)
    return " ".join(w if any(c.isdigit() for c in w) and len(w) > 2 and not w[0].isdigit() else w.capitalize() for w in words)


def remember_labels(labels):
    known = cache.get("model-labels") or {}
    known.update(labels)
    cache.set("model-labels", known, settings.MODEL_CHECK_CACHE_SECONDS)


VERSION_WORDS = {"preview", "exp", "latest", "stable"}
OTHER_KIND_WORDS = {"lite", "tts", "image", "live", "audio", "native", "embedding", "transcribe", "computer", "omni"}


def is_version_of(name, candidate):
    if not candidate.startswith(f"{name}-"):
        return False
    words = candidate[len(name) + 1:].split("-")
    if OTHER_KIND_WORDS & set(words):
        return False
    return words[0] in VERSION_WORDS or words[0].isdigit()


def pick_version(candidates):
    def rank(model):
        unstable = any(w in model for w in ("preview", "exp"))
        return (unstable, [-int(p) if p.isdigit() else 0 for p in model.split("-")])

    return sorted(candidates, key=rank)[0]


def resolve_models(configured, available):
    resolved = []
    for name in configured:
        if name in available:
            match = name
        else:
            versions = [m for m in available if is_version_of(name, m)]
            match = pick_version(versions) if versions else None
        if match and match not in resolved:
            resolved.append(match)
    return resolved


def fetch_gemini_models(api_key):
    response = send(
        "GET",
        settings.GEMINI_LIST_MODELS_URL,
        params={"pageSize": 1000},
        headers={"x-goog-api-key": api_key},
        timeout=settings.AI_CONNECT_TIMEOUT,
    )
    response.raise_for_status()
    return {
        m.get("name", "").removeprefix("models/"): m.get("displayName") or ""
        for m in response.json().get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    }


def hidden_models():
    return cache.get("gemini-hidden-models") or []


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
        available = fetch_gemini_models(api_key)
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Could not check which Gemini models exist, using the configured list: %r", e)
        return configured

    models = resolve_models(configured, available)
    missing = [m for m in configured if not any(r == m or is_version_of(m, r) for r in models)]
    if missing:
        logger.warning("Gemini models not available for this key, hiding them: %s", ", ".join(missing))
        logger.info("Run 'python manage.py gemini_models' to see the exact model ids your key can use")
    cache.set("gemini-hidden-models", missing, settings.MODEL_CHECK_CACHE_SECONDS)
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


def unavailable_models():
    items = []
    for name, key_var, models, func in providers():
        if not os.getenv(key_var, "").strip():
            reason = "not set up on this server"
            missing = models
        elif func is call_gemini:
            reason = "not available for this API key"
            missing = [m for m in models if m in hidden_models()]
        else:
            continue
        items += [{"provider": name, "model": m, "label": model_label(m), "reason": reason} for m in missing]
    return items


LEADING_LABEL = re.compile(r"^\s*\**\s*(tl\s*;?\s*dr|summary|overview)\s*\**\s*:\s*\**\s*", re.IGNORECASE)


def tidy_summary(text):
    return LEADING_LABEL.sub("", text, count=1).strip()


def short_reason(reason):
    if reason in (RATE_LIMITED, OVERLOADED):
        return "busy"
    if reason == TIMED_OUT:
        return "too slow"
    return "unavailable"


def cool_down(model, reason):
    if reason in SLOW_OR_BUSY:
        cache.set(f"model-cooldown:{model}", reason, settings.AI_MODEL_COOLDOWN_SECONDS)


def is_cooling_down(model):
    return cache.get(f"model-cooldown:{model}") is not None


def healthy_first(chain):
    ready = [c for c in chain if not is_cooling_down(c[1])]
    resting = [c for c in chain if is_cooling_down(c[1])]
    if resting:
        logger.info("Trying these last, they were busy or slow a moment ago: %s", ", ".join(c[1] for c in resting))
    return ready + resting


def all_failed(attempts):
    messages = {a["user_message"] for a in attempts if a["user_message"]}
    if len(messages) == 1 and all(a["user_message"] for a in attempts):
        return AIError(messages.pop(), 422, "ai_refused")
    reasons = {a["error"] for a in attempts}
    if reasons and reasons <= {RATE_LIMITED, OVERLOADED}:
        return AIError("All AI models are busy right now. Please try again in a minute.", 429, "ai_quota")
    if reasons == {BAD_KEY}:
        logger.error("Every AI API key was rejected, check GEMINI_API_KEY / GROQ_API_KEY")
        return AIError("The AI service isn't set up correctly on this server.", 503, "ai_bad_key")
    return AIError("We couldn't reach any AI model right now. Please try again in a moment.", 502, "ai_failed")


def chosen_model_failed(attempt):
    label = model_label(attempt["model"])
    if attempt["user_message"]:
        return AIError(attempt["user_message"], 422, "ai_refused")
    if attempt["error"] in SLOW_OR_BUSY:
        return AIError(
            f"{label} is busy right now. Try again in a minute, pick another model, or switch to Auto.",
            429,
            "model_busy",
        )
    return AIError(
        f"{label} couldn't write a summary right now. Try again later, pick another model, or switch to Auto.",
        502,
        "model_failed",
    )


def model_chain(preferred_model=None):
    chain = configured_models()
    if not chain:
        logger.error("No AI API keys are set (GEMINI_API_KEY / GROQ_API_KEY)")
        raise AIError("Summaries aren't available yet: no AI service is set up on this server.", 503, "ai_not_configured")
    if preferred_model:
        chain = [c for c in chain if c[1] == preferred_model]
        if not chain:
            raise AIError(
                f"{model_label(preferred_model)} isn't available right now. Pick another model or use Auto.",
                400,
                "invalid_model",
            )
    return chain


def summarize_steps(page, preferred_model=None, check_cancelled=lambda: None):
    chain = model_chain(preferred_model)
    if not preferred_model:
        chain = healthy_first(chain)
    attempts = []
    deadline = time.monotonic() + settings.AI_TOTAL_TIME_LIMIT

    for provider, model, func, api_key in chain:
        check_cancelled()
        time_left = deadline - time.monotonic()
        if time_left < settings.AI_MIN_TIME_FOR_ATTEMPT:
            logger.warning("Out of time, not trying %s / %s", provider, model)
            attempts.append({"provider": provider, "model": model, "error": TIMED_OUT, "user_message": None})
            break

        if attempts:
            last = attempts[-1]
            yield {
                "type": "model_switch",
                "from_label": model_label(last["model"]),
                "reason": short_reason(last["error"]),
                "provider": provider,
                "model": model,
                "label": model_label(model),
            }
        else:
            yield {"type": "model", "provider": provider, "model": model, "label": model_label(model)}

        logger.info("Trying %s / %s", provider, model)
        try:
            text, cut_off = func(model, page, api_key, timeout=min(settings.AI_TIMEOUT, time_left))
        except ModelFailed as e:
            logger.warning("%s / %s failed: %s", provider, model, e.reason)
            attempts.append({"provider": provider, "model": model, "error": e.reason, "user_message": e.user_message})
            cool_down(model, e.reason)
            continue
        except (ValueError, KeyError, TypeError, IndexError):
            logger.exception("Bad response from %s / %s", provider, model)
            attempts.append({"provider": provider, "model": model, "error": "unexpected response", "user_message": None})
            continue

        text = tidy_summary(text)
        if cut_off:
            text += "\n\n_(the summary was cut off)_"
        logger.info("Got summary from %s / %s after %d failed attempt(s)", provider, model, len(attempts))
        yield {
            "type": "done",
            "result": {"summary": text, "provider": provider, "model": model, "model_label": model_label(model)},
        }
        return

    if preferred_model and attempts:
        raise chosen_model_failed(attempts[-1])
    raise all_failed(attempts)


def summarize(page, preferred_model=None, check_cancelled=lambda: None):
    for step in summarize_steps(page, preferred_model, check_cancelled):
        if step["type"] == "done":
            return step["result"]
    raise AIError("We couldn't reach any AI model right now. Please try again in a moment.", 502, "ai_failed")
