import type { HistoryItem, SummaryResponse } from "@/types";

const KEY = "summary-history";
const MAX_ITEMS = 12;

// localStorage can throw (private mode, storage full, blocked cookies) so every
// call is wrapped and history just quietly stops working in that case

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
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
  // newest first, and only keep the latest summary for the same page
  return [item, ...items.filter((i) => i.url !== item.url)].slice(0, MAX_ITEMS);
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
