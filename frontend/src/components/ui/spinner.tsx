import { cn } from "@/lib/utils";

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
