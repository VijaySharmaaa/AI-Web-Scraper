import { ApiError } from "@/lib/api";
import { formatResetTime } from "@/lib/format";

export type ErrorTone = "warning" | "destructive";

export interface ErrorInfo {
  title: string;
  message: string;
  hint?: string;
  tone: ErrorTone;
  retryable: boolean;
  editUrl: boolean;
  retryAfter?: number;
}

type Preset = Omit<ErrorInfo, "message" | "retryAfter">;

const BY_CODE: Record<string, Preset> = {
  throttled: { title: "Slow down a little", tone: "warning", retryable: true, editUrl: false },
  validation_error: { title: "Check the URL", tone: "warning", retryable: false, editUrl: true },
  invalid_url: { title: "Check the URL", tone: "warning", retryable: false, editUrl: true },
  private_address: {
    title: "Private address blocked",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "For safety, addresses like localhost or 192.168.x.x are blocked.",
  },
  dns_not_found: {
    title: "Website not found",
    tone: "warning",
    retryable: false,
    editUrl: true,
  },
  page_not_found: { title: "Page not found", tone: "warning", retryable: false, editUrl: true },
  site_blocked: {
    title: "This website blocked us",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "Try an article from another site.",
  },
  site_rate_limited: { title: "The website is limiting requests", tone: "warning", retryable: true, editUrl: false },
  site_error: { title: "The website has a problem", tone: "warning", retryable: true, editUrl: true },
  site_timeout: { title: "The website is too slow", tone: "warning", retryable: true, editUrl: true },
  site_unreachable: {
    title: "Couldn't connect to the website",
    tone: "warning",
    retryable: true,
    editUrl: true,
  },
  too_many_redirects: { title: "Too many redirects", tone: "warning", retryable: false, editUrl: true },
  unsupported_type: {
    title: "Can't summarize this file",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "Web pages, PDFs, Word files, images, text, CSV, JSON and RSS work.",
  },
  file_too_large: { title: "That file is too large", tone: "warning", retryable: false, editUrl: true },
  bad_file: { title: "Couldn't open that file", tone: "warning", retryable: false, editUrl: true },
  model_cant_read_images: {
    title: "This model can't read images",
    tone: "warning",
    retryable: false,
    editUrl: false,
  },
  no_text: {
    title: "No readable text found",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "It may need JavaScript or a login to show its text. Articles, docs and files work best."
  },
  model_busy: {
    title: "That model is busy",
    tone: "warning",
    retryable: true,
    editUrl: false,
  },
  model_failed: {
    title: "That model didn't answer",
    tone: "warning",
    retryable: true,
    editUrl: false,
  },
  invalid_model: {
    title: "That model isn't available",
    tone: "warning",
    retryable: false,
    editUrl: false,
  },
  ai_quota: {
    title: "The AI is busy",
    tone: "warning",
    retryable: true,
    editUrl: false,
    hint: "Free AI limits reset every minute.",
  },
  ai_refused: { title: "The AI declined this page", tone: "warning", retryable: false, editUrl: true },
  ai_failed: { title: "The AI didn't answer", tone: "warning", retryable: true, editUrl: false },
  ai_not_configured: { title: "The server isn't set up yet", tone: "destructive", retryable: false, editUrl: false },
  ai_bad_key: { title: "The server's AI key is invalid", tone: "destructive", retryable: false, editUrl: false },
  server_error: { title: "Something went wrong on our side", tone: "destructive", retryable: true, editUrl: false },
};

export function describeError(err: unknown): ErrorInfo {
  if (!(err instanceof ApiError)) {
    console.error("unexpected error", err);
    return {
      title: "Something went wrong",
      message: "Something unexpected happened. Please try again.",
      tone: "destructive",
      retryable: true,
      editUrl: false,
    };
  }

  const base = { message: err.message, retryAfter: err.retryAfter };

  if (err.kind === "network") {
    return { ...base, title: "Can't reach the server", tone: "destructive", retryable: true, editUrl: false,
      hint: "If you run the app locally, make sure the backend is running." };
  }
  if (err.kind === "timeout") {
    return { ...base, title: "This is taking too long", tone: "warning", retryable: true, editUrl: false };
  }

  const { status, code } = err;
  if (code === "daily_limit") {
    return {
      ...base,
      retryAfter: undefined,
      title: "Daily limit reached",
      tone: "warning",
      retryable: false,
      editUrl: false,
      hint: err.resetsAt ? `More summaries ${formatResetTime(err.resetsAt)}. Your history still works.` : undefined,
    };
  }
  const known = BY_CODE[code];
  if (known) return { ...base, ...known };

  if (status === 429) return { ...base, title: "Slow down a little", tone: "warning", retryable: true, editUrl: false };
  if (status === 400) return { ...base, title: "Check the URL", tone: "warning", retryable: false, editUrl: true };
  if (status === 415) return { ...base, ...BY_CODE.unsupported_type };
  if (status === 422) return { ...base, title: "Couldn't read this page", tone: "warning", retryable: false, editUrl: true };
  if (status === 503) return { ...base, title: "The server isn't set up yet", tone: "destructive", retryable: false, editUrl: false };
  if (status === 502 || status === 504) return { ...base, title: "Something didn't respond", tone: "warning", retryable: true, editUrl: false };
  return { ...base, title: "Something went wrong", tone: "destructive", retryable: true, editUrl: false };
}
