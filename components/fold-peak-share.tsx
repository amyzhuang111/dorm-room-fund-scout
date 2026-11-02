"use client";

import { useEffect, useMemo } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { buildPeakShell, type PeakShell } from "@/lib/domain/peak-shell";
import { CampusSeal } from "@/components/campus-seal";

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
  foundersListed: _foundersListed,
  campusesOnMap: _campusesOnMap,
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
  void _foundersListed;
  void _campusesOnMap;
  const live = useMemo(() => (companies.length ? buildPeakShell(companies) : null), [companies]);
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const detail = live ?? shell;
  if (!detail || detail.dated === 0 || detail.bars.length === 0) return null;
  const peakBar = detail.bars.find((b) => b.peak) ?? detail.bars[0];
  const pct = Math.round((peakBar.count / Math.max(1, detail.dated)) * 100);
  const max = Math.max(1, ...detail.bars.map((b) => b.count));
  const quiet = detail.quiet;

  return (
    <div className="mb-0" data-fold-peak-identity="" data-fold-baseline="8" data-fold-peak-shell={live ? "live" : "ssr"} data-fold-redesign="seal-dispatch">
      {/* Desk: Seal Dispatch — cobalt peak + seal desk rank */}
      <div className="mb-1 hidden min-h-[15rem] lg:block" data-fold-peak-desk="">
        <div
          className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-end gap-6 border-b border-[color:var(--line,#E1E5EF)] pb-3"
          data-fold-peak-share=""
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-2 h-[68px] overflow-hidden font-mono text-[84px] font-bold leading-none tracking-[-0.08em] text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-figure="">
              {peakBar.count.toLocaleString("en-US")}
              <span className="mx-2 text-[28px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[36px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">
                {detail.dated.toLocaleString("en-US")}
              </span>
            </p>
            <p className="mt-2 max-w-[36rem] text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
              {peakBar.label} took{" "}
              <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span>
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
                  <span className={`whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.04em] ${b.peak ? "font-bold text-[color:var(--cobalt,#2F4FD8)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short}</span>
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
          <div className="min-w-0 self-stretch border-l border-[color:var(--cobalt,#2F4FD8)]/25 pl-5" data-fold-top-campuses-desk="">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Desk rank</p>
            {topCampuses.length > 0 ? (
              <ol className="mt-3 space-y-3" data-fold-peak-campus-rank="">
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
              <p className="mt-3 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className="font-bold text-[color:var(--cobalt,#2F4FD8)]">{detail.dated.toLocaleString("en-US")}</span>
                {" dated · "}
                <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quiet.toLocaleString("en-US")}</span>
                {" quiet"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: stacked Seal Dispatch — caption under figure, bars below (no side overlap) */}
      <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
        <p className="mt-2 h-10 overflow-hidden font-mono text-[40px] font-bold leading-none tracking-[-0.06em] text-[color:var(--cobalt,#2F4FD8)]" data-fold-peak-figure="">
          {peakBar.count.toLocaleString("en-US")}
          <span className="mx-1.5 text-[18px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="text-[24px] font-bold tracking-[-0.04em] text-[color:var(--fg,#0B0E17)]">
            {detail.dated.toLocaleString("en-US")}
          </span>
        </p>
        <p className="mt-2 text-[14px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-fold-peak-caption="">
          {peakBar.label} took <span className="text-[color:var(--cobalt,#2F4FD8)]">{pct}%</span> of every dated signal
        </p>
        <ol className="mt-2 flex h-14 items-end gap-1 overflow-hidden" data-fold-peak-bars-mobile="" data-fold-peak-month-bars="">
          {detail.bars.map((b) => (
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
              <span className={`shrink-0 whitespace-nowrap font-mono text-[8px] uppercase leading-none tracking-[0.04em] ${b.peak ? "font-bold text-[color:var(--cobalt,#2F4FD8)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>{b.short}</span>
            </li>
          ))}
        </ol>
        {topCampuses.length > 0 ? (
          <ol
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--line,#E1E5EF)] pt-2"
            data-fold-peak-campus-rank-mobile=""
          >
            {topCampuses.map((campus, i) => (
              <li key={campus.id} className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{String(i + 1).padStart(2, "0")}</span>
                <CampusSeal label={campus.name} size="md" />
                <span className="text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{campus.name}</span>
                <span className="font-mono text-[12px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">{campus.founders.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
