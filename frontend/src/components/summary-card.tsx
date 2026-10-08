import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { toast } from "sonner";
import { Bot, Check, Clock, Copy, Download, ExternalLink, FileText, Info, Plus, Timer } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, readingMinutes, tidySummary } from "@/lib/format";
import { downloadSummaryPdf, fitsBuiltInFont, printSummary } from "@/lib/pdf";
import { hostnameOf } from "@/lib/url";
import type { SummaryResponse } from "@/types";

interface Props {
  result: SummaryResponse;
  onNew: () => void;
  fromHistory?: boolean;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  img: () => null,
};

function toPlainText(result: SummaryResponse) {
  const model = result.model_label || result.model;
  return `${result.title}\n${result.url}\n\n${tidySummary(result.summary)}\n\n(Summarized by ${result.provider} · ${model})`;
}

export function SummaryCard({ result, onNew, fromHistory }: Props) {
  const [copied, setCopied] = useState(false);
  const [makingPdf, setMakingPdf] = useState(false);
  const summary = tidySummary(result.summary);

  async function copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(result));
      setCopied(true);
      toast.success("Summary copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("copy failed", err);
      toast.error("Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  async function downloadPdf() {
    if (!fitsBuiltInFont(result.title + summary)) {
      toast("Choose “Save as PDF” in the print window", {
        description: "This page uses characters the quick PDF export can't draw.",
      });
      printSummary();
      return;
    }
    setMakingPdf(true);
    try {
      await downloadSummaryPdf(result);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error("pdf failed", err);
      toast.error("Couldn't create the PDF. Try again, or use your browser's print → Save as PDF.");
    } finally {
      setMakingPdf(false);
    }
  }

  return (
    <Card
      data-print-root className="gap-0 overflow-hidden py-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <CardHeader className="gap-2 border-b bg-muted/40 py-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{hostnameOf(result.url)}</span>
          {fromHistory && <Badge variant="outline" className="font-normal">From history</Badge>}
        </div>
        <h2 className="text-lg leading-snug font-semibold text-balance sm:text-xl">{result.title}</h2>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex w-fit max-w-full items-center gap-1 text-sm text-primary hover:underline"
        >
          <span className="truncate">Open original page</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      </CardHeader>

      <CardContent className="py-6">
        <div className="prose-summary">
          <Markdown components={MARKDOWN_COMPONENTS}>{summary}</Markdown>
        </div>

        {result.truncated && (
          <Alert variant="info" className="mt-5">
            <Info />
            <AlertDescription>
              This page is long, so only the first part was used for the summary.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <Separator />

      <CardFooter className="flex-col items-stretch gap-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default gap-1.5" tabIndex={0}>
                <Bot />
                {result.provider} · {result.model_label || result.model}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {result.requested_model ? "Written by the model you picked" : "Written by the model Auto picked"}
            </TooltipContent>
          </Tooltip>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <FileText className="size-3.5" />
            {formatNumber(result.word_count)} words
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3.5" />
            {readingMinutes(result.word_count)} min read saved
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Timer className="size-3.5" />
            {result.took_seconds.toFixed(1)}s
          </span>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end" data-print-hide>
          <Button variant="outline" hover="info" size="sm" onClick={copy} className="flex-1 sm:flex-none">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" hover="info" size="sm" onClick={downloadPdf} disabled={makingPdf} className="flex-1 sm:flex-none">
            {makingPdf ? <Spinner aria-hidden="true" role="presentation" /> : <Download />}
            PDF
          </Button>
          <Button size="sm" hover="success" onClick={onNew} className="flex-1 sm:flex-none">
            <Plus />
            New summary
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
