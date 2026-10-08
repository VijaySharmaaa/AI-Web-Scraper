FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist
RUN python -m whitenoise.compress frontend/dist \
    && useradd --create-home app \
    && chown -R app /app
USER app

WORKDIR /app/backend
EXPOSE 8000
CMD ["gunicorn", "config.wsgi", "-c", "gunicorn.conf.py"]
