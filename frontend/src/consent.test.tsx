import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";

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

function mockApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const body = String(input).includes("health")
      ? { status: "ok", ai_ready: true, providers: ["Google Gemini"], models: ["gem"] }
      : RESULT;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
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

async function summarize(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Web page URL"), "https://example.com/article");
  await user.click(screen.getByRole("button", { name: /^summarize$/i }));
  await screen.findByRole("heading", { name: RESULT.title });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockApi();
});

describe("history consent", () => {
  it("asks on the first visit", () => {
    renderApp();
    expect(screen.getByRole("dialog", { name: /save your history/i })).toBeInTheDocument();
  });

  it("saves history only after the visitor allows it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(screen.queryByRole("dialog", { name: /save your history/i })).not.toBeInTheDocument();

    await summarize(user);
    expect(JSON.parse(localStorage.getItem("summary-history") ?? "[]")).toHaveLength(1);
  });

  it("keeps history in memory but never stores it after 'No thanks'", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "No thanks" }));

    await summarize(user);
    const history = screen.getByRole("region", { name: /recent summaries/i });
    expect(within(history).getByText(RESULT.title)).toBeInTheDocument();
    expect(localStorage.getItem("summary-history")).toBeNull();
    expect(screen.getByText(/History isn't saved on this device/)).toBeInTheDocument();

    // changing their mind saves what's already there
    await user.click(screen.getByRole("button", { name: "Save it" }));
    expect(JSON.parse(localStorage.getItem("summary-history") ?? "[]")).toHaveLength(1);
  });

  it("doesn't save anything while the question is unanswered", async () => {
    const user = userEvent.setup();
    renderApp();
    await summarize(user);
    expect(localStorage.getItem("summary-history")).toBeNull();
  });

  it("ignores stored history without consent", () => {
    localStorage.setItem("summary-history", JSON.stringify([{ ...RESULT, id: "1", created_at: Date.now() }]));
    renderApp();
    expect(screen.queryByText(RESULT.title)).not.toBeInTheDocument();
  });

  it("loads saved history on the next visit when allowed", () => {
    localStorage.setItem("storage-consent", "granted");
    localStorage.setItem("summary-history", JSON.stringify([{ ...RESULT, id: "1", created_at: Date.now() }]));
    renderApp();
    expect(screen.getByText(RESULT.title)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /save your history/i })).not.toBeInTheDocument();
  });

  it("'No thanks' deletes history that was saved before", async () => {
    localStorage.setItem("storage-consent", "granted");
    localStorage.setItem("summary-history", JSON.stringify([{ ...RESULT, id: "1", created_at: Date.now() }]));
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Storage settings" }));
    await user.click(screen.getByRole("button", { name: "No thanks" }));
    expect(localStorage.getItem("summary-history")).toBeNull();
    expect(localStorage.getItem("storage-consent")).toBe("denied");
  });
});
