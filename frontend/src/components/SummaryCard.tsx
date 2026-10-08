import { useState } from "react";
import Markdown from "react-markdown";
import type { SummaryResponse } from "../types";

interface Props {
  result: SummaryResponse;
}

export default function SummaryCard({ result }: Props) {
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn("clipboard not available", err);
    }
  }

  return (
    <article className="card result">
      <div className="result-head">
        <div>
          <h2>{result.title}</h2>
          <a href={result.url} target="_blank" rel="noreferrer">
            {result.url}
          </a>
        </div>
        <button type="button" className="secondary" onClick={copySummary}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="summary">
        <Markdown>{result.summary}</Markdown>
      </div>

      <footer className="meta">
        {result.char_count.toLocaleString()} characters scraped
        {result.truncated && " (trimmed before sending to AI)"} · {result.model} ·{" "}
        {result.took_seconds}s
      </footer>
    </article>
  );
}
