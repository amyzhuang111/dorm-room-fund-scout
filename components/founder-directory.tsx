"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FounderTableRow } from "@/lib/domain/founder-table";
import { LogoMark } from "@/components/sample-instrument";
import { campusInk } from "@/lib/display/campus-ink";
import { ellipsisAtBoundary, WRAP_FULL } from "@/lib/display/ellipsis";
import { humanizeEnumText } from "@/lib/display/enum-labels";

const ROW_PAGE = 60;
const control =
  "inline-flex h-11 min-h-11 items-center rounded-md border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[14px] text-[color:var(--fg,#0B0E17)] outline-none";

function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = humanizeEnumText(
    value
      .replace(/[\u2014\u2013]/g, " · ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return text || null;
}

function tierLabel(tier: string | null): string {
  if (!tier) return "Listed";
  if (tier === "S+" || tier === "S") return "Core";
  if (tier === "A" || tier === "B") return "Watch";
  return "Listed";
}

export function FounderDirectory({
  founders,
  campusLocked = false,
}: {
  founders: FounderTableRow[];
  campusLocked?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [campus, setCampus] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [hideQuiet, setHideQuiet] = useState(true);
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);

  const campuses = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of founders) {
      if (row.campus && row.campusId) map.set(row.campusId, row.campus);
      else if (row.campus) map.set(row.campus, row.campus);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [founders]);

  const tiers = useMemo(() => {
    const set = new Set<string>();
    for (const row of founders) if (row.tier) set.add(row.tier);
    return [...set].sort();
  }, [founders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return founders.filter((row) => {
      if (tier && row.tier !== tier) return false;
      if (campus && row.campusId !== campus && row.campus !== campus) return false;
      if (verifiedOnly && !row.verified) return false;
      if (hideQuiet && !row.signal) return false;
      if (!q) return true;
      const hay = [row.name, row.company, row.campus, row.signal, ...(row.programs || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [founders, query, tier, campus, verifiedOnly, hideQuiet]);

  const ordered = filtered.slice(0, rowLimit);
  const hiddenRows = Math.max(0, filtered.length - ordered.length);
  const activeFilterCount =
    (query.trim() ? 1 : 0) + (tier ? 1 : 0) + (campus ? 1 : 0) + (verifiedOnly ? 1 : 0) + (hideQuiet ? 0 : 1);

  return (
    <div data-founder-directory="" data-founders-results="">
      <div className="flex flex-wrap items-center gap-2" data-founder-filters="" role="group" aria-label="Founder filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company or founder"
          className={`${control} min-w-[12rem] flex-1 sm:max-w-sm`}
          aria-label="Search company or founder"
        />
        <select value={tier} onChange={(event) => setTier(event.target.value)} className={control} aria-label="Tier">
          <option value="">Tier</option>
          {tiers.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {!campusLocked ? (
          <select value={campus} onChange={(event) => setCampus(event.target.value)} className={control} aria-label="Campus">
            <option value="">Campus</option>
            {campuses.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className={`${control} ${verifiedOnly ? "border-[color:var(--cobalt,#2F4FD8)]" : ""}`}
          aria-pressed={verifiedOnly}
          onClick={() => setVerifiedOnly((value) => !value)}
        >
          Verified
        </button>
        <button
          type="button"
          className={control}
          aria-pressed={hideQuiet}
          onClick={() => setHideQuiet((value) => !value)}
        >
          {hideQuiet ? "Hide rows with no signal" : "Show quiet rows"}
        </button>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="text-[13px] font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline"
            onClick={() => {
              setQuery("");
              setTier("");
              setCampus("");
              setVerifiedOnly(false);
              setHideQuiet(true);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-[13px] text-[color:var(--fg-3,#5C647A)]" data-showing-founders="">
        <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{filtered.length.toLocaleString("en-US")}</span>
        {" of "}
        <span className="font-mono font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{founders.length.toLocaleString("en-US")}</span>
        {" founders"}
      </p>

      <ul className="mt-2 divide-y divide-[color:var(--line,#E1E5EF)] border-t border-[color:var(--line,#E1E5EF)]" data-founder-cards="">
        {ordered.map((row) => {
          const pitch = plainText(row.signal);
          const backers = (row.programs || []).slice(0, 3);
          const label = tierLabel(row.tier);
          const ink = campusInk(row.campusId || row.campus);
          return (
            <li key={row.id} className="list-none" data-founder-card="" data-project-card="">
              <Link
                href={row.companyId ? `/startup/${row.companyId}` : row.campusSlug ? `/campuses/${row.campusSlug}` : "/founders"}
                className="group flex min-h-11 items-start gap-3 px-1 py-4 transition-colors duration-150 ease-out sm:gap-3.5 sm:px-2 sm:py-5 lg:hover:bg-[color:var(--bg-2,#F7F8FC)]"
              >
                <LogoMark name={row.name} logoUrl={row.logoUrl} size={48} campusInk={ink} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="break-words text-[17px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px] sm:leading-6">
                      {row.name}
                    </p>
                    {row.company ? (
                      <span className="text-[13px] text-[color:var(--fg-3,#5C647A)]">{row.company}</span>
                    ) : null}
                  </div>
                  {pitch ? (
                    <p className="mt-1 max-w-2xl text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" title={pitch} data-card-pitch="" data-why-here="">
                      {ellipsisAtBoundary(pitch, 140)}
                    </p>
                  ) : (
                    <p className="sr-only" data-why-here="" data-why-blank="1">
                      Why it&apos;s here blank
                    </p>
                  )}
                  <span className="mt-2.5 flex flex-wrap items-center gap-1.5" data-card-chips="">
                    <span
                      className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] font-medium text-[color:var(--fg,#0B0E17)]"
                      data-card-tier-chip=""
                      data-tier={row.tier ?? undefined}
                    >
                      {row.tier || label}
                    </span>
                    {row.campus ? (
                      row.campusSlug ? (
                        <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] text-[color:var(--fg-2,#3F465C)]">
                          {row.campus}
                        </span>
                      ) : (
                        <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] text-[color:var(--fg-2,#3F465C)]">
                          {row.campus}
                        </span>
                      )
                    ) : null}
                    {row.year != null ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-card-year="">
                        {row.year}
                      </span>
                    ) : null}
                    {backers.map((backer) => (
                      <span
                        key={backer}
                        className="inline-flex h-6 max-w-[12rem] items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-2,#F7F8FC)] px-2 text-[12px] text-[color:var(--fg,#0B0E17)]"
                        data-card-backer=""
                        title={backer}
                      >
                        <span className={WRAP_FULL}>{backer}</span>
                      </span>
                    ))}
                    {row.verified ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[12px] text-[color:var(--ok,#1F7A4D)]">
                        Verified
                      </span>
                    ) : null}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {hiddenRows > 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-1 py-4 text-[14px] text-[color:var(--fg-2,#3F465C)]" data-founders-more="">
          <span>
            Showing <span className="font-mono tabular-nums">{ordered.length.toLocaleString("en-US")}</span> of{" "}
            <span className="font-mono tabular-nums">{filtered.length.toLocaleString("en-US")}</span> founders
          </span>
          <button type="button" className={control} onClick={() => setRowLimit((n) => n + ROW_PAGE)}>
            Show {Math.min(ROW_PAGE, hiddenRows).toLocaleString("en-US")} more
          </button>
          <button type="button" className={control} onClick={() => setRowLimit(Number.MAX_SAFE_INTEGER)}>
            Show all {filtered.length.toLocaleString("en-US")}
          </button>
        </div>
      ) : null}
      {ordered.length === 0 ? (
        <p className="px-1 py-6 text-[14px] text-[color:var(--fg-2,#3F465C)]">No founders match. Clear filters.</p>
      ) : null}
    </div>
  );
}
