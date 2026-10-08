import logging
import os

import httpx

from ..exceptions import AIError

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def build_prompt(page):
    return f"""Summarize this web page in simple English.

Use this format (markdown):
**TL;DR:** one or two sentences

**Key points:**
- 3 to 6 short bullet points

Only use information from the text. Ignore menus, cookie banners and ads.

Title: {page['title']}
URL: {page['url']}

Text:
\"\"\"
{page['text']}
\"\"\"
"""


def summarize(page):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AIError("GEMINI_API_KEY is missing on the server (check backend/.env)", 500)

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    body = {
        "contents": [{"role": "user", "parts": [{"text": build_prompt(page)}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }

    logger.debug("Sending %d chars to %s", len(page["text"]), model)
    try:
        response = httpx.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": api_key},
            json=body,
            timeout=60,
        )
    except httpx.RequestError as e:
        logger.error("Gemini request failed: %r", e)
        raise AIError("Could not reach the Gemini API") from None

    try:
        data = response.json()
    except ValueError:
        data = {}

    if response.status_code == 429:
        raise AIError("Free AI quota used up for now, try again in a minute", 429)
    if response.status_code != 200:
        logger.error("Gemini returned %s: %s", response.status_code, data)
        msg = data.get("error", {}).get("message", f"HTTP {response.status_code}")
        raise AIError(f"Gemini API error: {msg}")

    try:
        parts = data["candidates"][0]["content"]["parts"]
        summary = "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError):
        logger.error("Unexpected Gemini response: %s", data)
        summary = ""

    if not summary:
        raise AIError("The AI didn't return a summary, try another page")

    logger.debug("Got summary (%d chars)", len(summary))
    return summary, model
