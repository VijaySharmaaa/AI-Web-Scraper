import { tidySummary } from "@/lib/format";
import type { SummaryResponse } from "@/types";

export interface Segment {
  text: string;
  bold: boolean;
}

export interface Block {
  type: "paragraph" | "bullet";
  segments: Segment[];
}

function cleanInline(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\W)[_*]([^_*]+)[_*](?=\W|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}

function toSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const bold = part.startsWith("**") && part.endsWith("**");
    const text = cleanInline(bold ? part.slice(2, -2) : part);
    if (text) segments.push({ text, bold });
  }
  return segments;
}

export function parseSummary(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) blocks.push({ type: "bullet", segments: toSegments(bullet[1]) });
    else blocks.push({ type: "paragraph", segments: toSegments(line.replace(/^#+\s*/, "")) });
  }
  return blocks;
}

const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/[•·∙]/g, "-"],
  [/ /g, " "],
  [/[​‌‍﻿]/g, ""],
];

export function plain(text: string) {
  return REPLACEMENTS.reduce((t, [re, to]) => t.replace(re, to), text);
}

export function fitsBuiltInFont(text: string) {
  return /^[\u0000-ÿ]*$/.test(plain(text));
}

export function pdfFileName(title: string) {
  const slug = plain(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "summary"}-summary.pdf`;
}

export async function downloadSummaryPdf(result: SummaryResponse, date = new Date()) {
  const doc = await buildSummaryPdf(result, date);
  doc.save(pdfFileName(result.title));
}

export async function buildSummaryPdf(result: SummaryResponse, date = new Date()) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  const footerSpace = 20;
  const bottom = pageHeight - margin - footerSpace;
  let y = margin;

  const gray = () => doc.setTextColor(110, 110, 110);
  const black = () => doc.setTextColor(20, 20, 20);

  function ensureSpace(height: number) {
    if (y + height > bottom) {
      doc.addPage();
      y = margin;
    }
  }

  function wrapped(text: string, size: number, style: "normal" | "bold", lineHeight = size * 1.4) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(plain(text), maxWidth) as string[]) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y + size);
      y += lineHeight;
    }
  }

  function richText(segments: Segment[], x: number, width: number, size = 11) {
    const lineHeight = size * 1.55;
    let cursor = x;
    ensureSpace(lineHeight);
    doc.setFontSize(size);

    for (const seg of segments) {
      doc.setFont("helvetica", seg.bold ? "bold" : "normal");
      for (const word of plain(seg.text).split(/(\s+)/)) {
        if (!word) continue;
        const isSpace = /^\s+$/.test(word);
        const w = doc.getTextWidth(isSpace ? " " : word);
        if (!isSpace && cursor + w > x + width && cursor > x) {
          y += lineHeight;
          ensureSpace(lineHeight);
          cursor = x;
        }
        if (isSpace) {
          if (cursor > x) cursor += w;
          continue;
        }
        doc.text(word, cursor, y + size);
        cursor += w;
      }
    }
    y += lineHeight;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  gray();
  doc.text("AI WEB SUMMARIZER", margin, y);
  y += 18;

  black();
  wrapped(result.title, 18, "bold", 24);
  y += 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  for (const line of doc.splitTextToSize(result.url, maxWidth) as string[]) {
    ensureSpace(13);
    doc.textWithLink(line, margin, y + 9, { url: result.url });
    y += 13;
  }

  y += 4;
  gray();
  const meta = [
    `Summarized by ${result.provider} (${result.model_label || result.model})`,
    date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    `${result.word_count.toLocaleString("en-US")} words on the page`,
  ].join("  ·  ");
  wrapped(meta, 9, "normal", 13);

  y += 8;
  doc.setDrawColor(225, 225, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  black();
  for (const block of parseSummary(tidySummary(result.summary))) {
    if (block.type === "bullet") {
      ensureSpace(17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("-", margin + 4, y + 11);
      richText(block.segments, margin + 18, maxWidth - 18);
      y += 2;
    } else {
      y += 4;
      richText(block.segments, margin, maxWidth);
      y += 4;
    }
  }

  if (result.truncated) {
    y += 6;
    gray();
    wrapped("Note: the page was long, so only the first part was used for this summary.", 9, "normal", 13);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    gray();
    doc.text("Written by AI, it can contain mistakes. Check the original page for anything important.", margin, pageHeight - margin + 10);
    doc.text(`${i} / ${pages}`, pageWidth - margin, pageHeight - margin + 10, { align: "right" });
  }

  return doc;
}

export function printSummary() {
  const root = document.documentElement;
  root.classList.add("print-summary");
  const done = () => {
    root.classList.remove("print-summary");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
