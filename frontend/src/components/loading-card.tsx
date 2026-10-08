import { Check, FileText, Globe, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";
import { useElapsed } from "@/hooks/use-elapsed";
import { hostnameOf } from "@/lib/url";
import { cn } from "@/lib/utils";

export interface LoadingProgress {
  step: "starting" | "fetching" | "reading" | "writing";
  modelLabel?: string;
  note?: string;
}

const ORDER: LoadingProgress["step"][] = ["fetching", "reading", "writing"];

function StepIcon({ state, icon: Icon }: { state: "done" | "active" | "waiting"; icon: typeof Globe }) {
  if (state === "active") {
    return (
      <span
        aria-hidden="true"
        className="size-7 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary will-change-transform"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border",
        state === "done" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
    </span>
  );
}

export function LoadingCard({ url, progress, onCancel }: { url: string; progress: LoadingProgress; onCancel: () => void }) {
  const elapsed = useElapsed();
  const current = Math.max(0, ORDER.indexOf(progress.step === "starting" ? "fetching" : progress.step));

  const steps = [
    { icon: Globe, label: "Fetching the page" },
    { icon: FileText, label: "Reading the main text" },
    {
      icon: Sparkles,
      label: progress.modelLabel ? `Writing the summary with ${progress.modelLabel}` : "Writing the summary",
    },
  ];

  return (
    <Card className="gap-5" role="status" aria-live="polite" aria-busy="true">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">Loading...</p>
            <p className="truncate text-sm text-muted-foreground">Summarizing {hostnameOf(url)}</p>
          </div>
          <Button variant="outline" hover="danger" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <ol className="space-y-3">
          {steps.map((step, i) => {
            const state = i < current ? "done" : i === current ? "active" : "waiting";
            return (
              <li key={step.label} className="flex items-start gap-3 text-sm">
                <StepIcon state={state} icon={step.icon} />
                <div className="min-w-0 pt-1">
                  <p className={cn(state === "waiting" && "text-muted-foreground", state === "active" && "font-medium")}>
                    {step.label}
                  </p>
                  {i === 2 && progress.note && (
                    <p key={progress.note} className="text-xs text-muted-foreground animate-in fade-in-0 duration-300">
                      {progress.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="space-y-2.5 pt-1" aria-hidden="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>

        <p className="text-xs text-muted-foreground tabular-nums">
          {elapsed.toFixed(0)}s
          {elapsed > config.slowAfterSeconds && " · this is taking a bit longer than usual, hang on…"}
        </p>
      </CardContent>
    </Card>
  );
}
