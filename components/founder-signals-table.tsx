import type { FounderSignalRow } from "@/lib/domain/founder-signals";

export function FounderSignalsTable({ rows }: { rows: FounderSignalRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section id="founder-signals" className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Founder signals
        <span className="ml-2 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
          {rows.length}
        </span>
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Programs, clubs, and labs that public pages and campus discussions treat as places to find student founders. Each row cites a page that was read. These notes
        prioritize sources. They do not change Founder Signal, eligibility, or investment score.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border-c">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Signal</th>
              <th className="px-3 py-2 font-semibold">Campus</th>
              <th className="px-3 py-2 font-semibold">Why it matters</th>
              <th className="px-3 py-2 font-semibold">Sources</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.campus}-${row.signal}`} className="border-t border-border-c align-top">
                <td className="px-3 py-2 font-medium text-foreground">{row.signal}</td>
                <td className="px-3 py-2 text-foreground">{row.campus}</td>
                <td className="px-3 py-2 text-foreground">{row.why}</td>
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
      <p className="mt-2 text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
        {rows.length.toLocaleString()} signals
      </p>
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
