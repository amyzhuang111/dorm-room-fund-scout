"use client";

import { useEffect, useState } from "react";
import { buildHref } from "@/lib/domain/url";
import { sectorLabel } from "@/lib/domain/sectors";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { EnrollmentChips } from "./enrollment-chips";
import { ScoutLink, useScoutNav } from "./scout-nav";

const VIEWS = ["globe", "table"] as const;

function SearchField({
  basePath,
  current,
  placeholder,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  placeholder: string;
}) {
  const nav = useScoutNav();
  const [value, setValue] = useState(current.q ?? "");
  const [syncedQ, setSyncedQ] = useState(current.q);
  if (current.q !== syncedQ) {
    setSyncedQ(current.q);
    setValue(current.q ?? "");
  }
  useEffect(() => {
    if (!nav) return;
    const handle = window.setTimeout(() => {
      const next = value.trim();
      if ((current.q ?? "") === next) return;
      nav.navigate({ q: next || null });
    }, 100);
    return () => window.clearTimeout(handle);
  }, [value, nav, current.q]);

  if (!nav) {
    return (
      <form action={basePath} method="get" className="min-w-[200px] flex-1">
        {Object.entries(current)
          .filter(([key, item]) => key !== "q" && item)
          .map(([key, item]) => (
            <input key={key} type="hidden" name={key} value={item} />
          ))}
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder={placeholder}
          className="w-full rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
        />
      </form>
    );
  }

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={placeholder}
      className="min-w-[200px] flex-1 rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
    />
  );
}

export function ExploreToolbar({
  basePath,
  current,
  resultCount,
  resultLabel,
  searchPlaceholder = "Search companies, founders…",
  showViewSwitch = true,
  counts,
}: {
  basePath: string;
  current: Record<string, string | undefined>;
  resultCount: number;
  resultLabel: string;
  searchPlaceholder?: string;
  showViewSwitch?: boolean;
  counts: Record<EnrollmentStatus, number>;
}) {
  const view = VIEWS.find((v) => v === current.view) ?? "globe";

  const activeFilters: { key: string; label: string }[] = [];
  if (current.university) activeFilters.push({ key: "university", label: `Campus` });
  if (current.queue) activeFilters.push({ key: "queue", label: `View: ${current.queue.replace(/_/g, " ")}` });
  if (current.sector) activeFilters.push({ key: "sector", label: sectorLabel(current.sector) });
  if (current.q) activeFilters.push({ key: "q", label: `Search: "${current.q}"` });
  if (current.tier) activeFilters.push({ key: "tier", label: `Tier ${current.tier}` });
  if (current.feedback) activeFilters.push({ key: "feedback", label: current.feedback === "hidden" ? "Hidden" : current.feedback === "liked" ? "Liked" : "Passed" });

  return (
    <div className="border-b border-border-c px-3 py-2">
      <div className="mb-3">
        <EnrollmentChips basePath={basePath} current={current} counts={counts} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField basePath={basePath} current={current} placeholder={searchPlaceholder} />

        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border-c p-0.5">
          <ScoutLink
            href={buildHref("/startup/discover", current, {})}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${basePath.startsWith("/startup") ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2"}`}
          >
            Companies
          </ScoutLink>
          <ScoutLink
            href={buildHref("/founder/discover", { university: current.university, q: current.q, enroll: current.enroll, tier: current.tier, sort: current.sort }, {})}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${basePath.startsWith("/founder") ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2"}`}
          >
            Founders
          </ScoutLink>
        </div>

        {showViewSwitch && (
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border-c p-0.5">
            {VIEWS.map((v) => (
              <ScoutLink
                key={v}
                href={buildHref(basePath, current, { view: v })}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${view === v ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2"}`}
              >
                {v}
              </ScoutLink>
            ))}
          </div>
        )}

        <ScoutLink href="/sources?from=startup" className="shrink-0 rounded-md border border-border-c px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
          Scan sources
        </ScoutLink>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {resultCount} {resultLabel}
        </span>
        {showViewSwitch && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            Sort
            <ScoutLink href={buildHref(basePath, current, { sort: null })} className={!current.sort || current.sort === "name" ? "text-link" : "hover:text-foreground"}>
              name
            </ScoutLink>
            <ScoutLink href={buildHref(basePath, current, { sort: "priority" })} className={current.sort === "priority" ? "text-link" : "hover:text-foreground"}>
              research priority
            </ScoutLink>
            <ScoutLink href={buildHref(basePath, current, { sort: "tier" })} className={current.sort === "tier" ? "text-link" : "hover:text-foreground"}>
              signal tier
            </ScoutLink>
          </span>
        )}
        {activeFilters.map((f) => (
          <ScoutLink
            key={f.key}
            href={buildHref(basePath, current, { [f.key]: null })}
            className="inline-flex items-center gap-1 rounded-full border border-border-c bg-surface-2 px-2 py-0.5 text-[11px] text-muted hover:text-foreground"
          >
            {f.label} ✕
          </ScoutLink>
        ))}
        {activeFilters.length > 0 && (
          <ScoutLink href={basePath} className="text-[11px] text-link underline">
            Clear filters
          </ScoutLink>
        )}
      </div>
    </div>
  );
}
