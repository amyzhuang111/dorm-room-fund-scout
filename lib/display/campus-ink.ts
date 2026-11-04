/** Stable campus ink for monograms / legends — encodes campus identity, not decoration. */
const NAMED: { match: RegExp; color: string }[] = [
  { match: /penn|pennsylvania/i, color: "#011F5B" },
  { match: /stanford/i, color: "#8C1515" },
  { match: /\bmit\b|massachusetts institute/i, color: "#A31F34" },
  { match: /berkeley|uc berkeley/i, color: "#003262" },
  { match: /harvard/i, color: "#A51C30" },
  { match: /columbia/i, color: "#B9D9EB" },
  { match: /yale/i, color: "#00356B" },
  { match: /cornell/i, color: "#B31B1B" },
  { match: /georgia tech|georgia institute/i, color: "#B3A369" },
  { match: /cmu|carnegie mellon/i, color: "#C41230" },
  { match: /nyu|new york university/i, color: "#57068C" },
  { match: /ucla/i, color: "#2774AE" },
  { match: /michigan/i, color: "#FFCB05" },
  { match: /duke/i, color: "#003087" },
  { match: /northwestern/i, color: "#4E2A84" },
];

const FALLBACK = ["#2F4FD8", "#0F6B45", "#8A5A12", "#1E3A8A", "#5B2D82", "#0F5C4C", "#B42318", "#1A4A68"];

export function campusInk(campusIdOrLabel: string | null | undefined): string {
  const key = (campusIdOrLabel || "").trim();
  if (!key) return FALLBACK[0]!;
  for (const row of NAMED) {
    if (row.match.test(key)) return row.color;
  }
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length]!;
}

export const CAMPUS_INK_LEGEND = [
  { label: "Penn", color: "#011F5B" },
  { label: "Stanford", color: "#8C1515" },
  { label: "MIT", color: "#A31F34" },
  { label: "Berkeley", color: "#003262" },
  { label: "Other", color: "#2F4FD8" },
] as const;
