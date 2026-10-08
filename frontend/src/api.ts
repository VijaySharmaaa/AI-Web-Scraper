import type { ErrorResponse, SummaryResponse } from "./types";

// empty string = same origin (vite proxy in dev, django serves the app in prod)
const API_URL = import.meta.env.VITE_API_URL ?? "";

export async function summarizeUrl(url: string): Promise<SummaryResponse> {
  console.log("[api] POST /api/summarize/", url);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/summarize/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    console.error("[api] network error", err);
    throw new Error("Could not reach the server. Is the backend running?");
  }

  const data = await res.json().catch(() => null);
  console.log("[api] response", res.status, data);

  if (!res.ok) {
    const message = (data as ErrorResponse | null)?.error ?? `Request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return data as SummaryResponse;
}
