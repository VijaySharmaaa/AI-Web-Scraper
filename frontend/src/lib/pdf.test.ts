import { describe, expect, it } from "vitest";
import { buildSummaryPdf, fitsBuiltInFont, parseSummary, pdfFileName, plain } from "./pdf";

const RESULT = {
  title: "Web scraping – Wikipedia",
  url: "https://en.wikipedia.org/wiki/Web_scraping",
  summary:
    "Scraping pulls data from websites.\n\n**Key points:**\n- Uses **bots** and [scripts](https://x.com)\n- Parses _HTML_\n1. numbered item",
  provider: "Groq",
  model: "llama-3.3-70b-versatile",
  char_count: 1000,
  word_count: 200,
  truncated: true,
  took_seconds: 2,
};

describe("parseSummary", () => {
  it("reads paragraphs, bold parts and bullets", () => {
    const blocks = parseSummary(RESULT.summary);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph", "bullet", "bullet", "bullet"]);
    expect(blocks[0].segments[0]).toEqual({ text: "Scraping pulls data from websites.", bold: false });
    expect(blocks[2].segments.map((s) => s.text).join("")).toBe("Uses bots and scripts");
    expect(blocks[3].segments[0].text).toBe("Parses HTML");
  });
});

describe("characters", () => {
  it("swaps smart punctuation for plain characters", () => {
    expect(plain("“Hi” – it’s…")).toBe('"Hi" - it\'s...');
  });

  it("knows which text the built-in font can draw", () => {
    expect(fitsBuiltInFont("Café crème – “ok”")).toBe(true);
    expect(fitsBuiltInFont("नमस्ते दुनिया")).toBe(false);
    expect(fitsBuiltInFont("こんにちは")).toBe(false);
  });
});

describe("pdfFileName", () => {
  it("makes a safe file name", () => {
    expect(pdfFileName("Web scraping – Wikipedia")).toBe("web-scraping-wikipedia-summary.pdf");
    expect(pdfFileName("../../etc/passwd")).toBe("etc-passwd-summary.pdf");
    expect(pdfFileName("नमस्ते")).toBe("summary-summary.pdf");
  });
});

describe("buildSummaryPdf", () => {
  it("creates a pdf with the title and summary", async () => {
    const doc = await buildSummaryPdf(RESULT, new Date("2026-10-08"));
    const raw = doc.output();
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("Wikipedia");
    expect(raw).toContain("points:");
    expect(raw).toContain("llama-3.3-70b-versatile");
  });

  it("spreads a long summary over several pages", async () => {
    const long = { ...RESULT, summary: Array.from({ length: 120 }, (_, i) => `- point number ${i}`).join("\n") };
    const doc = await buildSummaryPdf(long);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
