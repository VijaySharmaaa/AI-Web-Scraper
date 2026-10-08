# AI Web Scraper

Paste a link and get a short AI summary of it: an overview plus the key points. Works with web pages,
PDFs, Word files, images, text, Markdown, CSV, JSON and RSS/Atom feeds.

This is the production branch: application code and deploy config only.

## Stack

- **Frontend**: React + TypeScript (Vite), Tailwind CSS, shadcn/ui
- **Backend**: Django + Django REST Framework, `httpx` + BeautifulSoup for scraping, `pypdf` / `python-docx` for files
- **AI**: Google Gemini, with Groq as a fallback
- **Hosting**: Vercel (static React build + Django as a Python function under `/api`)

## Deploying on Vercel

1. Import the repo at <https://vercel.com/new> and pick this branch as the production branch.
   Leave **Root Directory** as the repo root and the framework as **Other**; the build settings come
   from `vercel.json`.
2. Add the environment variables:

   | Variable | Value |
   |----------|-------|
   | `GEMINI_API_KEY` / `GROQ_API_KEY` | at least one |
   | `DJANGO_SECRET_KEY` | a long random string |
   | `SUMMARIES_PER_DAY` | `3` |
   | `REDIS_URL` | a `rediss://` URL, e.g. Upstash from the Vercel Marketplace |
   | `DJANGO_ALLOWED_HOSTS` | only for a custom domain, `*.vercel.app` is allowed automatically |

3. Deploy.

`REDIS_URL` keeps the daily limit and cancel working across function instances. Without it the app
still works, the daily limit just isn't strict.

## Configuration

Every limit, timeout and model list has a default that can be changed with an environment variable.

| Variable | Default | Notes |
|----------|---------|-------|
| `GEMINI_MODELS` / `GROQ_MODELS` | built-in lists | models to offer, in fallback order |
| `GEMINI_CHECK_MODELS` | `True` | hide Gemini models the key can't use (checked hourly) |
| `SUMMARIES_PER_DAY` | `0` (unlimited) | per visitor IP, resets at midnight UTC |
| `THROTTLE_SUMMARIZE` | `10/min` | burst limit per IP |
| `SCRAPER_MAX_TEXT_CHARS` | `15000` | how much text is sent to the AI |
| `SCRAPER_MAX_DOWNLOAD_BYTES` / `SCRAPER_MAX_IMAGE_BYTES` | `20 MB` / `10 MB` | biggest file / image it will read |
| `SCRAPER_MAX_PDF_PAGES` | `60` | pages read from a PDF |
| `SCRAPER_TOTAL_TIME_LIMIT` / `AI_TOTAL_TIME_LIMIT` | `30` / `90` | seconds |
| `AI_TIMEOUT` | `20` | seconds one model gets before Auto moves on |
| `AI_MODEL_COOLDOWN_SECONDS` | `120` | a busy or slow model is tried last for this long |
| `EXAMPLE_LINKS` | 3 links | "label\|url" pairs separated by `;` |
| `NUM_PROXIES` | `0` (`1` on Vercel) | proxies in front of the app, for the real visitor IP |

The frontend reads the `VITE_*` variables listed in `frontend/.env.example` at build time.

## Running locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py runserver
```

Add your key(s) to `backend/.env` and set `DJANGO_DEBUG=True` there. In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.
