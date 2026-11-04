/**
 * Map raw stored enums / snake_case tokens to readable labels for display.
 * Display-only: never rewrite stored values.
 */
const EXACT: Record<string, string> = {
  current_student: "Current student",
  recent_grad: "Recent grad",
  older_alumni: "Alumni",
  unverified: "Unconfirmed",
  unknown: "Unknown",
  // plainText() can turn an em-dash form into a comma before render
  "current, student": "Current student",
  "recent, grad": "Recent grad",
  "older, alumni": "Alumni",
};

const TOKEN = /\b(current_student|recent_grad|older_alumni|unverified)\b/g;
const COMMA_TOKEN = /\b(current),\s*(student)\b|\b(recent),\s*(grad)\b|\b(older),\s*(alumni)\b/gi;

export function enrollmentLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const key = status.trim();
  if (!key) return null;
  return EXACT[key] ?? EXACT[key.toLowerCase()] ?? null;
}

/** Replace known raw enum tokens inside free text (pitch, signal, chips). */
export function humanizeEnumText(value: string | null | undefined): string | null {
  if (value == null) return null;
  let text = value;
  text = text.replace(TOKEN, (m) => EXACT[m] ?? m);
  text = text.replace(COMMA_TOKEN, (_m, a, b, c, d, e, f) => {
    if (a && b) return "Current student";
    if (c && d) return "Recent grad";
    if (e && f) return "Alumni";
    return _m;
  });
  return text;
}
