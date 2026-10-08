import { useEffect, useState } from "react";

/** Counts down from `seconds` to 0. Pass 0 / undefined to stop. */
export function useCountdown(seconds: number | undefined, key?: unknown) {
  const [left, setLeft] = useState(seconds ?? 0);

  useEffect(() => {
    setLeft(seconds ?? 0);
    if (!seconds) return;
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [seconds, key]);

  return left;
}
