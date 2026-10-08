import { config } from "@/config";
import type { HealthResponse, SummaryResponse } from "@/types";

// empty string = same origin (vite proxy in dev, django serves the app in prod)

// a bit longer than the backend needs in the worst case (scrape + several AI fallbacks)


export type ApiErrorKind = "network" | "timeout" | "aborted" | "http";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  code: string;
  retryAfter?: number;
  resetsAt?: string;

  constructor(
    message: string,
    opts: { kind: ApiErrorKind; status?: number; code?: string; retryAfter?: number; resetsAt?: string }
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.status = opts.status ?? 0;
    this.code = opts.code ?? opts.kind;
    this.retryAfter = opts.retryAfter;
    this.resetsAt = opts.resetsAt;
  }
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  // our own controller so we can time out AND let the caller cancel
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort);

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch (err) {
    if (timedOut) {
      throw new ApiError("The request took too long. The website or AI may be slow right now.", { kind: "timeout" });
    }
    if (signal?.aborted) {
      throw new ApiError("Cancelled", { kind: "aborted" });
    }
    console.error("[api] network error", err);
    throw new ApiError("Could not reach the server. Check your internet connection or try again in a moment.", {
      kind: "network",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  const data = await res.json().catch(() => null);
  console.log("[api]", init.method ?? "GET", path, res.status, data);

  if (!res.ok) {
    const fallback =
      res.status >= 500
        ? "The server had a problem. Please try again in a moment."
        : `Request failed (HTTP ${res.status}).`;
    throw new ApiError(data?.error ?? fallback, {
      kind: "http",
      status: res.status,
      code: data?.code,
      retryAfter: data?.retry_after ?? (Number(res.headers.get("Retry-After")) || undefined),
      resetsAt: data?.resets_at,
    });
  }
  if (data === null) {
    throw new ApiError("The server sent back something unexpected.", { kind: "http", status: res.status });
  }
  return data as T;
}

/** model: one of the server's models, or undefined to let the server pick (auto) */
export function summarizeUrl(url: string, signal?: AbortSignal, model?: string) {
  const body = model ? { url, model } : { url };
  return request<SummaryResponse>("/api/summarize/", { method: "POST", body: JSON.stringify(body) }, signal);
}

export function getHealth(signal?: AbortSignal) {
  return request<HealthResponse>("/api/health/", {}, signal);
}
