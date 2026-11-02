"use client";

import { useEffect, useMemo } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { buildPeakShell, type PeakShell } from "@/lib/domain/peak-shell";

export type { PeakShell, PeakBar } from "@/lib/domain/peak-shell";
export { buildPeakShell } from "@/lib/domain/peak-shell";

/**
 * Fold Peak share from source_date only. Month bars carry the peak label.
 * No data-scout-chronograph (DOM chronographGoneFromHome).
 * Accepts SSR shell so first paint reserves exact height (CLS ≈ 0).
 */
export type FoldTopCampus = { id: string; name: string; founders: number };

export function FoldPeakShare({
  companies,
  foundersListed,
  campusesOnMap,
  topCampuses = [],
  shell = null,
  onReady,
}: {
  companies: FacetCompany[];
  foundersListed: number;
  campusesOnMap: number;
  topCampuses?: FoldTopCampus[];
  shell?: PeakShell | null;
  onReady?: () => void;
}) {
  const live = useMemo(() => (companies.length ? buildPeakShell(companies) : null), [companies]);
  useEffect(() => {
    onReady?.();
    // mount once — parent swaps SSR lite → live without layout change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detail = live ?? shell;
  if (!detail || detail.dated === 0 || detail.bars.length === 0) return null;
  const peakBar = detail.bars.find((b) => b.peak) ?? detail.bars[0];
  const pct = Math.round((peakBar.count / Math.max(1, detail.dated)) * 100);
  const max = Math.max(1, ...detail.bars.map((b) => b.count));
  const quiet = detail.quiet;

  return (
    <div className="mb-0" data-fold-peak-identity="" data-fold-baseline="8" data-fold-peak-shell={live ? "live" : "ssr"}>
      {/* Desk: peak hero + quiet bars (no count labels) + Scout edition · reserved min height */}
      <div className="mb-1 hidden min-h-[15rem] lg:block" data-fold-peak-desk="">
        <div
          className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-end gap-5 border-b border-[color:var(--line,#E1E5EF)] pb-3"
          data-fold-peak-share=""
        >
          <div className="min-w-0">
            <p className="scout-kicker">Peak share</p>
            <p className="mt-1 font-mono text-[72px] font-bold leading-[0.82] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)]">
              {peakBar.count.toLocaleString("en-US")}
              <span className="mx-2 text-[26px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[40px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">
                {detail.dated.toLocaleString("en-US")}
              </span>
            </p>
            <p className="mt-2 max-w-[34rem] text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peakBar.label} took{" "}
              <span className="text-[color:var(--ember,#D96B1C)]">{pct}%</span>
              {" of every dated signal on record"}
            </p>
            <ol
              className="mt-3 flex h-[4.25rem] items-end gap-1"
              data-fold-peak-bars=""
              data-fold-peak-month-bars=""
              data-chrono-peak={String(peakBar.count)}
              data-chrono-peak-month={peakBar.id}
              data-chrono-dated={String(detail.dated)}
              data-chrono-earlier={String(detail.earlierValid)}
              data-chrono-month-unknown={String(detail.undatedMonth)}
              data-chrono-window={String(detail.inWindow)}
            >
              {detail.bars.map((b) => (
                <li key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
                  {b.peak ? (
                    <span className="font-mono text-[11px] font-bold tabular-nums leading-none text-[color:var(--ember,#D96B1C)]" data-fold-peak-bar-label="">
                      {b.count.toLocaleString("en-US")}
                    </span>
                  ) : (
                    <span className="h-[11px]" aria-hidden />
                  )}
                  <span
                    className={`w-full max-w-[1.5rem] rounded-sm ${b.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/30"}`}
                    style={{ height: `${Math.max(4, Math.round((b.count / max) * 40))}px` }}
                  />
                  <span className={`whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.04em] ${b.peak ? "font-bold text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short}</span>
                </li>
              ))}
            </ol>
            <p data-chrono-caption="" className="mt-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {detail.dated.toLocaleString("en-US")} dated
              {detail.earlierValid > 0 ? ` · ${detail.earlierValid.toLocaleString("en-US")} earlier` : ""}
              {detail.undatedMonth > 0 ? ` · ${detail.undatedMonth.toLocaleString("en-US")} undated` : ""}
              {" · "}
              {quiet.toLocaleString("en-US")} quiet
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--line,#E1E5EF)] pl-4" data-fold-top-campuses-desk="">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Top campuses</p>
            <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{foundersListed.toLocaleString("en-US")}</span>
              {" names · "}
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{campusesOnMap.toLocaleString("en-US")}</span>
              {" on map"}
            </p>
            {topCampuses.length > 0 ? (
              <ol className="mt-3 space-y-2.5" data-fold-peak-campus-rank="">
                {topCampuses.map((campus, i) => (
                  <li key={campus.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{campus.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[16px] font-bold leading-none tracking-[-0.03em] text-[color:var(--ember,#D96B1C)]">
                      {campus.founders.toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{detail.dated.toLocaleString("en-US")}</span>
                {" dated · "}
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quiet.toLocaleString("en-US")}</span>
                {" quiet"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile lead: stacked Peak statement + real campus ranks · search/founders follow */}
      <div className="min-h-[9.75rem] border-b border-[color:var(--line,#E1E5EF)] pb-2.5 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="scout-kicker">Peak share</p>
        <p className="mt-1 scout-figure text-[36px] leading-[0.84]">
          {peakBar.count.toLocaleString("en-US")}
          <span className="mx-1.5 text-[18px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="text-[26px] font-bold tracking-[-0.05em] text-[color:var(--fg,#0B0E17)]">
            {detail.dated.toLocaleString("en-US")}
          </span>
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
          {peakBar.label} took <span className="text-[color:var(--ember,#D96B1C)]">{pct}%</span> of every dated signal
        </p>
        <ol className="mt-1.5 flex h-[2.6rem] items-end gap-0.5" data-fold-peak-bars-mobile="" data-fold-peak-month-bars="">
          {detail.bars.map((b) => (
            <li key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
              {b.peak ? (
                <span className="font-mono text-[10px] font-bold tabular-nums leading-none text-[color:var(--ember,#D96B1C)]" data-fold-peak-bar-label="">
                  {b.count.toLocaleString("en-US")}
                </span>
              ) : (
                <span className="h-[10px]" aria-hidden />
              )}
              <span
                className={`w-full max-w-[1.25rem] rounded-sm ${b.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/30"}`}
                style={{ height: `${Math.max(3, Math.round((b.count / max) * 18))}px` }}
              />
              <span className={`whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.03em] ${b.peak ? "font-bold text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short}</span>
            </li>
          ))}
        </ol>
        {topCampuses.length > 0 ? (
          <ol
            className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-[color:var(--line,#E1E5EF)] pt-1.5"
            data-fold-peak-campus-rank-mobile=""
          >
            {topCampuses.map((campus, i) => (
              <li key={campus.id} className="flex items-baseline gap-1.5 font-mono text-[11px] tabular-nums">
                <span className="text-[color:var(--fg-3,#5C647A)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{campus.name}</span>
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{campus.founders.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
