/**
 * Clamp display copy at a sentence or word boundary, never mid-word.
 * Prefers the last sentence end within maxChars; else the last space.
 */
export function ellipsisAtBoundary(raw: string, maxChars: number): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxChars) return text;
  const window = text.slice(0, Math.max(1, maxChars));
  let sentence = -1;
  for (const mark of [". ", "! ", "? "]) {
    const at = window.lastIndexOf(mark);
    if (at > sentence) sentence = at;
  }
  // Also allow a terminal period at the window edge.
  if (window.endsWith(".") || window.endsWith("!") || window.endsWith("?")) {
    sentence = Math.max(sentence, window.length - 1);
  }
  if (sentence >= Math.floor(maxChars * 0.28)) {
    const end = window[sentence] === " " ? sentence : sentence + 1;
    return `${window.slice(0, end).trim()}…`;
  }
  const space = window.lastIndexOf(" ");
  if (space >= Math.floor(maxChars * 0.35)) {
    return `${window.slice(0, space).replace(/[.,;:]+$/, "").trim()}…`;
  }
  return `${window.replace(/[.,;:]+$/, "").trim()}…`;
}

/**
 * CSS classes (see app/globals.css). 2-line wrap that never applies
 * text-overflow:ellipsis (Tailwind line-clamp would cut mid-word).
 */
export const WRAP_2 = "wrap-2";

/** Full wrap, no clamp, no ellipsis. */
export const WRAP_FULL = "wrap-full";
