export function absoluteDate(iso: string | null): string {
  if (!iso) return "no date stored";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return iso.slice(0, 10);
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function parsed(iso: string): number {
  return Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}

/** One format everywhere: minutes, then hours, then whole days (`2d ago`). */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "no timestamp";
  const then = parsed(iso);
  if (Number.isNaN(then)) return "no timestamp";
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function updatedAgo(iso: string | null, now = Date.now()): string {
  return relativeTime(iso, now);
}

export function updatedToday(iso: string | null, now = Date.now()): boolean {
  if (!iso) return false;
  const then = parsed(iso);
  if (Number.isNaN(then)) return false;
  return now - then < 24 * 60 * 60 * 1000;
}

export function updatedWithinHour(iso: string | null, now = Date.now()): boolean {
  if (!iso) return false;
  const then = parsed(iso);
  if (Number.isNaN(then)) return false;
  return now - then < 60 * 60 * 1000;
}

