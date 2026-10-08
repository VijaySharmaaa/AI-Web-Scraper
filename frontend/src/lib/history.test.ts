import { describe, expect, it } from "vitest";
import { addToHistory, createHistoryItem, loadHistory, saveHistory } from "./history";
import type { SummaryResponse } from "@/types";

const result = (url: string): SummaryResponse => ({
  title: "Title",
  url,
  summary: "sum",
  provider: "Google Gemini",
  model: "gem",
  failed_attempts: [],
  char_count: 1,
  word_count: 1,
  truncated: false,
  took_seconds: 1,
});

describe("history", () => {
  it("adds newest first and replaces the same url", () => {
    let items = addToHistory([], createHistoryItem(result("https://a.com")));
    items = addToHistory(items, createHistoryItem(result("https://b.com")));
    items = addToHistory(items, createHistoryItem(result("https://a.com")));
    expect(items.map((i) => i.url)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("keeps at most 12 items", () => {
    let items = addToHistory([], createHistoryItem(result("https://0.com")));
    for (let i = 1; i < 20; i++) items = addToHistory(items, createHistoryItem(result(`https://${i}.com`)));
    expect(items).toHaveLength(12);
  });

  it("saves and loads", () => {
    const items = addToHistory([], createHistoryItem(result("https://a.com")));
    saveHistory(items);
    expect(loadHistory()).toEqual(items);
  });

  it("ignores broken or tampered storage", () => {
    localStorage.setItem("summary-history", "{not json");
    expect(loadHistory()).toEqual([]);
    localStorage.setItem("summary-history", JSON.stringify([{ id: "1", url: "javascript:alert(1)", summary: "x", title: "t" }, null, 5]));
    expect(loadHistory()).toEqual([]);
  });
});
