export function absoluteDate(iso: string | null): string {
  if (!iso) return "no date stored";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return iso.slice(0, 10);
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function parsed(iso: string): number {
  return Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}

/** Whole hours since a timestamp. 31h 38m is 31h, which is the elapsed hour, not a rounded one. */
export function updatedAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "no timestamp";
  const then = parsed(iso);
  if (Number.isNaN(then)) return "no timestamp";
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
