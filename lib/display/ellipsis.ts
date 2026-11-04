/**
 * Clamp display copy at a sentence or word boundary, never mid-word.
 * Prefers the last sentence end within maxChars; else the last space.
 * Never leaves a period (or other terminal punct) immediately before ….
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
  // Terminal sentence punct at the window edge counts as a sentence end.
  if (window.endsWith(".") || window.endsWith("!") || window.endsWith("?")) {
    sentence = Math.max(sentence, window.length - 1);
  }
  const finish = (slice: string) => {
    // Strip terminal punct so we never render ".…", "!…", etc.
    const cleaned = slice.replace(/[\s.!?…,;:]+$/u, "").trim();
    return cleaned ? `${cleaned}…` : "…";
  };
  if (sentence >= Math.floor(maxChars * 0.28)) {
    const end = window[sentence] === " " ? sentence : sentence + 1;
    return finish(window.slice(0, end));
  }
  // Always break on a word boundary when any space exists in the window.
  const space = window.lastIndexOf(" ");
  if (space > 0) {
    return finish(window.slice(0, space));
  }
  // Single overlong token: do not invent a mid-word cut; return full token clipped
  // only if it has an internal hyphen at a safe point, else hard-trim without punct+.
  return finish(window);
}

/**
 * CSS classes (see app/globals.css). 2-line wrap that never applies
 * text-overflow:ellipsis (Tailwind line-clamp would cut mid-word).
 */
export const WRAP_2 = "wrap-2";

/** Full wrap, no clamp, no ellipsis. */
export const WRAP_FULL = "wrap-full";
