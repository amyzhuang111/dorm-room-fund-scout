"use client";

/** Two letters from a stored name. The seal around them is the mark. */
export function companyInitials(name: string): string {
  const cleaned = name.replace(/["""'']/g, " ").replace(/[^a-zA-Z0-9&+\s.-]/g, " ").trim();
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean).filter((part) => !/^(inc|llc|ltd|co|corp|the|and|&)$/i.test(part));
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const word = parts[0]!;
    if (/^[A-Z0-9]{2,4}$/.test(word)) return word.slice(0, 3).toUpperCase();
    return word.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

function hue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/** Geometric seal. Initials sit inside a drawn ring, not as the whole mark. */
export function DrawnMark({ name, className }: { name: string; className?: string }) {
  const initials = companyInitials(name).slice(0, 2);
  const turn = hue(name);
  const large = turn % 2;
  const radians = (turn * Math.PI) / 180;
  const x = 16 + 12.8 * Math.cos(radians);
  const y = 16 + 12.8 * Math.sin(radians);
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden data-logo-fallback="drawn">
      <circle cx="16" cy="16" r="15" fill="#FFFBF6" stroke="#E85D04" strokeWidth="1.6" />
      <path d={`M16 16 L16 3.2 A12.8 12.8 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="#F08A3A" />
      <circle cx="16" cy="16" r="9.4" fill="#FFF4E8" stroke="#9A3412" strokeWidth="0.8" />
      <text x="16" y="19.4" textAnchor="middle" fontSize="9" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700" fill="#9A3412">
        {initials}
      </text>
    </svg>
  );
}

/** Same-origin tiles that are tiny, empty, or one flat color are not usable marks. */
export function imageIsFlat(img: HTMLImageElement): boolean {
  if (img.naturalWidth < 8 || img.naturalHeight < 8) return true;
  if (img.naturalWidth <= 16 && img.naturalHeight <= 16) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 12;
    canvas.height = 12;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 12, 12);
    const { data } = ctx.getImageData(0, 0, 12, 12);
    let min = 765;
    let max = 0;
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 20) continue;
      opaque += 1;
      const sum = data[i]! + data[i + 1]! + data[i + 2]!;
      if (sum < min) min = sum;
      if (sum > max) max = sum;
    }
    if (opaque < 8) return true;
    return max - min < 24;
  } catch {
    return false;
  }
}
