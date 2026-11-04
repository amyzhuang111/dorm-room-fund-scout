"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FounderTableRow } from "@/lib/domain/founder-table";
import { LogoMark } from "@/components/sample-instrument";
import { TagChips, type TagChip } from "@/components/tag-chips";
import { campusInk } from "@/lib/display/campus-ink";
import { ellipsisAtBoundary } from "@/lib/display/ellipsis";
import { sanitizePitch } from "@/lib/display/sanitize-pitch";
import { canonicalizeTag } from "@/lib/display/canonical-tag";

const ROW_PAGE = 60;
const control =
  "inline-flex h-11 min-h-11 items-center rounded-md border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[14px] text-[color:var(--fg,#0B0E17)] outline-none appearance-none";
const selectControl = `${control} pr-8 bg-[length:12px] bg-[right_12px_center] bg-no-repeat`;
const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%235C647A' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")";

function tierLabel(tier: string | null): string {
  if (!tier) return "Listed";
  if (tier === "S+" || tier === "S") return "Core";
  if (tier === "A" || tier === "B") return "Watch";
  return "Listed";
}

function FilterFields({
  query,
  setQuery,
  tier,
  setTier,
  campus,
  setCampus,
  verifiedOnly,
  setVerifiedOnly,
  hideQuiet,
  setHideQuiet,
  campusLocked,
  campuses,
  tiers,
  activeFilterCount,
  onClear,
}: {
  query: string;
  setQuery: (v: string) => void;
  tier: string;
  setTier: (v: string) => void;
  campus: string;
  setCampus: (v: string) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean | ((b: boolean) => boolean)) => void;
  hideQuiet: boolean;
  setHideQuiet: (v: boolean | ((b: boolean) => boolean)) => void;
  campusLocked: boolean;
  campuses: [string, string][];
  tiers: string[];
  activeFilterCount: number;
  onClear: () => void;
}) {
  return (
    <>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search company or founder"
        className={`${control} min-w-[12rem] flex-1 sm:max-w-sm`}
        aria-label="Search company or founder"
      />
      <select
        value={tier}
        onChange={(event) => setTier(event.target.value)}
        className={selectControl}
        style={{ backgroundImage: SELECT_ARROW }}
        aria-label="Tier"
        data-select-styled=""
      >
        <option value="">Tier</option>
        {tiers.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {!campusLocked ? (
        <select
          value={campus}
          onChange={(event) => setCampus(event.target.value)}
          className={selectControl}
          style={{ backgroundImage: SELECT_ARROW }}
          aria-label="Campus"
          data-select-styled=""
        >
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
        className={`${control} ${verifiedOnly ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt-haze,#E8ECFA)]" : ""}`}
        aria-pressed={verifiedOnly}
        data-btn-style="sans"
        onClick={() => setVerifiedOnly((value) => !value)}
      >
        Verified
      </button>
      <button
        type="button"
        className={control}
        aria-pressed={hideQuiet}
        data-btn-style="sans"
        onClick={() => setHideQuiet((value) => !value)}
      >
        {hideQuiet ? "Hide quiet" : "Show quiet"}
      </button>
      {activeFilterCount > 0 ? (
        <button
          type="button"
          className="text-[13px] font-semibold text-[color:var(--cobalt,#2F4FD8)] hover:underline"
          data-btn-style="sans"
          onClick={onClear}
        >
          Clear
        </button>
      ) : null}
    </>
  );
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
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const clearAll = () => {
    setQuery("");
    setTier("");
    setCampus("");
    setVerifiedOnly(false);
    setHideQuiet(true);
  };

  const filterProps = {
    query,
    setQuery,
    tier,
    setTier,
    campus,
    setCampus,
    verifiedOnly,
    setVerifiedOnly,
    hideQuiet,
    setHideQuiet,
    campusLocked,
    campuses,
    tiers,
    activeFilterCount,
    onClear: clearAll,
  };

  // Side panel: top campuses in the filtered set
  const sideRanks = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filtered) {
      const label = row.campus || "Unknown";
      map.set(label, (map.get(label) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [filtered]);

  return (
    <div data-founder-directory="" data-founders-results="">
      {/* Phone: one Filters button → sheet. Desk: full controls. */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden" data-founder-filters-mobile="">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company or founder"
          className={`${control} min-w-0 flex-1`}
          aria-label="Search company or founder"
        />
        <button
          type="button"
          className={control}
          data-btn-style="sans"
          data-founder-filters-open=""
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
        </button>
      </div>
      <div className="mt-2 hidden flex-wrap items-center gap-2 lg:flex" data-founder-filters="" role="group" aria-label="Founder filters">
        <FilterFields {...filterProps} />
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" data-founder-filter-sheet="" role="dialog" aria-modal="true" aria-label="Founder filters">
          <button type="button" className="absolute inset-0 bg-black/35" aria-label="Close filters" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[16px] font-semibold text-[color:var(--fg,#0B0E17)]">Filters</p>
              <button type="button" className="text-[14px] font-semibold text-[color:var(--cobalt,#2F4FD8)]" data-btn-style="sans" onClick={() => setSheetOpen(false)}>
                Done
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <FilterFields {...filterProps} />
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-[13px] text-[color:var(--fg-3,#5C647A)]" data-showing-founders="">
        {filtered.length === founders.length ? (
          <>
            <span className="font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{founders.length.toLocaleString("en-US")}</span>
            {" founders"}
          </>
        ) : (
          <>
            <span className="font-semibold tabular-nums text-[color:var(--fg,#0B0E17)]">{filtered.length.toLocaleString("en-US")}</span>
            {" of "}
            <span className="tabular-nums text-[color:var(--fg,#0B0E17)]">{founders.length.toLocaleString("en-US")}</span>
            {" founders"}
          </>
        )}
      </p>

      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]" data-founders-spread="">
        <ul className="grid grid-cols-1 gap-0 divide-y divide-[color:var(--line,#E1E5EF)] border-t border-[color:var(--line,#E1E5EF)] md:grid-cols-2 md:gap-3 md:divide-y-0 md:border-t-0 lg:grid-cols-2 xl:grid-cols-3" data-founder-cards="">
          {ordered.map((row) => {
            const demotedBits: string[] = [];
            const backerChips: TagChip[] = [];
            for (const backer of row.programs || []) {
              const canonical = canonicalizeTag(backer);
              if (canonical.demoted) demotedBits.push(canonical.demoted);
              if (!canonical.chip) continue;
              const sourceUrl = row.programSources?.[canonical.chip] ?? row.programSources?.[backer];
              backerChips.push({
                key: `b-${canonical.chip}`,
                label: canonical.chip,
                tone: "soft" as const,
                title: canonical.chip,
                attrs: {
                  "data-card-backer": "",
                  ...(sourceUrl ? { "data-source-url": sourceUrl } : {}),
                },
              });
            }
            const pitch = sanitizePitch(
              [row.signal, ...demotedBits].filter(Boolean).join(" · "),
              row.name,
            );
            const label = tierLabel(row.tier);
            const ink = campusInk(row.campusId || row.campus);
            const chips: TagChip[] = [
              { key: "tier", label: row.tier || label, attrs: { "data-card-tier-chip": "", "data-tier": row.tier ?? undefined } },
              ...(row.campus ? [{ key: "campus", label: row.campus }] : []),
              ...(row.year != null ? [{ key: "year", label: String(row.year), tone: "mono" as const, attrs: { "data-card-year": "" } }] : []),
              ...backerChips.slice(0, 3),
              ...(row.verified ? [{ key: "verified", label: "Verified", tone: "ok" as const }] : []),
            ];
            return (
              <li key={row.id} className="list-none md:rounded-lg md:border md:border-[color:var(--line,#E1E5EF)] md:bg-white" data-founder-card="" data-project-card="">
                <Link
                  href={row.companyId ? `/startup/${row.companyId}` : row.campusSlug ? `/campuses/${row.campusSlug}` : "/founders"}
                  className="group flex min-h-11 items-start gap-3 px-1 py-4 transition-colors duration-150 ease-out sm:gap-3.5 sm:px-2 sm:py-5 md:px-3 md:py-4 lg:hover:bg-[color:var(--bg-2,#F7F8FC)]"
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
                    <TagChips max={4} chips={chips} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <aside className="hidden lg:block" data-founders-side="">
          <div className="sticky top-16 rounded-lg border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Campuses in view</p>
            <ol className="mt-2 space-y-1.5">
              {sideRanks.map(([label, count], i) => (
                <li key={label} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-[color:var(--fg,#0B0E17)]">
                    <span className="mr-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{String(i + 1).padStart(2, "0")}</span>
                    {label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[color:var(--fg-2,#3F465C)]">{count.toLocaleString("en-US")}</span>
                </li>
              ))}
              {sideRanks.length === 0 ? <li className="text-[13px] text-[color:var(--fg-3,#5C647A)]">No campus ranks yet</li> : null}
            </ol>
          </div>
        </aside>
      </div>

      {hiddenRows > 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-1 py-4 text-[14px] text-[color:var(--fg-2,#3F465C)]" data-founders-more="">
          <span>
            Showing <span className="tabular-nums">{ordered.length.toLocaleString("en-US")}</span>
            {" on this page"}
          </span>
          <button type="button" className={control} data-btn-style="sans" onClick={() => setRowLimit((n) => n + ROW_PAGE)}>
            Show {Math.min(ROW_PAGE, hiddenRows).toLocaleString("en-US")} more
          </button>
          <button type="button" className={control} data-btn-style="sans" onClick={() => setRowLimit(Number.MAX_SAFE_INTEGER)}>
            Show remaining
          </button>
        </div>
      ) : null}
      {ordered.length === 0 ? (
        <p className="px-1 py-6 text-[14px] text-[color:var(--fg-2,#3F465C)]">No founders match. Clear filters.</p>
      ) : null}
    </div>
  );
}
