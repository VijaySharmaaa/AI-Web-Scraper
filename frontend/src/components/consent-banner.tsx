import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  onAllow: () => void;
  onDeny: () => void;
}

export function ConsentBanner({ onAllow, onDeny }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-text"
      className="fixed inset-x-0 bottom-0 z-50 p-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:p-0"
    >
      <div className="rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50">
            <Cookie className="size-4 text-muted-foreground" />
          </span>
          <div className="space-y-1">
            <p id="consent-title" className="text-sm font-medium">
              Save your history on this device?
            </p>
            <p id="consent-text" className="text-sm text-muted-foreground">
              We'd like to keep your recent summaries in this browser so you can open them again later. Nothing is
              sent to a server or used for tracking, and you can change this any time.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 sm:justify-end">
          <Button variant="outline" hover="danger" size="sm" className="flex-1 sm:flex-none" onClick={onDeny}>
            No thanks
          </Button>
          <Button size="sm" hover="success" className="flex-1 sm:flex-none" onClick={onAllow}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
