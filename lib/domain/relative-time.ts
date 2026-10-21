export function absoluteDate(iso: string | null): string {
  if (!iso) return "no date stored";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return iso.slice(0, 10);
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "no timestamp";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return "no timestamp";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
