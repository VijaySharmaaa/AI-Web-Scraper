import { Gauge } from "lucide-react";

import { formatResetTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Usage } from "@/types";

export function UsageMeter({ usage }: { usage: Usage }) {
  const empty = usage.remaining === 0;

  return (
    <div className={cn("flex items-center gap-2 text-sm", empty ? "text-destructive" : "text-muted-foreground")}>
      <Gauge className="size-4" />
      <span>
        {empty ? (
          <>Daily limit reached · resets {formatResetTime(usage.resets_at)}</>
        ) : (
          <>
            <span className="font-medium text-foreground tabular-nums">{usage.remaining}</span> of{" "}
            <span className="tabular-nums">{usage.limit}</span> summaries left today
          </>
        )}
      </span>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: usage.limit }, (_, i) => (
          <span
            key={i}
            className={cn("size-1.5 rounded-full", i < usage.remaining ? "bg-foreground/70" : "bg-foreground/15")}
          />
        ))}
      </span>
    </div>
  );
}
