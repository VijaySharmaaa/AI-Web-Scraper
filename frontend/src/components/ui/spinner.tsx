import { cn } from "@/lib/utils";

/**
 * Loading spinner (same api as shadcn's Spinner).
 * A full ring with one colored segment, so it looks the same at every angle,
 * and `will-change` keeps it on its own GPU layer so it doesn't wobble when
 * it sits on a fractional pixel (e.g. next to centered button text).
 */
function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current will-change-transform",
        className
      )}
      {...props}
    />
  );
}

export { Spinner };
