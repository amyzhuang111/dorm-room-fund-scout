"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LinkedInIconButton } from "@/components/person-link";
import { linkedinActionFromStored } from "@/lib/domain/person-link";
import type { AlumReferral, IntroCoverage, IntroStrength } from "@/lib/domain/who-can-intro";

const STRENGTH_CLASS: Record<IntroStrength, string> = {
  strong: "border-ok/30 bg-ok-bg text-ok",
  medium: "border-warn/30 bg-warn-bg text-warn",
  weak: "border-border-c bg-surface-2 text-foreground",
};

function linkedInFor(alum: AlumReferral) {
  if (!alum.linkedinUrl) return null;
  return linkedinActionFromStored({
    name: alum.name,
    linkedinUrl: alum.linkedinUrl,
    linkedinStatus: alum.linkedinConfidence === "confirmed" || alum.linkedinConfidence === "likely" ? alum.linkedinConfidence : "unverified",
    school: alum.school,
    company: alum.firm,
  });
}

export function AlumniReferrals({ rows, coverage }: { rows: AlumReferral[]; coverage: IntroCoverage }) {
  const [query, setQuery] = useState("");
  const [canReferOnly, setCanReferOnly] = useState(false);
  const [sort, setSort] = useState<"reach" | "name">("reach");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (canReferOnly && !row.canRefer) return false;
      if (!needle) return true;
      const haystack = [row.name, row.school, row.firm, row.role, row.years, ...row.startups.map((startup) => startup.name)].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
    return [...matched].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.reach - a.reach || b.weakReach - a.weakReach || a.name.localeCompare(b.name);
    });
  }, [rows, query, canReferOnly, sort]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 text-foreground sm:px-6">
      <h1 className="text-2xl font-semibold">DRF alumni</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        {coverage.alumni.toLocaleString()} former student partners. School, class years, current role, and LinkedIn are the stored alumni record.
        Startups are companies in this database they founded or whose name matches their current firm.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-foreground">
        <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{coverage.startupsWithPath.toLocaleString()}</span> of{" "}
        {coverage.trackedStartups.toLocaleString()} tracked startups have a DRF intro path.{" "}
        <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{coverage.startupsWithWarmPath.toLocaleString()}</span> of those are strong or medium
        (same school and years, a club or batch, a company, or a co-founder).{" "}
        <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{coverage.alumniWhoCanRefer.toLocaleString()}</span> alumni can refer.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search alumni"
          placeholder="Search name, school, firm, startup…"
          className="w-full max-w-sm rounded-md border border-border-c bg-white px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
        />
        <button
          type="button"
          aria-pressed={canReferOnly}
          onClick={() => setCanReferOnly((value) => !value)}
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${canReferOnly ? "border-ok/30 bg-ok-bg text-ok" : "border-border-c bg-white text-foreground"}`}
        >
          Can refer
        </button>
        <label className="flex items-center gap-1 text-sm text-muted">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value === "name" ? "name" : "reach")} className="rounded-md border border-border-c bg-white px-2 py-1 text-sm text-foreground">
            <option value="reach">Startups they can reach</option>
            <option value="name">Name</option>
          </select>
        </label>
        <span className="text-sm text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>{visible.length} shown</span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-md border border-border-c">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Alum</th>
              <th className="px-3 py-2 font-semibold">School / years</th>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Startup</th>
              <th className="px-3 py-2 font-semibold">Can reach</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const action = linkedInFor(row);
              const open = openId === row.personId;
              return (
                <tr key={row.personId} className="border-t border-border-c align-top">
                  <td className="px-3 py-2">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {row.name}
                      {row.canRefer && <span className="rounded-full border border-ok/30 bg-ok-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">Can refer</span>}
                      {action ? <LinkedInIconButton action={action} name={row.name} /> : <span className="text-xs font-normal text-muted">LinkedIn not on file</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <p>{row.school ?? "School not on record"}</p>
                    <p className="text-xs text-muted">{row.years ?? "Years not on record"}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p>{[row.role, row.firm].filter(Boolean).join(", ") || "Role not on record"}</p>
                    {row.location && <p className="text-xs text-muted">{row.location}</p>}
                  </td>
                  <td className="px-3 py-2">
                    {row.startups.length === 0 && <span className="text-muted">None matched</span>}
                    <ul className="space-y-1">
                      {row.startups.map((startup) => (
                        <li key={startup.id}>
                          <Link href={`/startup/${startup.id}`} className="text-link underline">
                            {startup.name}
                          </Link>
                          <span className="text-xs text-muted"> · {startup.relation}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <p className="font-semibold">{row.reach}</p>
                    {row.weakReach > 0 && <p className="text-xs text-muted">{row.weakReach} same-metro only</p>}
                    {row.samples.length > 0 && (
                      <button type="button" className="mt-1 text-xs font-medium text-link underline" aria-expanded={open} onClick={() => setOpenId(open ? null : row.personId)}>
                        {open ? "Hide paths" : "Show paths"}
                      </button>
                    )}
                    {open && (
                      <ul className="mt-2 space-y-1">
                        {row.samples.map((sample) => (
                          <li key={sample.startupId} className="text-xs">
                            <span className={`mr-1 rounded-full border px-1 py-0.5 text-[10px] font-semibold uppercase ${STRENGTH_CLASS[sample.strength]}`}>{sample.strength}</span>
                            <Link href={`/startup/${sample.startupId}`} className="text-link underline">
                              {sample.startupName}
                            </Link>
                            <span className="text-muted"> · {sample.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="mt-3 text-sm text-muted">No alumni match.</p>}
    </div>
  );
}
