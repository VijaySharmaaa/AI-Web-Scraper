import { useEffect, useState } from "react";

export function useElapsed() {
  const [start] = useState(Date.now);
  const [now, setNow] = useState(start);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  return (now - start) / 1000;
}
