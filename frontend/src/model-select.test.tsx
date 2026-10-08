import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";

const HEALTH = {
  status: "ok",
  ai_ready: true,
  providers: ["Google Gemini", "Groq"],
  models: ["gemini-flash-latest", "llama-3.3-70b-versatile"],
  model_options: [
    { provider: "Google Gemini", model: "gemini-flash-latest" },
    { provider: "Groq", model: "llama-3.3-70b-versatile" },
  ],
};

const RESULT = {
  title: "Test article",
  url: "https://example.com/article",
  summary: "A short test overview.",
  provider: "Groq",
  model: "llama-3.3-70b-versatile",
  requested_model: "llama-3.3-70b-versatile",
  char_count: 100,
  word_count: 20,
  truncated: false,
  took_seconds: 1,
};

let fetchMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  localStorage.setItem("storage-consent", "denied");
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const body = String(input).includes("health") ? HEALTH : RESULT;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

function renderApp() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function sentBody() {
  const call = fetchMock.mock.calls.find(([u]: [unknown]) => String(u).includes("summarize"));
  return JSON.parse(String(call?.[1]?.body));
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Web page URL"), "https://example.com/article");
  await user.click(screen.getByRole("button", { name: /^summarize$/i }));
  await screen.findByRole("heading", { name: RESULT.title });
}

describe("model picker", () => {
  it("defaults to Auto and doesn't send a model", async () => {
    const user = userEvent.setup();
    renderApp();
    const picker = await screen.findByRole("combobox", { name: "AI model" });
    expect(picker).toHaveTextContent("Auto");

    await submit(user);
    const { request_id, ...rest } = sentBody();
    expect(rest).toEqual({ url: "https://example.com/article" });
    expect(request_id).toBeTruthy();
  });

  it("sends the picked model and remembers it", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("combobox", { name: "AI model" }));
    await user.click(await screen.findByRole("option", { name: "llama-3.3-70b-versatile" }));
    expect(screen.getByRole("combobox", { name: "AI model" })).toHaveTextContent("llama-3.3-70b-versatile");
    expect(localStorage.getItem("ai-model")).toBe("llama-3.3-70b-versatile");

    await submit(user);
    expect(sentBody()).toMatchObject({ url: "https://example.com/article", model: "llama-3.3-70b-versatile" });
  });

  it("lists Auto first and groups models by provider", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("combobox", { name: "AI model" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Auto · best available",
      "gemini-flash-latest",
      "llama-3.3-70b-versatile",
    ]);
    expect(screen.getByText("Groq")).toBeInTheDocument();
  });

  it("lists models that can't be used, greyed out with the reason", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const body = String(input).includes("health")
        ? {
            ...HEALTH,
            unavailable_models: [
              { provider: "Google Gemini", model: "gemini-3.6-flash", label: "Gemini 3.6 Flash", reason: "not available for this API key" },
              { provider: "Groq", model: "llama-3.1-8b-instant", label: "Llama 3.1 8b Instant", reason: "not set up on this server" },
            ],
          }
        : RESULT;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("combobox", { name: "AI model" }));

    const locked = await screen.findByRole("option", { name: /Gemini 3.6 Flash/ });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveTextContent("not available for this API key");
    expect(screen.getByRole("option", { name: /Llama 3.1 8b Instant/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "llama-3.3-70b-versatile" })).not.toHaveAttribute("aria-disabled");
  });

  it("uses Auto while a saved model isn't offered, without forgetting the choice", async () => {
    localStorage.setItem("ai-model", "old-model-that-was-removed");
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "AI model" })).toHaveTextContent("Auto"));

    await submit(user);
    expect(sentBody().model).toBeUndefined();
    expect(localStorage.getItem("ai-model")).toBe("old-model-that-was-removed");
  });
});
