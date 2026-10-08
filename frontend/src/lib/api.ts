import { config } from "@/config";
import type { HealthResponse, SummaryResponse } from "@/types";

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

export function newRequestId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function summarizeUrl(url: string, signal?: AbortSignal, model?: string, requestId?: string) {
  const body = { url, ...(model ? { model } : {}), ...(requestId ? { request_id: requestId } : {}) };
  return request<SummaryResponse>("/api/summarize/", { method: "POST", body: JSON.stringify(body) }, signal);
}

export function cancelSummary(requestId: string) {
  console.log("[api] cancel", requestId);
  return fetch(`${config.apiUrl}/api/summarize/cancel/`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ request_id: requestId }),
  }).catch((err) => console.warn("[api] cancel failed", err));
}

let healthInFlight: Promise<HealthResponse> | null = null;

export function getHealth() {
  healthInFlight ??= request<HealthResponse>("/api/health/").finally(() => {
    healthInFlight = null;
  });
  return healthInFlight;
}
