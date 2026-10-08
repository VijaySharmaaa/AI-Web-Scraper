import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConsentBanner } from "@/components/consent-banner";
import { ErrorCard } from "@/components/error-card";
import { HistoryList } from "@/components/history-list";
import { HowItWorks } from "@/components/how-it-works";
import { LoadingCard } from "@/components/loading-card";
import { SiteHeader } from "@/components/site-header";
import { StatusBanner, type HealthState } from "@/components/status-banner";
import { UrlForm } from "@/components/url-form";
import { useOnline } from "@/hooks/use-online";
import { ApiError, cancelSummary, getHealth, newRequestId, summarizeUrl } from "@/lib/api";
import { describeError, type ErrorInfo } from "@/lib/errors";
import { loadConsent, saveConsent, type Consent } from "@/lib/consent";
import { AUTO, loadModelChoice, saveModelChoice } from "@/lib/model-choice";
import { addToHistory, clearSavedHistory, createHistoryItem, loadHistory, saveHistory } from "@/lib/history";
import { formatResetTime } from "@/lib/format";
import type { HistoryItem, SummaryResponse, Usage } from "@/types";

const SummaryCard = lazy(() => import("@/components/summary-card").then((m) => ({ default: m.SummaryCard })));

type View =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "success"; result: SummaryResponse; historyId?: string; fromHistory: boolean }
  | { status: "error"; url: string; error: ErrorInfo; key: number };

export default function App() {
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>({ status: "idle" });
  const [consent, setConsent] = useState<Consent | null>(loadConsent);
  const [history, setHistory] = useState<HistoryItem[]>(() => (loadConsent() === "granted" ? loadHistory() : []));
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const [model, setModel] = useState(loadModelChoice);
  const [usage, setUsage] = useState<Usage | null>(null);
  const online = useOnline();

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const modelOptions = health.status === "ok" ? health.data.model_options ?? [] : [];

  function changeModel(next: string) {
    setModel(next);
    saveModelChoice(next);
  }

  useEffect(() => {
    if (health.status !== "ok" || model === AUTO) return;
    if (!modelOptions.some((m) => m.model === model)) changeModel(AUTO);
  }, [health]);

  const checkHealth = useCallback(async () => {
    setHealth({ status: "checking" });
    try {
      const data = await getHealth();
      setHealth({ status: "ok", data });
      setUsage(data.usage ?? null);
    } catch (err) {
      console.warn("[health] backend not reachable", err);
      setHealth({ status: "down" });
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (online && health.status === "down") checkHealth();
  }, [online]);

  useEffect(() => {
    if (consent === "granted") saveHistory(history);
  }, [history, consent]);

  function allowStorage() {
    saveConsent("granted");
    setConsent("granted");
    toast.success("Your history will be saved on this device");
  }

  function denyStorage() {
    saveConsent("denied");
    setConsent("denied");
    clearSavedHistory();
    toast("Got it. History is only kept until you close this tab.");
  }

  function reopenConsent() {
    saveConsent(null);
    setConsent(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && abortRef.current) {
        stopRunning();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => stopRunning(), []);

  useEffect(() => {
    const onLeave = () => stopRunning();
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

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

  function stopRunning() {
    if (requestIdRef.current) cancelSummary(requestIdRef.current);
    requestIdRef.current = null;
    abortRef.current?.abort();
  }

  async function summarize(url: string) {
    stopRunning();
    const controller = new AbortController();
    const requestId = newRequestId();
    abortRef.current = controller;
    requestIdRef.current = requestId;

    setView({ status: "loading", url });
    scrollToResult();

    try {
      const result = await summarizeUrl(url, controller.signal, model === AUTO ? undefined : model, requestId);
      const item = createHistoryItem(result);
      setHistory((items) => addToHistory(items, item));
      if (result.usage !== undefined) setUsage(result.usage);
      setView({ status: "success", result, historyId: item.id, fromHistory: false });
      if (health.status === "down") checkHealth();
      if (result.failed_attempts.length > 0) {
        const first = result.requested_model ?? "The first choice AI model";
        toast.info(`Answered by ${result.provider} (${result.model})`, {
          description: `${first} was unavailable, so a fallback model was used.`,
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
      if (err instanceof ApiError && err.code === "daily_limit" && usage) setUsage({ ...usage, used: usage.limit, remaining: 0 });
      if (err instanceof ApiError && err.kind === "network") setHealth({ status: "down" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (requestIdRef.current === requestId) requestIdRef.current = null;
    }
  }

  function cancel() {
    stopRunning();
  }

  function startOver() {
    setView({ status: "idle" });
    setInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function editUrl() {
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
  else if (usage && usage.remaining === 0) blockedReason = `You've used today's ${usage.limit} summaries. More ${formatResetTime(usage.resets_at)}.`;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 lg:px-8">
        <section className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Get the gist of any web page
          </h1>
          <p className="mt-3 text-base text-pretty text-muted-foreground sm:text-lg">
            Paste a link. We read the page and AI writes you a short summary with the key points.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <StatusBanner online={online} health={health} onRecheck={checkHealth} />

            <UrlForm
              value={input}
              onChange={setInput}
              onSubmit={summarize}
              loading={loading}
              blockedReason={blockedReason}
              inputRef={inputRef}
              showExamples={view.status === "idle" && history.length === 0}
              model={model}
              onModelChange={changeModel}
              modelOptions={modelOptions}
              unavailableModels={health.status === "ok" ? health.data.unavailable_models : []}
              examples={health.status === "ok" ? health.data.examples ?? [] : []}
              maxUrlLength={health.status === "ok" ? health.data.limits?.max_url_length : undefined}
              usage={usage}
            />

            <p className="sr-only" aria-live="polite">
              {view.status === "success" && !view.fromHistory && `Summary ready: ${view.result.title}`}
              {view.status === "error" && `Error: ${view.error.title}. ${view.error.message}`}
            </p>

            <div ref={resultRef} className="scroll-mt-20 empty:hidden">
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
          </div>

          <aside className="min-w-0 space-y-6 lg:sticky lg:top-20" aria-label="History and help">
            <HistoryList
              items={history}
              consent={consent}
              onAllowSaving={allowStorage}
              activeId={view.status === "success" ? view.historyId : undefined}
              onSelect={openFromHistory}
              onRemove={removeFromHistory}
              onClear={clearHistory}
            />
            <HowItWorks models={modelOptions} />
          </aside>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <p className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          Summaries are written by AI and can contain mistakes. Check the original page for anything important.
          {health.status === "ok" && health.data.providers.length > 0 && (
            <> Powered by {health.data.providers.join(" + ")}.</>
          )}{" "}
          <button type="button" onClick={reopenConsent} className="underline underline-offset-4 hover:text-foreground">
            Storage settings
          </button>
        </p>
      </footer>

      {consent === null && <ConsentBanner onAllow={allowStorage} onDeny={denyStorage} />}
    </div>
  );
}
