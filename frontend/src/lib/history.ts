import { config } from "@/config";
import type { HistoryItem, SummaryResponse } from "@/types";

const KEY = "summary-history";

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

export function clearSavedHistory() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, config.historyLimit)));
  } catch (err) {
    console.warn("could not save history", err);
  }
}

export function createHistoryItem(result: SummaryResponse): HistoryItem {
  return {
    ...result,
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    created_at: Date.now(),
  };
}

export function addToHistory(items: HistoryItem[], item: HistoryItem): HistoryItem[] {
  return [item, ...items.filter((i) => i.url !== item.url)].slice(0, config.historyLimit);
}

function isValidItem(item: unknown): item is HistoryItem {
  const i = item as HistoryItem;
  return (
    !!i &&
    typeof i.id === "string" &&
    typeof i.url === "string" &&
    /^https?:\/\//.test(i.url) &&
    typeof i.summary === "string" &&
    typeof i.title === "string"
  );
}
