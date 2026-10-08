# AI Web Scraper

Paste a webpage URL, the backend scrapes the main text from it, sends it to a free AI
model, and you get a short summary back (a TL;DR plus key points).

**Live demo:** _add your Render URL here after deploying_

## Features

- **Clean, responsive UI**: React + TypeScript, Tailwind CSS and shadcn/ui components. Two columns on wide
  screens (results + a sidebar with history and "how it works"), one column on phones
- **Themes**: light / dark / system mode and shadcn's base colors (Neutral, Zinc, Stone, Slate, Gray)
  from the palette button in the header. Neutral is the default
- **Pick the AI model**: a picker inside the search box, like a chat composer: Auto (best available)
  or any model the server has a key for. Models your key can't use are hidden automatically. If the
  picked model is busy, the next one answers and the result says so
- **Real cancel**: Cancel (or Esc) stops the work on the server too, between steps, and gives the
  daily try back
- **Every state handled**: loading steps with a cancel button, specific error messages (site blocked,
  page not found, not a web page, JavaScript-only page, rate limits...) with "Try again" / "Edit URL"
  actions, and banners when you're offline, the server is down or has no AI key
- **History with consent**: the first visit asks before saving anything. With "Allow" your last
  summaries are kept in the browser, with "No thanks" only until the tab is closed.
  "Storage settings" in the footer changes the answer
- **Copy or download as PDF**: the PDF has the title, link, model, date and the summary.
  Pages in other alphabets use the browser's "Save as PDF" so every character comes out right
- **Daily limit**: a configurable number of summaries per visitor per day (3 on the live demo).
  Failed or cancelled attempts don't count. A ring next to the model name shows the tries left
- **Colored hover states**: red for remove / clear / cancel, green for the main actions, blue for the rest
- **Secure by default**: SSRF protection, rate limiting, security headers, CSP (see [Security](#security))
- **Configurable**: limits, timeouts, models, URLs and the AI prompt all come from environment variables

## About shadcn/ui

shadcn/ui is not an API and not a runtime library. Its CLI copies the source of each component into
the project (`frontend/src/components/ui/`), so the app owns that code and nothing is fetched from
shadcn at runtime. The components are built on [Radix UI](https://www.radix-ui.com/) primitives
(the real dependency, for accessibility and keyboard handling) and styled with Tailwind. Only the
components that are used are included: button, input, card, alert, badge, skeleton, separator,
tooltip, popover, select, alert dialog, spinner and the sonner toaster.

## Tech stack

| Part      | Tech |
|-----------|------|
| Frontend  | React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix) with its color themes, lucide icons, sonner toasts |
| Backend   | Python, Django 5.2 + Django REST Framework |
| Scraping  | `httpx` to download the page, `BeautifulSoup` to pull out the text |
| AI        | Google Gemini free-tier text models (3.8 / 3.7 / 3.6 / 3.5 / 3 / 2.5 Flash and 3.5 / 3.1 / 2.5 Flash Lite) with Groq (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) as fallback |
| Tests     | Django test runner (backend), Vitest + Testing Library (frontend) |
| Hosting   | Render (one web service: Django serves the API **and** the built React app) |

## How it works

1. You paste a URL and click **Summarize**. The frontend checks the URL first and shows a "Loading..." card.
2. The frontend calls `POST /api/summarize/` with `{"url": "..."}`.
3. A DRF serializer validates the URL (and adds `https://` if you left it out).
4. The scraper checks the address is a public website, downloads the HTML (max 5 MB, 30 s), removes
   scripts / nav / footer etc., and keeps the text from `<article>` or `<main>` (falls back to `<body>`).
   The text is cut at 15,000 characters.
5. The text goes to the first AI model. If it's rate limited, down, retired or returns nothing,
   the next model is tried, and so on.
6. The summary, the model that wrote it and some stats go back to the frontend, which renders the markdown.

## Project structure

```
AI-Web-Scraper/
├── backend/                     # Django + DRF
│   ├── .env.example             # copy this to backend/.env and add your key(s)
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py          # security settings, rate limits, CORS...
│   │   ├── middleware.py        # Content-Security-Policy and other headers
│   │   └── urls.py
│   └── api/
│       ├── views.py             # SummarizeView, HealthView
│       ├── serializers.py       # request / response serializers
│       ├── exceptions.py        # ScrapeError, AIError + JSON error handler
│       ├── urls.py
│       ├── quota.py             # summaries per day
│       ├── tests.py
│       ├── prompts/summary.txt  # instructions for the AI
│       └── services/
│           ├── scraper.py       # safe download + text extraction
│           └── ai.py            # Gemini / Groq calls with fallback
├── frontend/                    # React + TypeScript (Vite)
│   ├── components.json          # shadcn/ui config
│   └── src/
│       ├── App.tsx              # page layout + state
│       ├── components/          # url form, loading / error / summary cards, history...
│       ├── components/ui/       # shadcn/ui components
│       ├── hooks/               # theme, online status, countdown...
│       └── lib/                 # api client, url checks, error messages, history
├── build.sh                     # build script for Render
└── render.yaml                  # Render deploy config
```

## Running it locally

### Requirements

- Python 3.10+
- Node.js 20+
- At least one free AI API key:
  - **Gemini**: <https://aistudio.google.com/app/apikey> (sign in with Google, click **Create API key**)
  - **Groq** (optional fallback): <https://console.groq.com/keys>

### 1. Clone

```bash
git clone https://github.com/VijaySharmaaa/AI-Web-Scraper.git
cd AI-Web-Scraper
```

### 2. Backend (Django), runs on http://127.0.0.1:8000

```bash
cd backend
python -m venv .venv

# activate the venv
source .venv/bin/activate        # mac / linux
# .venv\Scripts\Activate.ps1     # windows powershell

pip install -r requirements.txt
```

**The `.env` file goes in the `backend/` folder.** Copy the example file and add your key(s):

```bash
cp .env.example .env             # windows: copy .env.example .env
```

`backend/.env` should look like this (one key is enough, both gives you a fallback):

```
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
DJANGO_DEBUG=True
```

Start the server:

```bash
python manage.py runserver
```

Check it's working: open <http://127.0.0.1:8000/api/health/>. You should see `"ai_ready": true`
and the list of models it will try.

> There are no database models, so you don't need to run `migrate`.

### 3. Frontend (React), runs on http://localhost:5173

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite forwards every `/api/...` request to the Django server on
port 8000 (see `vite.config.ts`), so both need to be running.

### Running the tests

```bash
# backend
cd backend
python manage.py test

# frontend
cd frontend
npm test
```

### Adding more shadcn/ui components

The project is set up for the shadcn CLI, e.g. `npx shadcn@latest add dropdown-menu`.

## API

### `POST /api/summarize/`

Request:

```json
{ "url": "https://en.wikipedia.org/wiki/Web_scraping", "model": "llama-3.3-70b-versatile" }
```

`model` is optional. Leave it out (or send `""`) for automatic choice; otherwise it must be one of
the models from `/api/health/`. The chosen model is tried first and the others stay as fallback.

Response `200`:

```json
{
  "title": "Web scraping - Wikipedia",
  "url": "https://en.wikipedia.org/wiki/Web_scraping",
  "summary": "**TL;DR:** ...\n\n**Key points:**\n- ...",
  "provider": "Groq",
  "model": "llama-3.3-70b-versatile",
  "failed_attempts": [
    { "provider": "Google Gemini", "model": "gemini-flash-latest", "error": "rate limited / quota used up" }
  ],
  "requested_model": "gemini-flash-latest",
  "char_count": 24311,
  "word_count": 4120,
  "truncated": true,
  "took_seconds": 4.3,
  "usage": { "limit": 3, "used": 1, "remaining": 2, "resets_at": "2026-10-09T00:00:00+00:00" }
}
```

Errors always look like `{ "error": "message for the user", "code": "dns_not_found" }`.
Rate limit errors also include `retry_after` (seconds).

| Status | Example codes |
|--------|---------------|
| 400 | `validation_error`, `invalid_url`, `private_address` |
| 415 | `not_html` |
| 422 | `dns_not_found`, `site_blocked`, `page_not_found`, `no_text`, `ai_refused` |
| 400 | `invalid_model` |
| 429 | `daily_limit` (summaries per day used up, with `resets_at`), `throttled` (too many requests per minute), `ai_quota` (AI free tier used up) |
| 502 / 504 | `site_unreachable`, `site_error`, `site_timeout`, `ai_failed` |
| 503 | `ai_not_configured`, `ai_bad_key` |

### `POST /api/summarize/cancel/`

Body `{ "request_id": "..." }`, the same id sent with `/api/summarize/`. The running request stops at
its next step and the daily try is given back. Returns `202`. A visitor can only cancel their own requests.

### `GET /api/health/`

Returns whether AI is set up, the models in fallback order (with their provider), your usage for
today, the limits the frontend should use and the example links. Never returns API keys.

## Performance

Measured on the production build served by Django:

| | Before | After |
|---|---|---|
| Data downloaded on first visit | 503 KB | 129 KB (brotli / gzip, made at build time) |
| Repeat visits | most files again | hashed files cached for a year, React in its own long-lived chunk |
| `/api/health/` calls on load | 2 (in dev) | 1 (shared in-flight request) |
| Health check while 4 summaries run | 8.9 s (2 sync workers busy) | 0.005 s (gunicorn threads) |
| Parsing a 1.6 MB page | 0.27 s (`html.parser`) | 0.18 s (`lxml`) |

Other details: the markdown renderer and the PDF library are only downloaded when needed, AI calls
reuse open connections, the list of Gemini models a key can use is cached for an hour, and the dev
server (`npm run dev`) shows many requests because Vite serves every source file separately there.
That's normal for development and doesn't happen in the built app.

## Security

- **SSRF protection**: only `http`/`https` on normal ports, no `user:pass@` URLs. The hostname is
  resolved and every IP must be public, so `localhost`, `10.x`, `192.168.x`, `169.254.169.254`
  (cloud metadata) etc. are blocked. The request then connects to that **same checked IP**
  (with TLS still verified against the real hostname), so DNS rebinding can't sneak past the check.
  Every redirect is checked again.
- **Resource limits**: max 5 MB download, 30 s total for the page, 75 s total for the AI,
  10 KB request bodies, at most 5 redirects.
- **Rate limiting**: a daily limit (3 per IP on the live demo) and 10 requests per minute per IP, both
  configurable and shared between workers.
- **Headers**: Content-Security-Policy (no inline scripts), `X-Frame-Options: DENY`, `nosniff`,
  Referrer-Policy, Permissions-Policy, HTTPS redirect + HSTS when deployed.
- **CORS**: closed by default (the app is same-origin), only opened for origins you list.
- **AI output**: the page text is marked as untrusted in the prompt (prompt injection), markdown is
  rendered without raw HTML, and links open with `rel="noopener noreferrer nofollow"`.
- **Secrets**: keys only live in `backend/.env` / Render env vars. Error messages from Google/Groq are
  logged on the server but never sent to the browser.
- **Dependencies**: checked with `pip-audit` and `npm audit` (no known vulnerabilities).

## Deploying (Render)

The repo includes `render.yaml`, so deploying is mostly clicking buttons:

1. Push the repo to GitHub.
2. On <https://dashboard.render.com> click **New > Blueprint** and pick this repo.
3. When it asks for `GEMINI_API_KEY` / `GROQ_API_KEY`, paste your key(s). Leave one empty if you
   only have one. The other env vars are set automatically.
4. Wait for the build (`build.sh` builds the React app and installs the Python packages).
   Django then serves both the API and the frontend from the same URL, so there's no CORS setup.

Note: the free Render plan sleeps after 15 minutes without traffic, so the first request after
that can take around 30 seconds (the app shows a "Can't reach the server" banner with a retry button meanwhile).

The live demo allows 3 summaries per visitor per day (`SUMMARIES_PER_DAY` in `render.yaml`).

## Configuration

Nothing is hardcoded: every limit, timeout, URL and model list has a default that can be changed with
an environment variable. Locally they go in `backend/.env` (all of them are listed with their defaults
in [`backend/.env.example`](backend/.env.example)), on Render in the dashboard.

The most useful ones:

| Variable | Default | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` / `GROQ_API_KEY` | - | at least one is needed |
| `GEMINI_MODELS` / `GROQ_MODELS` | see `.env.example` | models to offer, in fallback order |
| `GEMINI_CHECK_MODELS` | `True` | hide Gemini models the key can't use (checked hourly) |
| `WEB_CONCURRENCY` / `GUNICORN_THREADS` | `2` / `8` | gunicorn workers and threads per worker |
| `SUMMARIES_PER_DAY` | `0` (unlimited) | per visitor IP, resets at midnight UTC. `3` on Render |
| `THROTTLE_SUMMARIZE` | `10/min` | burst limit per IP |
| `SCRAPER_MAX_TEXT_CHARS` | `15000` | how much page text is sent to the AI |
| `SCRAPER_TOTAL_TIME_LIMIT` / `AI_TOTAL_TIME_LIMIT` | `30` / `75` | seconds |
| `AI_PROMPT_FILE` | `api/prompts/summary.txt` | the instructions given to the AI |
| `EXAMPLE_LINKS` | 3 links | "label\|url" pairs separated by `;` |
| `DJANGO_DEBUG` | `False` | `True` for local development |
| `NUM_PROXIES` | `0` | proxies in front of the app (Render: `1`), for the real visitor IP |

The frontend reads `VITE_*` variables from `frontend/.env` (see
[`frontend/.env.example`](frontend/.env.example)): app name, API URL (only if hosted separately),
the GitHub link, request timeout and history size.

## Limitations

- It only reads the HTML the server sends back, so pages that build their content with JavaScript
  (some SPAs) won't have much text to summarize. The app tells you when that happens.
- Some sites (Cloudflare etc.) block scrapers and return 403.
- Very long pages are cut to 15,000 characters before being sent to the AI.
- Free AI tiers have per-minute limits. With both keys set, the fallback usually hides this.
