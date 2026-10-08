import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";

const HEALTH = { status: "ok", ai_ready: true, providers: ["Google Gemini", "Groq"], models: ["gem-a", "llama"] };

const RESULT = {
  title: "Web scraping - Wikipedia",
  url: "https://en.wikipedia.org/wiki/Web_scraping",
  summary: "**TL;DR:** Scraping pulls data from sites.\n\n**Key points:**\n- one\n- two",
  provider: "Google Gemini",
  model: "gemini-flash-latest",
  failed_attempts: [],
  char_count: 24000,
  word_count: 4000,
  truncated: true,
  took_seconds: 3.2,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetch(summarize: Handler, health: Handler = () => json(HEALTH)) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes("/api/health/")) return health(url, init);
    return summarize(url, init);
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("App", () => {
  it("summarizes a url and shows the model that answered", async () => {
    const fetchMock = mockFetch(() => json(RESULT));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "en.wikipedia.org/wiki/Web_scraping");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByRole("heading", { name: RESULT.title })).toBeInTheDocument();
    expect(screen.getByText(/Scraping pulls data from sites/)).toBeInTheDocument();
    expect(screen.getByText("Google Gemini · gemini-flash-latest")).toBeInTheDocument();
    expect(screen.getByText(/only the first part was used/)).toBeInTheDocument();

    // https:// was added before sending
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes("summarize"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ url: "https://en.wikipedia.org/wiki/Web_scraping" });

    // saved to history
    const history = screen.getByRole("region", { name: /recent summaries/i });
    expect(within(history).getByText(RESULT.title)).toBeInTheDocument();
  });

  it("shows the loading state while waiting", async () => {
    let finish!: (r: Response) => void;
    mockFetch(() => new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /summarizing/i })).toBeDisabled();

    finish(new Response(JSON.stringify(RESULT), { status: 200 }));
    expect(await screen.findByRole("heading", { name: RESULT.title })).toBeInTheDocument();
  });

  it("can cancel a request", async () => {
    mockFetch((_u, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("validates the url before sending", async () => {
    const fetchMock = mockFetch(() => json(RESULT));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "not a url");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByText(/doesn't look like a valid URL/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("summarize"))).toHaveLength(0);
  });

  it("shows server errors with an edit action", async () => {
    mockFetch(() => json({ error: "This website blocked our request", code: "site_blocked" }, 422));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://blocked.example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByText("This website blocked us")).toBeInTheDocument();
    expect(screen.getByText("This website blocked our request")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit url/i }));
    expect(screen.getByLabelText("Web page URL")).toHaveValue("https://blocked.example.com");
    expect(screen.getByLabelText("Web page URL")).toHaveFocus();
  });

  it("disables retry during a rate limit cooldown", async () => {
    mockFetch(() => json({ error: "Too fast", code: "throttled", retry_after: 30 }, 429));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByText("Slow down a little")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again in 30s/i })).toBeDisabled();
  });

  it("explains when the server is unreachable", async () => {
    mockFetch(
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.reject(new TypeError("Failed to fetch"))
    );
    renderApp();
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
  });

  it("warns when no AI provider is configured", async () => {
    mockFetch(() => json(RESULT), () => json({ ...HEALTH, ai_ready: false, providers: [], models: [] }));
    renderApp();
    expect(await screen.findByText("No AI provider configured")).toBeInTheDocument();
  });

  it("tells the user when a fallback model answered", async () => {
    mockFetch(() =>
      json({
        ...RESULT,
        provider: "Groq",
        model: "llama-3.3-70b-versatile",
        failed_attempts: [{ provider: "Google Gemini", model: "gemini-flash-latest", error: "rate limited / quota used up" }],
      })
    );
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));

    expect(await screen.findByText("Groq · llama-3.3-70b-versatile")).toBeInTheDocument();
    expect(screen.getByText("fallback")).toBeInTheDocument();
    expect(await screen.findByText(/Answered by Groq/)).toBeInTheDocument();
  });

  it("reopens and clears history", async () => {
    mockFetch(() => json(RESULT));
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: /summarize/i }));
    await screen.findByRole("heading", { name: RESULT.title });

    await user.click(screen.getByRole("button", { name: /new summary/i }));
    expect(screen.queryByRole("heading", { name: RESULT.title })).not.toBeInTheDocument();

    const history = screen.getByRole("region", { name: /recent summaries/i });
    await user.click(within(history).getByText(RESULT.title));
    expect(await screen.findByText("From history")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    await user.click(await screen.findByRole("button", { name: "Clear history" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /recent summaries/i })).not.toBeInTheDocument());
  });
});
