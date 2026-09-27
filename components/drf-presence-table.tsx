import type { DrfCampusPresence } from "@/lib/domain/drf-presence";

export function DrfPresenceTable({ rows }: { rows: DrfCampusPresence[] }) {
  return (
    <section id="drf-presence" className="mx-auto max-w-[1100px] px-4 pt-5 sm:px-6">
      <h1 className="text-2xl text-foreground">DRF campus presence</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Where Dorm Room Fund has a current, recent, historical, or portfolio tie, checked 27 Sep 2026. Named partners are only the people listed in that directory.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border-c">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">School</th>
              <th className="px-3 py-2 font-semibold">Region</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">On team page</th>
              <th className="px-3 py-2 font-semibold">Named partners</th>
              <th className="px-3 py-2 font-semibold">Evidence</th>
              <th className="px-3 py-2 font-semibold">Vs v1</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border-c align-top">
                <td className="px-3 py-2 font-medium text-foreground">{row.school}</td>
                <td className="px-3 py-2 text-foreground">{row.region}</td>
                <td className="px-3 py-2 text-foreground">{row.status}</td>
                <td className="px-3 py-2 text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.partnerCount}
                </td>
                <td className="px-3 py-2 text-foreground">{row.namedPartners}</td>
                <td className="px-3 py-2">
                  {row.evidenceLinks.length === 0 && <span className="text-xs text-muted">none found</span>}
                  <ul className="space-y-1">
                    {row.evidenceLinks.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-link hover:underline">
                          {linkLabel(url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-2 text-xs text-muted">{row.changeVsV1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
        {rows.length.toLocaleString()} schools · checked {rows[0]?.dateChecked || "27 Sep 2026"}
      </p>
    </section>
  );
}

function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    const short = path.length > 36 ? `${path.slice(0, 34)}…` : path;
    return `${host}${short || ""}`;
  } catch {
    return url;
  }
}
