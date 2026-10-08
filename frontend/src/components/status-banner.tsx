import { CloudOff, RefreshCw, ServerCrash, WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { HealthResponse } from "@/types";

export type HealthState =
  | { status: "checking" }
  | { status: "ok"; data: HealthResponse }
  | { status: "down" };

interface Props {
  online: boolean;
  health: HealthState;
  onRecheck: () => void;
}

/** Problems we can spot before the user even clicks Summarize. */
export function StatusBanner({ online, health, onRecheck }: Props) {
  if (!online) {
    return (
      <Alert variant="warning">
        <WifiOff />
        <AlertTitle>You're offline</AlertTitle>
        <AlertDescription>Reconnect to the internet to summarize pages. Your history still works.</AlertDescription>
      </Alert>
    );
  }

  if (health.status === "down") {
    return (
      <Alert variant="destructive">
        <ServerCrash />
        <AlertTitle>Can't reach the server</AlertTitle>
        <AlertDescription>
          <p>The backend isn't responding. If it was asleep it can take ~30 seconds to wake up.</p>
          <Button variant="outline" size="sm" className="mt-1" onClick={onRecheck}>
            <RefreshCw /> Check again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (health.status === "ok" && !health.data.ai_ready) {
    return (
      <Alert variant="warning">
        <CloudOff />
        <AlertTitle>No AI provider configured</AlertTitle>
        <AlertDescription>
          <p>
            Add <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">GEMINI_API_KEY</code> or{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">GROQ_API_KEY</code> to{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">backend/.env</code> and restart
            the server.
          </p>
          <Button variant="outline" size="sm" className="mt-1" onClick={onRecheck}>
            <RefreshCw /> Check again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
