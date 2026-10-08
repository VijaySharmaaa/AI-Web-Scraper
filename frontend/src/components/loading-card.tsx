import { Check, Globe, FileText, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/config";
import { Spinner } from "@/components/ui/spinner";
import { useElapsed } from "@/hooks/use-elapsed";
import { hostnameOf } from "@/lib/url";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Fetching the page", icon: Globe, until: config.loadingSteps.fetchSeconds },
  { label: "Extracting the main text", icon: FileText, until: config.loadingSteps.extractSeconds },
  { label: "Writing the summary with AI", icon: Sparkles, until: Infinity },
];

export function LoadingCard({ url, onCancel }: { url: string; onCancel: () => void }) {
  const elapsed = useElapsed(true);
  const current = STEPS.findIndex((s) => elapsed < s.until);

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
          {STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            const Icon = step.icon;
            return (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    !done && !active && "text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : active ? <Spinner className="size-3.5 border-[1.5px]" aria-hidden="true" role="presentation" /> : <Icon className="size-3.5" />}
                </span>
                <span className={cn(!done && !active && "text-muted-foreground", active && "font-medium")}>
                  {step.label}
                </span>
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
          {elapsed > config.loadingSteps.slowSeconds && " · this page or the AI is a bit slow, hang on…"}
        </p>
      </CardContent>
    </Card>
  );
}
