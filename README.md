# AI Web Scraper

Paste a webpage URL, the backend scrapes the main text from it and sends it to
Google Gemini (free tier), and you get a short summary back.

**Live demo:** _add your Render URL here after deploying_

## Tech stack

| Part      | Tech |
|-----------|------|
| Frontend  | React 19 + TypeScript, built with Vite |
| Backend   | Python, Django 5 + Django REST Framework |
| Scraping  | `httpx` to download the page, `BeautifulSoup` to pull out the text |
| AI        | Google Gemini API (`gemini-2.5-flash`, free tier) |
| Hosting   | Render (one web service: Django serves the API **and** the built React app) |

## How it works

1. You paste a URL in the React app and click **Summarize** (a "Loading..." card shows while it works).
2. The frontend calls `POST /api/summarize/` with `{"url": "..."}`.
3. A DRF serializer validates the URL (and adds `https://` if you left it out).
4. The scraper downloads the HTML, removes scripts / nav / footer etc., and keeps the
   text from `<article>` or `<main>` (falls back to `<body>`). The text is cut at 15,000 characters.
5. That text is sent to Gemini with a prompt asking for a TL;DR plus a few bullet points.
6. The summary goes back to the frontend and is rendered as markdown.

## Project structure

```
AI-Web-Scraper/
├── backend/                  # Django + DRF
│   ├── .env.example          # copy this to backend/.env and add your key
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/               # django settings + root urls
│   └── api/
│       ├── views.py          # SummarizeView, HealthView
│       ├── serializers.py    # request / response serializers
│       ├── exceptions.py     # ScrapeError, AIError + error handler
│       ├── urls.py
│       ├── tests.py
│       └── services/
│           ├── scraper.py    # downloads the page + extracts the text
│           └── ai.py         # calls the Gemini API
├── frontend/                 # React + TypeScript (Vite)
│   └── src/
│       ├── App.tsx
│       ├── api.ts            # fetch call to the backend
│       ├── types.ts
│       └── components/SummaryCard.tsx
├── build.sh                  # build script for Render
└── render.yaml               # Render deploy config
```

## Running it locally

### Requirements

- Python 3.10+
- Node.js 18+
- A free Gemini API key: go to <https://aistudio.google.com/app/apikey>, sign in with a Google
  account and click **Create API key**. No credit card needed.

### 1. Clone

```bash
git clone https://github.com/vijaysharmaaa/ai-web-scraper.git
cd ai-web-scraper
```

### 2. Backend (Django), runs on http://127.0.0.1:8000

```bash
cd backend
python -m venv .venv

# activate the venv
source .venv/bin/activate        # mac / linux
# .venv\Scripts\activate         # windows

pip install -r requirements.txt
```

**The `.env` file goes in the `backend/` folder.** Copy the example file and add your key:

```bash
cp .env.example .env             # windows: copy .env.example .env
```

`backend/.env` should look like this:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the server:

```bash
python manage.py runserver
```

To check it's working, open <http://127.0.0.1:8000/api/health/>. You should see `"ai_key_set": true`.

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
cd backend
python manage.py test
```

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
  "model": "gemini-2.5-flash",
  "char_count": 24311,
  "truncated": true,
  "took_seconds": 3.2
}
```

Errors always come back as `{ "error": "message" }` with a matching status code
(400 bad URL, 415 not an HTML page, 422 no readable text, 429 rate limited, 502/504 site or AI failed).

### `GET /api/health/`

Returns `{"status": "ok", "ai_key_set": true}`.

## Deploying (Render)

The repo includes `render.yaml`, so deploying is mostly clicking buttons:

1. Push the repo to GitHub.
2. On <https://dashboard.render.com> click **New > Blueprint** and pick this repo.
3. When it asks for `GEMINI_API_KEY`, paste your key. The other env vars are set automatically.
4. Wait for the build (`build.sh` builds the React app and installs the Python packages).
   Django then serves both the API and the frontend from the same URL, so there's no CORS setup.

Note: the free Render plan sleeps after 15 minutes without traffic, so the first request after
that can take around 30 seconds.

## Environment variables

All of these go in `backend/.env` locally, or in the Render dashboard when deployed.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `GEMINI_API_KEY` | yes | - | free key from Google AI Studio |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | any Gemini model name |
| `DJANGO_DEBUG` | no | `True` | set to `False` in production |
| `DJANGO_SECRET_KEY` | in prod | dev key | Render generates one |
| `DJANGO_ALLOWED_HOSTS` | no | `localhost,127.0.0.1` | comma separated |

The frontend only needs `VITE_API_URL` (in `frontend/.env`) if you host it separately from the backend.

## Limitations

- It only reads the HTML the server sends back, so pages that build their content with JavaScript
  (some SPAs) won't have much text to summarize.
- Some sites (Cloudflare etc.) block scrapers and return 403.
- Requests to localhost / private IPs are blocked on purpose, so the deployed server can't be
  used to reach internal addresses.
- Very long pages are cut to 15,000 characters before being sent to the AI.
