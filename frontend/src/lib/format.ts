export function readingMinutes(words: number) {
  return Math.max(1, Math.round(words / 230));
}

export function timeAgo(timestamp: number, now = Date.now()) {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function formatNumber(n: number) {
  return n.toLocaleString("en-US");
}

export function formatResetTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "tomorrow";
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? `at ${time}` : `tomorrow at ${time}`;
}
