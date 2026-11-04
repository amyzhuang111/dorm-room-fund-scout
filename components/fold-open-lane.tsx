"use client";

import { CampusSeal } from "@/components/campus-seal";
import {
  openLaneDefinitionText,
  openLaneDeskDefinition,
  openLaneStrongDefinition,
  openLaneTopFundDefinition,
  type OpenLaneShell,
} from "@/lib/domain/open-lane";

/**
 * r56 desk investor hero — answers which strong student founders still have no top fund.
 * Uses real open-lane counts from founders.json (strong signal, no top VC / YC / peers).
 * Definitions render from open-lane.ts so the copy cannot drift from the matcher.
 */
export function FoldOpenLaneHero({
  shell,
  companyTotal,
  foundersIndexed,
}: {
  shell: OpenLaneShell | null;
  companyTotal: number;
  foundersIndexed: number;
}) {
  const count = shell?.count ?? 0;
  const strong = shell?.strong ?? 0;
  const campuses = shell?.campuses ?? [];
  const strongDef = openLaneStrongDefinition();
  const topFundDef = openLaneTopFundDefinition();
  const deskDef = openLaneDeskDefinition();
  const fullDef = openLaneDefinitionText();
  return (
    <div className="mb-2" data-fold-open-lane="" data-fold-redesign="open-lane">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
        No top fund yet
      </p>
      <p
        className="mt-1 font-mono text-[48px] font-bold leading-none tracking-[-0.08em] text-[color:var(--cobalt,#2F4FD8)]"
        data-fold-open-lane-figure=""
      >
        {count.toLocaleString("en-US")}
      </p>
      <p className="mt-1.5 text-[14px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-open-lane-caption="">
        strong student founders on the investable desk with no top fund yet
      </p>
      <p
        className="mt-1.5 text-[11px] leading-4 text-[color:var(--fg-2,#3F465C)]"
        data-fold-open-lane-def=""
        data-fold-open-lane-def-full={fullDef}
      >
        <span data-fold-open-lane-def-strong="">{strongDef}</span>{" "}
        <span data-fold-open-lane-def-top-fund="">{topFundDef}</span>{" "}
        <span data-fold-open-lane-def-desk="">{deskDef}</span>
      </p>
      <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-fold-open-lane-meta="">
        {strong.toLocaleString("en-US")} strong signals
        {" · "}
        {foundersIndexed.toLocaleString("en-US")} founders indexed
        {" · "}
        {companyTotal.toLocaleString("en-US")} companies
      </p>
      {campuses.length > 0 ? (
        <div className="mt-3 border-t border-[color:var(--cobalt,#2F4FD8)]/20 pt-2" data-fold-top-campuses-desk="" data-fold-open-lane-campuses="">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">
            Founders in this lane
          </p>
          <ol className="mt-2 space-y-1.5" data-fold-peak-campus-rank="">
            {campuses.map((campus, i) => (
              <li key={campus.id} className="flex items-center gap-2">
                <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <CampusSeal label={campus.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                  {campus.name}
                </span>
                <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                  {campus.founders.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
