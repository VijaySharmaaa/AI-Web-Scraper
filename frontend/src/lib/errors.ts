import { ApiError } from "@/lib/api";
import { formatResetTime } from "@/lib/format";

export type ErrorTone = "warning" | "destructive";

export interface ErrorInfo {
  title: string;
  message: string;
  hint?: string;
  tone: ErrorTone;
  /** does trying the same url again have a chance of working? */
  retryable: boolean;
  /** should the user fix the url instead? */
  editUrl: boolean;
  retryAfter?: number;
}

type Preset = Omit<ErrorInfo, "message" | "retryAfter">;

// error codes come from the backend (api/exceptions.py and the services)
const BY_CODE: Record<string, Preset> = {
  throttled: { title: "Slow down a little", tone: "warning", retryable: true, editUrl: false },
  validation_error: { title: "Check the URL", tone: "warning", retryable: false, editUrl: true },
  invalid_url: { title: "Check the URL", tone: "warning", retryable: false, editUrl: true },
  private_address: {
    title: "Private address blocked",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "For security, local and private network addresses (like localhost or 192.168.x.x) can't be summarized.",
  },
  dns_not_found: {
    title: "Website not found",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "Double check the spelling of the domain, e.g. wikipedia.org not wikipedia.ogr.",
  },
  page_not_found: { title: "Page not found", tone: "warning", retryable: false, editUrl: true },
  site_blocked: {
    title: "This website blocked us",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "Some sites block automated readers or need a login. Try another article on a different site.",
  },
  site_rate_limited: { title: "The website is limiting requests", tone: "warning", retryable: true, editUrl: false },
  site_error: { title: "The website has a problem", tone: "warning", retryable: true, editUrl: true },
  site_timeout: { title: "The website is too slow", tone: "warning", retryable: true, editUrl: true },
  site_unreachable: {
    title: "Couldn't connect to the website",
    tone: "warning",
    retryable: true,
    editUrl: true,
    hint: "The site may be down, or it may refuse connections from servers.",
  },
  too_many_redirects: { title: "Too many redirects", tone: "warning", retryable: false, editUrl: true },
  not_html: {
    title: "That's not a web page",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "Links to PDFs, images, videos or downloads can't be summarized. Try the page that links to it.",
  },
  no_text: {
    title: "No readable text found",
    tone: "warning",
    retryable: false,
    editUrl: true,
    hint: "This page builds its content with JavaScript, which this app doesn't run. Articles, blogs, docs and Wikipedia work best.",
  },
  invalid_model: {
    title: "That AI model isn't available",
    tone: "warning",
    retryable: false,
    editUrl: false,
    hint: "The server's model list changed. Pick another model or use Auto.",
  },
  ai_quota: {
    title: "The AI is busy",
    tone: "warning",
    retryable: true,
    editUrl: false,
    hint: "Free AI plans have a per-minute limit. It usually resets within a minute.",
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
      message: "An unexpected error happened in the app. Please try again.",
      tone: "destructive",
      retryable: true,
      editUrl: false,
    };
  }

  const base = { message: err.message, retryAfter: err.retryAfter };

  if (err.kind === "network") {
    return { ...base, title: "Can't reach the server", tone: "destructive", retryable: true, editUrl: false,
      hint: "If you're running this locally, make sure the Django backend is running on port 8000." };
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
      hint: err.resetsAt ? `You can summarize more pages ${formatResetTime(err.resetsAt)}. Your history still works.` : undefined,
    };
  }
  const known = BY_CODE[code];
  if (known) return { ...base, ...known };

  // fall back to the status code for anything without a known code
  if (status === 429) return { ...base, title: "Slow down a little", tone: "warning", retryable: true, editUrl: false };
  if (status === 400) return { ...base, title: "Check the URL", tone: "warning", retryable: false, editUrl: true };
  if (status === 415) return { ...base, ...BY_CODE.not_html };
  if (status === 422) return { ...base, title: "Couldn't read this page", tone: "warning", retryable: false, editUrl: true };
  if (status === 503) return { ...base, title: "The server isn't set up yet", tone: "destructive", retryable: false, editUrl: false };
  if (status === 502 || status === 504) return { ...base, title: "Something didn't respond", tone: "warning", retryable: true, editUrl: false };
  return { ...base, title: "Something went wrong", tone: "destructive", retryable: true, editUrl: false };
}
