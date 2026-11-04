"use client";

import { useEffect, useMemo } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { buildPeakShell, type PeakShell } from "@/lib/domain/peak-shell";
import { CampusSeal } from "@/components/campus-seal";
import { nounFor } from "@/lib/display/plural";

export type { PeakShell, PeakBar } from "@/lib/domain/peak-shell";
export { buildPeakShell } from "@/lib/domain/peak-shell";

/**
 * Seal Dispatch hero — cobalt-only peak figure + seal desk rank.
 * Fold Peak share from source_date only. Month bars carry the peak label.
 * No data-scout-chronograph (DOM chronographGoneFromHome).
 * Accepts SSR shell so first paint reserves exact height (CLS ≈ 0).
 */
export type FoldTopCampus = { id: string; name: string; founders: number };

export function FoldPeakShare({
  companies,
  foundersListed,
  companyTotal = 0,
  campusesOnMap: _campusesOnMap,
  topCampuses = [],
  shell = null,
  onReady,
  hideMobileRanks = false,
}: {
  companies: FacetCompany[];
  foundersListed: number;
  /** Vetted company list. This is the figure; the dated-month slice stays in the caption. */
  companyTotal?: number;
  campusesOnMap: number;
  topCampuses?: FoldTopCampus[];
  shell?: PeakShell | null;
  onReady?: () => void;
  /** r53 deck sheet: campus segments own ranks; keep month bars only. */
  hideMobileRanks?: boolean;
}) {
  void _campusesOnMap;
  const live = useMemo(() => (companies.length ? buildPeakShell(companies) : null), [companies]);
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detail = live ?? shell;
  const peakBar = detail && detail.dated > 0 && detail.bars.length > 0 ? (detail.bars.find((b) => b.peak) ?? detail.bars[0]) : null;
  if (!peakBar && companyTotal <= 0) return null;
  const pct = peakBar && detail ? Math.round((peakBar.count / Math.max(1, detail.dated)) * 100) : 0;
  const max = peakBar && detail ? Math.max(1, ...detail.bars.map((b) => b.count)) : 1;
  const quiet = detail?.quiet ?? 0;

  return (
    <div className="mb-0" data-fold-peak-identity="" data-fold-baseline="8" data-fold-peak-shell={live ? "live" : "ssr"} data-fold-redesign="seal-dispatch">
      {/* Desk: Seal Dispatch — cobalt peak + seal desk rank */}
      <div className="mb-1 hidden min-h-[9.5rem] lg:block" data-fold-peak-desk="">
        <div
          className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-end gap-6 border-b border-[color:var(--line,#E1E5EF)] pb-3"
          data-fold-peak-share=""
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3,#5C647A)]">Vetted companies</p>
            <p className="mt-1 h-[52px] overflow-hidden font-mono text-[40px] font-semibold leading-none tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-figure="">
              {companyTotal.toLocaleString("en-US")}
            </p>
            <p className="mt-1.5 max-w-[36rem] text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
              {foundersListed.toLocaleString("en-US")} {nounFor(foundersListed, "founder")} on these companies
            </p>
            <ol
              className="mt-2 flex h-[4.25rem] items-end gap-1"
              data-fold-peak-bars=""
              data-fold-peak-month-bars=""
              data-chrono-peak={peakBar ? String(peakBar.count) : undefined}
              data-chrono-peak-month={peakBar?.id}
              data-chrono-dated={detail ? String(detail.dated) : undefined}
              data-chrono-earlier={detail ? String(detail.earlierValid) : undefined}
              data-chrono-month-unknown={detail ? String(detail.undatedMonth) : undefined}
              data-chrono-window={detail ? String(detail.inWindow) : undefined}
            >
              {(detail?.bars ?? []).map((b) => (
                <li key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
                  {b.peak ? (
                    <span className="font-mono text-[11px] font-bold tabular-nums leading-none text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-bar-label="">
                      {b.count.toLocaleString("en-US")}
                    </span>
                  ) : (
                    <span className="h-[11px]" aria-hidden />
                  )}
                  <span
                    className={`w-full max-w-[1.5rem] rounded-sm ${b.peak ? "bg-[color:var(--cobalt,#2F4FD8)]" : "bg-[color:var(--cobalt,#2F4FD8)]/25"}`}
                    style={{ height: `${Math.max(4, Math.round((b.count / max) * 40))}px` }}
                  />
                  <span className={`whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.04em] ${b.peak ? "font-bold text-[color:var(--cobalt,#2F4FD8)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short} {b.id.slice(2, 4)}</span>
                </li>
              ))}
            </ol>
            <p data-chrono-caption="" className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
              {peakBar && detail ? (
                <>
                  Busiest dated month {peakBar.label}: {peakBar.count.toLocaleString("en-US")} of {detail.dated.toLocaleString("en-US")} dated signals ({pct}%)
                  {detail.earlierValid > 0 ? ` · ${detail.earlierValid.toLocaleString("en-US")} earlier` : ""}
                  {detail.undatedMonth > 0 ? ` · ${detail.undatedMonth.toLocaleString("en-US")} month missing` : ""}
                  {" · "}
                  {quiet.toLocaleString("en-US")} with no dated signal
                </>
              ) : (
                "Dated signals are still loading"
              )}
            </p>
          </div>
          <div className="min-w-0 self-stretch border-l border-[color:var(--cobalt,#2F4FD8)]/25 pl-5" data-fold-top-campuses-desk="">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3,#5C647A)]">Founders on file</p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Not adjusted for scan depth</p>
            {topCampuses.length > 0 ? (
              <ol className="mt-2 space-y-2" data-fold-peak-campus-rank="">
                {topCampuses.map((campus, i) => (
                  <li key={campus.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <CampusSeal label={campus.name} size="lg" />
                    <span className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
                      {campus.name}
                    </span>
                    <span className="shrink-0 font-mono text-[18px] font-bold leading-none tracking-[-0.03em] text-[color:var(--cobalt,#2F4FD8)]">
                      {campus.founders.toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              // Campus data still loading: keep the slot empty rather than repeating
              // the dated/quiet counts already shown under Peak share.
              <div className="mt-2 h-[8rem]" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      {/* Mobile: stacked Seal Dispatch — caption under figure, bars below (no side overlap) */}
      <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--fg-3,#5C647A)]">Vetted companies</p>
        <p className="mt-2 h-10 overflow-hidden font-mono text-[36px] font-semibold leading-none tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-figure="">
          {companyTotal.toLocaleString("en-US")}
        </p>
        <p className="mt-2 text-[14px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
          {foundersListed.toLocaleString("en-US")} {nounFor(foundersListed, "founder")} on these companies
        </p>
        <ol className="mt-2 flex h-14 items-end gap-1 overflow-hidden" data-fold-peak-bars-mobile="" data-fold-peak-month-bars="">
          {(detail?.bars ?? []).map((b) => (
            <li key={b.id} className="flex h-14 min-w-0 flex-1 flex-col items-center justify-end gap-1" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
              {b.peak ? (
                <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums leading-none text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-bar-label="">
                  {b.count.toLocaleString("en-US")}
                </span>
              ) : (
                <span className="h-2.5 shrink-0" aria-hidden />
              )}
              <span
                className={`w-full max-w-3 shrink-0 rounded-sm ${b.peak ? "bg-[color:var(--cobalt,#2F4FD8)]" : "bg-[color:var(--cobalt,#2F4FD8)]/25"}`}
                style={{ height: `${Math.max(4, Math.round((b.count / max) * 20))}px` }}
              />
              <span className={`shrink-0 whitespace-nowrap font-mono text-[8px] uppercase leading-none tracking-[0.04em] ${b.peak ? "font-bold text-[color:var(--cobalt,#2F4FD8)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short} {b.id.slice(2, 4)}</span>
            </li>
          ))}
        </ol>
        {peakBar && detail ? (
          <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
            Busiest dated month {peakBar.label}: {peakBar.count.toLocaleString("en-US")} of {detail.dated.toLocaleString("en-US")} ({pct}%) · {quiet.toLocaleString("en-US")} with no dated signal
          </p>
        ) : null}
        {topCampuses.length > 0 && !hideMobileRanks ? (
          <ol
            className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[color:var(--line,#E1E5EF)] pt-1.5"
            data-fold-peak-campus-rank-mobile=""
          >
            <li className="w-full font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Founders on file · not adjusted for scan depth</li>
            {topCampuses.slice(0, 3).map((campus, i) => {
              const short = campus.name.replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
              return (
              <li key={campus.id} className="flex shrink-0 items-center gap-1" data-fold-peak-campus-item="">
                <span className="shrink-0 font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{String(i + 1).padStart(2, "0")}</span>
                <CampusSeal label={campus.name} size="sm" />
                <span className="whitespace-nowrap text-[11px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-campus-label="">{short}</span>
                <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">{campus.founders.toLocaleString("en-US")}</span>
              </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
