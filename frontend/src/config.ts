const env = import.meta.env;

function number(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  appName: env.VITE_APP_NAME || "AI Web Summarizer",
  apiUrl: (env.VITE_API_URL ?? "").replace(/\/$/, ""),
  sourceUrl: env.VITE_SOURCE_URL ?? "https://github.com/VijaySharmaaa/AI-Web-Scraper",
  requestTimeoutMs: number(env.VITE_REQUEST_TIMEOUT_MS, 130_000),
  historyLimit: number(env.VITE_HISTORY_LIMIT, 12),
  defaultMaxUrlLength: number(env.VITE_MAX_URL_LENGTH, 2000),
  slowAfterSeconds: number(env.VITE_SLOW_AFTER_SECONDS, 20),
};
