import { useEffect, useState } from "react";

export function useCountdown(seconds: number | undefined) {
  const [endsAt] = useState(() => (seconds ? Date.now() + seconds * 1000 : 0));
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}
