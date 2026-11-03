import type { ClaimRow } from "@/lib/domain/queries";

export function evidenceDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value ?? "");
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toISOString().slice(0, 10) === `${y}-${m}-${d}` ? `${y}-${m}-${d}` : null;
}

export function formatEvidenceDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

/** Collection is distinct from verification; no verification date is inferred. */
export function latestSourceCollection(claims: Pick<ClaimRow, "sourceUrl" | "retrievedAt">[], sourceUrl?: string): string | null {
  return claims.filter(c => !sourceUrl || c.sourceUrl === sourceUrl)
    .map(c => evidenceDate(c.retrievedAt)).filter((d): d is string => !!d).sort().at(-1) ?? null;
}
