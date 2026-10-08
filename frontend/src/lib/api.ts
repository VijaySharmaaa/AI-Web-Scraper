import { config } from "@/config";
import type { HealthResponse, Progress, SummaryResponse } from "@/types";

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

const NETWORK_MESSAGE = "We couldn't reach the server. Check your internet connection and try again.";
const TIMEOUT_MESSAGE = "This is taking too long. The website or the AI may be slow right now, please try again.";

function withTimeout(signal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.requestTimeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort);

  return {
    signal: controller.signal,
    failure(err: unknown) {
      if (timedOut) return new ApiError(TIMEOUT_MESSAGE, { kind: "timeout" });
      if (signal?.aborted) return new ApiError("Cancelled", { kind: "aborted" });
      console.error("[api] network error", err);
      return new ApiError(NETWORK_MESSAGE, { kind: "network" });
    },
    done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

async function errorFrom(res: Response) {
  const data = await res.json().catch(() => null);
  console.log("[api] error", res.status, data);
  const fallback =
    res.status >= 500 ? "Something went wrong on our side. Please try again in a moment." : `Request failed (HTTP ${res.status}).`;
  return new ApiError(data?.error ?? fallback, {
    kind: "http",
    status: res.status,
    code: data?.code,
    retryAfter: data?.retry_after ?? (Number(res.headers.get("Retry-After")) || undefined),
    resetsAt: data?.resets_at,
  });
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const timeout = withTimeout(signal);
  try {
    let res: Response;
    try {
      res = await fetch(`${config.apiUrl}${path}`, {
        ...init,
        signal: timeout.signal,
        headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      });
    } catch (err) {
      throw timeout.failure(err);
    }
    if (!res.ok) throw await errorFrom(res);
    const data = await res.json().catch(() => null);
    console.log("[api]", init.method ?? "GET", path, res.status, data);
    if (data === null) throw new ApiError("The server sent back something unexpected.", { kind: "http", status: res.status });
    return data as T;
  } finally {
    timeout.done();
  }
}

export function newRequestId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface SummarizeOptions {
  signal?: AbortSignal;
  model?: string;
  requestId?: string;
  onProgress?: (progress: Progress) => void;
}

async function* readLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
    }
    if (done) break;
  }
  if (buffer.trim()) yield buffer.trim();
}

export async function summarizeUrl(url: string, { signal, model, requestId, onProgress }: SummarizeOptions = {}) {
  const timeout = withTimeout(signal);
  const body = { url, ...(model ? { model } : {}), ...(requestId ? { request_id: requestId } : {}) };
  try {
    let res: Response;
    try {
      res = await fetch(`${config.apiUrl}/api/summarize/`, {
        method: "POST",
        signal: timeout.signal,
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw timeout.failure(err);
    }
    if (!res.ok) throw await errorFrom(res);

    if (!(res.headers.get("content-type") ?? "").includes("ndjson") || !res.body) {
      return (await res.json()) as SummaryResponse;
    }

    try {
      for await (const line of readLines(res.body)) {
        const event = JSON.parse(line);
        console.log("[api] progress", event);
        if (event.type === "result") return event.result as SummaryResponse;
        if (event.type === "error") {
          throw new ApiError(event.error, { kind: "http", status: event.status, code: event.code });
        }
        onProgress?.(event as Progress);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw timeout.failure(err);
    }
    throw new ApiError("The connection was interrupted before the summary was ready. Please try again.", {
      kind: "network",
    });
  } finally {
    timeout.done();
  }
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
