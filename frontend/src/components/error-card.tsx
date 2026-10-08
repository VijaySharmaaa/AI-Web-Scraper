import { AlertTriangle, Pencil, RotateCw, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/hooks/use-countdown";
import type { ErrorInfo } from "@/lib/errors";

interface Props {
  error: ErrorInfo;
  errorKey: number;
  onRetry: () => void;
  onEdit: () => void;
}

export function ErrorCard({ error, errorKey, onRetry, onEdit }: Props) {
  const wait = useCountdown(error.retryAfter, errorKey);
  const Icon = error.tone === "destructive" ? XCircle : AlertTriangle;

  return (
    <Alert variant={error.tone === "destructive" ? "destructive" : "warning"} className="px-5 py-4">
      <Icon />
      <AlertTitle className="text-base">{error.title}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {error.hint && <p className="opacity-80">{error.hint}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {error.retryable && (
            <Button size="sm" variant="outline" hover="info" onClick={onRetry} disabled={wait > 0}>
              <RotateCw />
              {wait > 0 ? `Try again in ${wait}s` : "Try again"}
            </Button>
          )}
          {(error.editUrl || !error.retryable) && (
            <Button size="sm" variant={error.retryable ? "ghost" : "outline"} hover="info" onClick={onEdit}>
              <Pencil />
              Edit URL
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
