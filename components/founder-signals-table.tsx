import type { FounderSignalRow } from "@/lib/domain/founder-signals";
import { SignalTierBadge } from "./badges";

const TIER_RANK: Record<string, number> = { "S+": 0, S: 1, A: 2, B: 3, C: 4, D: 5, talent: 6, Unranked: 7 };

export function FounderSignalsTable({ rows }: { rows: FounderSignalRow[] }) {
  if (rows.length === 0) return null;
  const ordered = [...rows].sort((a, b) => (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || a.signal.localeCompare(b.signal));
  return (
    <section id="founder-signals" className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Founder signals
        <span className="ml-2 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
          {ordered.length}
        </span>
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Programs, clubs, labs, and recent founder outcomes that public pages treat as places to find student founders. Each row cites a page that was read. These notes
        prioritize sources. They do not change Founder Signal, eligibility, or investment score.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border-c">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Signal</th>
              <th className="px-3 py-2 font-semibold">Why it matters</th>
              <th className="px-3 py-2 font-semibold">How to get in</th>
              <th className="px-3 py-2 font-semibold">Timing</th>
              <th className="px-3 py-2 font-semibold">Sources</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => (
              <tr key={`${row.campus}-${row.signal}`} className="border-t border-border-c align-top">
                <td className="px-3 py-2 font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <SignalTierBadge tier={row.tier} />
                    <span>{row.signal}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-foreground">{row.why}</td>
                <td className="px-3 py-2 text-foreground">{row.howToGetIn || "-"}</td>
                <td className="px-3 py-2 text-foreground">{row.timing || "-"}</td>
                <td className="px-3 py-2">
                  <ul className="space-y-1">
                    {row.sources.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline">
                          {sourceLabel(url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    const short = path.length > 42 ? `${path.slice(0, 40)}…` : path;
    return `${host}${short || ""}`;
  } catch {
    return url;
  }
}
