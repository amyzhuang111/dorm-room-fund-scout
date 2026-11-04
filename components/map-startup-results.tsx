"use client";
import Link from "next/link";
import { useState } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";

export function MapStartupResults({ companies, ready, query, campusId, compact = false }: { companies: FacetCompany[]; ready: boolean; query: string; campusId: string | null; compact?: boolean }) {
  const [limit, setLimit] = useState(12);
  const needle = query.trim().toLowerCase();
  const matches = companies.filter(c => {
    if (campusId === "missing" ? Boolean(c.schoolId) : campusId && c.schoolId !== campusId) return false;
    return !needle || [c.name, c.school, c.description, c.sector, ...(c.founders ?? []), ...(c.programs ?? [])].join(" ").toLowerCase().includes(needle);
  });
  if (!ready) return <p role="status" className="py-3 text-sm text-fg-2">Loading startups…</p>;
  return <section aria-label="Startup results" data-map-startups="">
    <p role="status" className="py-2 text-sm text-fg-2">{matches.length.toLocaleString()} startups</p>
    {matches.length === 0 && <p className="py-3 text-sm">No startups match. Try another search or campus.</p>}
    <div className="divide-y divide-line">{matches.slice(0, compact ? 2 : limit).map(c => <Link key={c.id} href={`/startup/${encodeURIComponent(c.id)}?from=map`} className="block rounded px-1 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
      <p className="font-semibold text-fg">{c.name} <span aria-hidden="true">↗</span></p>
      <p className="mt-1 text-xs text-fg-2">{[c.school, c.sector, c.stage].filter(Boolean).join(" · ")}</p>
      {c.description && <p className="mt-2 line-clamp-2 text-sm text-fg-2">{c.description}</p>}
      {!!c.founders?.length && <p className="mt-2 text-xs text-fg-2">{c.founders.join(" · ")}</p>}
    </Link>)}</div>
    {!compact && matches.length > limit && <button type="button" className="min-h-11 w-full text-sm font-semibold text-link" onClick={() => setLimit(n => n + 12)}>Show more startups</button>}
  </section>;
}
