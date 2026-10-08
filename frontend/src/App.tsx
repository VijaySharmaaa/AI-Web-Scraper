import { useState, type FormEvent } from "react";
import { summarizeUrl } from "./api";
import SummaryCard from "./components/SummaryCard";
import type { SummaryResponse } from "./types";

const EXAMPLES = [
  "https://en.wikipedia.org/wiki/Web_scraping",
  "https://www.paulgraham.com/greatwork.html",
];

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SummaryResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await summarizeUrl(url.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <header className="hero">
        <h1>AI Web Summarizer</h1>
        <p>Paste any article or web page URL and get a short summary.</p>
      </header>

      <form className="search" onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="url"
          placeholder="https://example.com/some-article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          aria-label="Web page URL"
          autoFocus
        />
        <button type="submit" disabled={loading || !url.trim()}>
          {loading ? "Summarizing..." : "Summarize"}
        </button>
      </form>

      {!result && !loading && !error && (
        <div className="examples">
          Try:
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="link" onClick={() => setUrl(ex)}>
              {new URL(ex).hostname}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="card loading" role="status" aria-live="polite">
          <div className="spinner" />
          <div>
            <strong>Loading...</strong>
            <p>Scraping the page and asking the AI to summarize it.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="card error" role="alert">
          <strong>Something went wrong</strong>
          <p>{error}</p>
        </div>
      )}

      {result && <SummaryCard result={result} />}
    </main>
  );
}
