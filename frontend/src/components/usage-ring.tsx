import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatResetTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Usage } from "@/types";

const SIZE = 24;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = STROKE + 3;

export function UsageRing({ usage }: { usage: Usage }) {
  const { limit, remaining } = usage;
  const empty = remaining === 0;
  const segments = Math.max(1, Math.min(limit, 12));
  const length = CIRCUMFERENCE / segments - (segments > 1 ? GAP : 0);
  const label = empty
    ? `No summaries left today, resets ${formatResetTime(usage.resets_at)}`
    : `${remaining} of ${limit} summaries left today`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className={cn(
            "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            empty ? "text-destructive" : "text-foreground"
          )}
        >
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            {Array.from({ length: segments }, (_, i) => (
              <circle
                key={i}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${length} ${CIRCUMFERENCE}`}
                strokeDashoffset={-(CIRCUMFERENCE / segments) * i}
                className={cn(
                  "transition-[stroke] duration-500",
                  i < remaining ? "stroke-current" : empty ? "stroke-destructive/30" : "stroke-foreground/15"
                )}
              />
            ))}
          </svg>
          <span className="absolute text-[10px] font-semibold tabular-nums">{remaining}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
