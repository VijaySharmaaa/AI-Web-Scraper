import os

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.services.ai import fetch_gemini_models, is_version_of, resolve_models


class Command(BaseCommand):
    help = "List the Gemini models your API key can use and which ones the app shows"

    def handle(self, *args, **options):
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            raise CommandError("GEMINI_API_KEY is not set (add it to backend/.env)")

        try:
            available = fetch_gemini_models(api_key)
        except (httpx.HTTPError, ValueError) as e:
            raise CommandError(f"Could not reach the Gemini API: {e!r}") from None

        shown = resolve_models(settings.GEMINI_MODELS, available)
        self.stdout.write(f"\nYour key can use {len(available)} text models:\n")
        for model in sorted(available):
            mark = "shown " if model in shown else "      "
            self.stdout.write(f"  {mark} {model:45s} {available[model]}")

        self.stdout.write("\nConfigured in GEMINI_MODELS:")
        for name in settings.GEMINI_MODELS:
            match = next((m for m in shown if m == name or is_version_of(name, m)), None)
            status = f"-> {match}" if match else "NOT FOUND, hidden"
            self.stdout.write(f"  {name:30s} {status}")

        self.stdout.write("\nTo use other ids, set GEMINI_MODELS in backend/.env (comma separated) and restart the server.\n")
