# AI Web Scraper

Paste a webpage URL, the backend scrapes the main text from it, sends it to a free AI
model, and you get a short summary back (a TL;DR plus key points).

**Live demo:** _add your Render URL here after deploying_

## Features

- **Clean, responsive UI**: React + TypeScript, Tailwind CSS and shadcn/ui components
- **Themes**: light / dark / system mode plus shadcn's base colors (Neutral, Zinc, Stone, Slate, Gray)
  from the palette button in the header. Neutral is the default. Your choice is remembered in the browser
- **Every state handled**: loading steps with a cancel button, specific error messages
  (site blocked, page not found, not a web page, JavaScript-only page, rate limits...) with
  "Try again" / "Edit URL" actions, an offline banner, and a banner when the server is down or has no AI key
- **AI fallback**: tries several free models in order (Gemini, then Groq / Llama) and shows
  which model wrote each summary, plus which ones failed before it
- **History**: your last 12 summaries are saved in the browser, so you can reopen them instantly
- **Copy** the summary, keyboard shortcuts (`/` or `Ctrl+K` to focus, `Esc` to cancel)
- **Secure by default**: SSRF protection, rate limiting, security headers, CSP (see [Security](#security))

## Tech stack

| Part      | Tech |
|-----------|------|
| Frontend  | React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix) with its color themes, lucide icons, sonner toasts |
| Backend   | Python, Django 5.2 + Django REST Framework |
| Scraping  | `httpx` to download the page, `BeautifulSoup` to pull out the text |
| AI        | Google Gemini (`gemini-flash-latest`, `gemini-flash-lite-latest`) with Groq (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) as fallback, all free tiers |
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
│       ├── tests.py
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
{ "url": "https://en.wikipedia.org/wiki/Web_scraping" }
```

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
  "char_count": 24311,
  "word_count": 4120,
  "truncated": true,
  "took_seconds": 4.3
}
```

Errors always look like `{ "error": "message for the user", "code": "dns_not_found" }`.
Rate limit errors also include `retry_after` (seconds).

| Status | Example codes |
|--------|---------------|
| 400 | `validation_error`, `invalid_url`, `private_address` |
| 415 | `not_html` |
| 422 | `dns_not_found`, `site_blocked`, `page_not_found`, `no_text`, `ai_refused` |
| 429 | `throttled` (our limit), `ai_quota` (AI free tier used up) |
| 502 / 504 | `site_unreachable`, `site_error`, `site_timeout`, `ai_failed` |
| 503 | `ai_not_configured`, `ai_bad_key` |

### `GET /api/health/`

Returns `{"status": "ok", "ai_ready": true, "providers": [...], "models": [...]}` (never the keys).

## Security

- **SSRF protection**: only `http`/`https` on normal ports, no `user:pass@` URLs. The hostname is
  resolved and every IP must be public, so `localhost`, `10.x`, `192.168.x`, `169.254.169.254`
  (cloud metadata) etc. are blocked. The request then connects to that **same checked IP**
  (with TLS still verified against the real hostname), so DNS rebinding can't sneak past the check.
  Every redirect is checked again.
- **Resource limits**: max 5 MB download, 30 s total for the page, 75 s total for the AI,
  10 KB request bodies, at most 5 redirects.
- **Rate limiting**: 10 summaries per minute per IP (configurable), shared between workers.
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

## Environment variables

All of these go in `backend/.env` locally, or in the Render dashboard when deployed.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `GEMINI_API_KEY` | one of the two | - | free key from Google AI Studio |
| `GROQ_API_KEY` | one of the two | - | free key from Groq, used as fallback |
| `GEMINI_MODELS` | no | `gemini-flash-latest,gemini-flash-lite-latest` | tried in this order |
| `GROQ_MODELS` | no | `llama-3.3-70b-versatile,llama-3.1-8b-instant` | tried after Gemini |
| `DJANGO_DEBUG` | no | `False` | set `True` for local development |
| `DJANGO_SECRET_KEY` | in prod | random | Render generates one |
| `DJANGO_ALLOWED_HOSTS` | no | `localhost,127.0.0.1` | comma separated (Render's host is added automatically) |
| `CORS_ALLOWED_ORIGINS` | no | localhost:5173 in debug | only if the frontend is on another domain |
| `THROTTLE_SUMMARIZE` | no | `10/min` | summaries per IP |
| `NUM_PROXIES` | no | `0` | proxies in front of the app (Render: `1`), for the real client IP |

The frontend only needs `VITE_API_URL` (in `frontend/.env`) if you host it separately from the backend.

## Limitations

- It only reads the HTML the server sends back, so pages that build their content with JavaScript
  (some SPAs) won't have much text to summarize. The app tells you when that happens.
- Some sites (Cloudflare etc.) block scrapers and return 403.
- Very long pages are cut to 15,000 characters before being sent to the AI.
- Free AI tiers have per-minute limits. With both keys set, the fallback usually hides this.
