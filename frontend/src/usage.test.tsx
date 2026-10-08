import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";

const tomorrow = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

function health(remaining: number) {
  return {
    status: "ok",
    ai_ready: true,
    providers: ["Google Gemini"],
    models: ["gem"],
    model_options: [{ provider: "Google Gemini", model: "gem" }],
    usage: { limit: 3, used: 3 - remaining, remaining, resets_at: tomorrow },
    limits: { max_url_length: 2000, summaries_per_day: 3 },
    examples: [{ label: "Example site", url: "https://example.com/post" }],
  };
}

const RESULT = {
  title: "Test article",
  url: "https://example.com/article",
  summary: "**TL;DR:** test",
  provider: "Google Gemini",
  model: "gem",
  failed_attempts: [],
  char_count: 100,
  word_count: 20,
  truncated: false,
  took_seconds: 1,
};

function mockApi(remaining: number, summarize: () => Response) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
    Promise.resolve(
      String(input).includes("health") ? new Response(JSON.stringify(health(remaining)), { status: 200 }) : summarize()
    )
  );
}

function renderApp() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  localStorage.setItem("storage-consent", "denied");
});

describe("daily usage", () => {
  it("shows how many summaries are left and counts down", async () => {
    mockApi(2, () => new Response(JSON.stringify({ ...RESULT, usage: { ...health(1).usage } }), { status: 200 }));
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/summaries left today/)).toHaveTextContent("2 of 3 summaries left today");

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^summarize$/i }));
    await screen.findByRole("heading", { name: RESULT.title });
    expect(screen.getByText(/summaries left today/)).toHaveTextContent("1 of 3 summaries left today");
  });

  it("blocks the button once the limit is reached", async () => {
    mockApi(0, () => new Response("{}", { status: 500 }));
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/Daily limit reached/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Web page URL"), "https://example.com/article");
    expect(screen.getByRole("button", { name: /^summarize$/i })).toBeDisabled();
    expect(screen.getByText(/You've used today's 3 summaries/)).toBeInTheDocument();
  });

  it("explains a daily limit error from the server", async () => {
    mockApi(
      1,
      () =>
        new Response(
          JSON.stringify({ error: "You've used all 3 summaries for today.", code: "daily_limit", retry_after: 3600, resets_at: tomorrow }),
          { status: 429 }
        )
    );
    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/summaries left today/);

    await user.type(screen.getByLabelText("Web page URL"), "https://example.com/article");
    await user.click(screen.getByRole("button", { name: /^summarize$/i }));

    expect(await screen.findByText("Daily limit reached")).toBeInTheDocument();
    expect(screen.getByText(/You can summarize more pages/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("uses the example links from the server", async () => {
    mockApi(3, () => new Response("{}", { status: 500 }));
    renderApp();
    expect(await screen.findByRole("button", { name: "Example site" })).toBeInTheDocument();
  });
});
