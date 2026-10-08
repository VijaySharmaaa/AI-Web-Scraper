import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorCard } from "@/components/error-card";
import { HistoryList } from "@/components/history-list";
import { LoadingCard } from "@/components/loading-card";
import { SiteHeader } from "@/components/site-header";
import { StatusBanner, type HealthState } from "@/components/status-banner";
import { UrlForm } from "@/components/url-form";
import { useOnline } from "@/hooks/use-online";
import { ApiError, getHealth, summarizeUrl } from "@/lib/api";
import { describeError, type ErrorInfo } from "@/lib/errors";
import { addToHistory, createHistoryItem, loadHistory, saveHistory } from "@/lib/history";
import type { HistoryItem, SummaryResponse } from "@/types";

// the markdown renderer is the biggest dependency and only needed once there's a result
const SummaryCard = lazy(() => import("@/components/summary-card").then((m) => ({ default: m.SummaryCard })));

type View =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "success"; result: SummaryResponse; historyId?: string; fromHistory: boolean }
  | { status: "error"; url: string; error: ErrorInfo; key: number };

export default function App() {
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const online = useOnline();

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async () => {
    setHealth({ status: "checking" });
    try {
      const data = await getHealth();
      setHealth({ status: "ok", data });
    } catch (err) {
      console.warn("[health] backend not reachable", err);
      setHealth({ status: "down" });
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // check again when the connection comes back
  useEffect(() => {
    if (online && health.status === "down") checkHealth();
  }, [online]);

  useEffect(() => saveHistory(history), [history]);

  // keyboard shortcuts: "/" or ctrl+k focuses the input, esc cancels
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && abortRef.current) {
        abortRef.current.abort();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // cancel any request still running when the page closes
  useEffect(() => () => abortRef.current?.abort(), []);

  const scrollToResult = () => {
    requestAnimationFrame(() => {
      const el = resultRef.current;
      if (!el || typeof el.scrollIntoView !== "function") return;
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  async function summarize(url: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setView({ status: "loading", url });
    scrollToResult();

    try {
      const result = await summarizeUrl(url, controller.signal);
      // functional update, the history may have changed while we were waiting
      const item = createHistoryItem(result);
      setHistory((items) => addToHistory(items, item));
      setView({ status: "success", result, historyId: item.id, fromHistory: false });
      if (health.status === "down") checkHealth();
      if (result.failed_attempts.length > 0) {
        toast.info(`Answered by ${result.provider} (${result.model})`, {
          description: "The first choice AI model was unavailable, so a fallback model was used.",
        });
      }
      scrollToResult();
    } catch (err) {
      if (err instanceof ApiError && err.kind === "aborted") {
        setView({ status: "idle" });
        toast("Cancelled");
        return;
      }
      setView({ status: "error", url, error: describeError(err), key: Date.now() });
      // couldn't even reach the server, show the banner too
      if (err instanceof ApiError && err.kind === "network") setHealth({ status: "down" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function startOver() {
    setView({ status: "idle" });
    setInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function editUrl() {
    // keep what the user typed, only fill it in if the box was emptied meanwhile
    if (view.status === "error" && !input.trim()) setInput(view.url);
    setView({ status: "idle" });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }

  function openFromHistory(item: HistoryItem) {
    if (view.status === "loading") return;
    setInput(item.url);
    setView({ status: "success", result: item, historyId: item.id, fromHistory: true });
    scrollToResult();
  }

  function removeFromHistory(id: string) {
    setHistory((items) => items.filter((i) => i.id !== id));
    if (view.status === "success" && view.historyId === id && view.fromHistory) setView({ status: "idle" });
    toast("Removed from history");
  }

  function clearHistory() {
    setHistory([]);
    if (view.status === "success" && view.fromHistory) setView({ status: "idle" });
    toast.success("History cleared");
  }

  const loading = view.status === "loading";
  let blockedReason: string | undefined;
  if (!online) blockedReason = "You're offline. Reconnect to summarize pages.";
  else if (health.status === "ok" && !health.data.ai_ready) blockedReason = "Summaries are unavailable until an AI API key is added on the server.";

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
        <section className="mb-8 text-center sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Get the gist of any web page
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Paste a link. We read the page and AI writes you a short summary with the key points.
          </p>
        </section>

        <div className="space-y-6">
          <StatusBanner online={online} health={health} onRecheck={checkHealth} />

          <UrlForm
            value={input}
            onChange={setInput}
            onSubmit={summarize}
            loading={loading}
            blockedReason={blockedReason}
            inputRef={inputRef}
            showExamples={view.status === "idle" && history.length === 0}
          />

          {/* screen readers hear when the result is ready */}
          <p className="sr-only" aria-live="polite">
            {view.status === "success" && !view.fromHistory && `Summary ready: ${view.result.title}`}
            {view.status === "error" && `Error: ${view.error.title}. ${view.error.message}`}
          </p>

          <div ref={resultRef} className="scroll-mt-20">
            {view.status === "loading" && <LoadingCard url={view.url} onCancel={cancel} />}
            {view.status === "error" && (
              <ErrorCard error={view.error} errorKey={view.key} onRetry={() => summarize(view.url)} onEdit={editUrl} />
            )}
            {view.status === "success" && (
              <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border bg-card" />}>
                <SummaryCard result={view.result} onNew={startOver} fromHistory={view.fromHistory} />
              </Suspense>
            )}
          </div>

          <HistoryList
            items={history}
            activeId={view.status === "success" ? view.historyId : undefined}
            onSelect={openFromHistory}
            onRemove={removeFromHistory}
            onClear={clearHistory}
          />
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <p className="mx-auto max-w-3xl px-4">
          Summaries are written by AI and can contain mistakes. Check the original page for anything important.
          {health.status === "ok" && health.data.providers.length > 0 && (
            <> Powered by {health.data.providers.join(" + ")}.</>
          )}
        </p>
      </footer>
    </div>
  );
}
