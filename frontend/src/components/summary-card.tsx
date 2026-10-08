import { useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { Bot, Check, Clock, Copy, ExternalLink, FileText, Info, Plus, Timer } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, readingMinutes } from "@/lib/format";
import { hostnameOf } from "@/lib/url";
import type { SummaryResponse } from "@/types";

interface Props {
  result: SummaryResponse;
  onNew: () => void;
  fromHistory?: boolean;
}

function toPlainText(result: SummaryResponse) {
  return `${result.title}\n${result.url}\n\n${result.summary}\n\n(Summarized by ${result.provider} · ${result.model})`;
}

export function SummaryCard({ result, onNew, fromHistory }: Props) {
  const [copied, setCopied] = useState(false);
  const fellBack = result.failed_attempts.length > 0;

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

  return (
    <Card className="gap-0 overflow-hidden py-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
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
        {/* react-markdown doesn't render raw html, so AI output can't inject scripts */}
        <div className="prose-summary">
          <Markdown
            components={{
              // links written by the AI open in a new tab and don't pass on our page
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                  {children}
                </a>
              ),
              // no images from AI output, they could be used for tracking
              img: () => null,
            }}
          >
            {result.summary}
          </Markdown>
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

      <CardFooter className="flex-col items-stretch gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default gap-1.5" tabIndex={0}>
                <Bot />
                {result.provider} · {result.model}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-left">
              {fellBack ? (
                <div className="space-y-1">
                  <p className="font-medium">Answered by a fallback model</p>
                  {result.failed_attempts.map((a) => (
                    <p key={`${a.provider}-${a.model}`}>
                      {a.provider} · {a.model}: {a.error}
                    </p>
                  ))}
                </div>
              ) : (
                "AI model that wrote this summary"
              )}
            </TooltipContent>
          </Tooltip>
          {fellBack && (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
              fallback
            </Badge>
          )}
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

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy} className="flex-1 sm:flex-none">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={onNew} className="flex-1 sm:flex-none">
            <Plus />
            New summary
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
