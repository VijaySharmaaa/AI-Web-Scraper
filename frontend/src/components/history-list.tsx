import { History, Trash2, X } from "lucide-react";

import type { Consent } from "@/lib/consent";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { hostnameOf } from "@/lib/url";
import { cn } from "@/lib/utils";
import type { HistoryItem } from "@/types";

interface Props {
  items: HistoryItem[];
  consent: Consent | null;
  onAllowSaving: () => void;
  activeId?: string;
  onSelect: (item: HistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryList({ items, consent, onAllowSaving, activeId, onSelect, onRemove, onClear }: Props) {
  const notSaved = consent === "denied" && (
    <p className="text-xs text-muted-foreground">
      History isn't saved on this device.{" "}
      <button type="button" onClick={onAllowSaving} className="font-medium text-foreground underline underline-offset-4">
        Save it
      </button>
    </p>
  );

  if (items.length === 0) {
    return (
      <section aria-labelledby="history-heading" className="hidden space-y-3 lg:block">
        <h2 id="history-heading" className="flex h-7 items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="size-4" />
          Recent summaries
        </h2>
        <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Your summaries will show up here so you can open them again later.
        </div>
        {notSaved}
      </section>
    );
  }

  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="history-heading" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="size-4" />
          Recent summaries
        </h2>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" hover="danger" size="sm" className="h-7 text-xs text-muted-foreground">
              <Trash2 />
              Clear all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear your history?</AlertDialogTitle>
              <AlertDialogDescription>
                {items.length === 1
                  ? "This removes the saved summary from this browser."
                  : `This removes all ${items.length} saved summaries from this browser.`}{" "}
                It can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className={buttonVariants({ variant: "outline", hover: "info" })}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onClear} className={buttonVariants({ variant: "destructive" })}>
                Clear history
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {notSaved}

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {items.map((item) => (
          <li key={item.id} className={cn("group relative flex items-center", item.id === activeId && "bg-accent/60")}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="min-w-0 flex-1 px-4 py-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60"
              aria-current={item.id === activeId || undefined}
            >
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {hostnameOf(item.url)} · {timeAgo(item.created_at)} · {item.model_label || item.model}
              </p>
            </button>
            <Button
              variant="ghost"
              hover="danger"
              size="icon-sm"
              className="mr-2 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.title} from history`}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
