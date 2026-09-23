export function buildHref(base: string, current: Record<string, string | undefined>, overrides: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v) params.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
