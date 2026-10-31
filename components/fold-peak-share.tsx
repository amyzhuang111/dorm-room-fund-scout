"use client";

import { useMemo } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THROUGH_YM = "2026-10";

type Bar = { id: string; label: string; short: string; count: number; peak: boolean };

function peakDetail(companies: FacetCompany[]) {
  const months = new Map<string, number>();
  let dated = 0;
  let undatedMonth = 0;
  for (const company of companies) {
    const at = company.latestSignalAt;
    if (!at || at.length < 7) continue;
    dated += 1;
    const ym = at.slice(0, 7);
    if (ym.endsWith("-00")) {
      undatedMonth += 1;
      continue;
    }
    if (ym > THROUGH_YM) continue;
    months.set(ym, (months.get(ym) ?? 0) + 1);
  }
  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const slice = sorted.slice(-9);
  const earlierValid = sorted.slice(0, Math.max(0, sorted.length - 9)).reduce((sum, [, n]) => sum + n, 0);
  const inWindow = slice.reduce((sum, [, n]) => sum + n, 0);
  const bars: Bar[] = slice.map(([id, count]) => {
    const y = id.slice(0, 4);
    const m = Number(id.slice(5, 7));
    const short = MONTH_SHORT[m - 1] ?? id.slice(5, 7);
    return { id, label: `${short} ${y.slice(2)}`, short, count, peak: false };
  });
  if (bars.length) {
    const max = Math.max(1, ...bars.map((b) => b.count));
    for (const b of bars) b.peak = b.count === max;
  }
  return { bars, dated, inWindow, earlierValid, undatedMonth };
}

/**
 * Fold Peak share — single typographic hero (369/635). Bars are visual only
 * (no third 369 label). No data-scout-chronograph (DOM chronographGoneFromHome).
 */
export function FoldPeakShare({
  companies,
  foundersListed,
  campusesOnMap,
}: {
  companies: FacetCompany[];
  foundersListed: number;
  campusesOnMap: number;
}) {
  const detail = useMemo(() => peakDetail(companies), [companies]);
  const peakBar = detail.bars.find((b) => b.peak) ?? null;
  const quiet = useMemo(() => companies.filter((c) => c.signals === 0).length, [companies]);
  if (!peakBar || detail.dated === 0 || detail.bars.length === 0) return null;
  const pct = Math.round((peakBar.count / Math.max(1, detail.dated)) * 100);
  const max = Math.max(1, ...detail.bars.map((b) => b.count));

  return (
    <div className="mb-4" data-fold-peak-identity="" data-fold-baseline="8">
      {/* Desk: one 369 hero + quiet bars (no count labels) + Scout edition */}
      <div className="mb-1 hidden lg:block" data-fold-peak-desk="">
        <div
          className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-end gap-5 border-b border-[color:var(--line,#E1E5EF)] pb-3"
          data-fold-peak-share=""
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
            <p className="mt-1.5 font-mono text-[64px] font-bold leading-[0.84] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)]">
              {peakBar.count.toLocaleString("en-US")}
              <span className="mx-2 text-[24px] font-semibold tracking-[-0.04em] text-[color:var(--fg-3,#5C647A)]">/</span>
              <span className="text-[36px] font-bold tracking-[-0.06em] text-[color:var(--fg,#0B0E17)]">
                {detail.dated.toLocaleString("en-US")}
              </span>
            </p>
            <p className="mt-2 max-w-[34rem] text-[16px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peakBar.label} took{" "}
              <span className="text-[color:var(--ember,#D96B1C)]">{pct}%</span>
              {" of every dated signal on record"}
            </p>
            <ol
              className="mt-3 flex h-10 items-end gap-1"
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
                  <span
                    className={`w-full max-w-[1.5rem] rounded-sm ${b.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/30"}`}
                    style={{ height: `${Math.max(4, Math.round((b.count / max) * 32))}px` }}
                  />
                  <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.04em] text-[color:var(--fg-3,#5C647A)]">{b.short}</span>
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
          <div className="min-w-0 self-stretch border-l border-[color:var(--line,#E1E5EF)] pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">Scout edition</p>
            <p className="mt-2.5 font-mono text-[12px] leading-5 tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold text-[color:var(--ember,#D96B1C)]">{detail.dated.toLocaleString("en-US")}</span>
              {" dated"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quiet.toLocaleString("en-US")}</span>
              {" quiet"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{foundersListed.toLocaleString("en-US")}</span>
              {" founder names"}
              <br />
              <span className="font-bold text-[color:var(--fg,#0B0E17)]">{campusesOnMap.toLocaleString("en-US")}</span>
              {" campuses on map"}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile: one calm Peak line · no heavy card stack */}
      <div className="border-b border-[color:var(--line,#E1E5EF)] pb-3 lg:hidden" data-fold-peak-share-mobile="" data-fold-peak-share="">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--cobalt,#2F4FD8)]">Peak share</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[36px] font-bold leading-none tracking-[-0.06em] text-[color:var(--ember,#D96B1C)]">
            {peakBar.count.toLocaleString("en-US")}
          </span>
          <span className="font-mono text-[16px] font-semibold text-[color:var(--fg-3,#5C647A)]">/</span>
          <span className="font-mono text-[22px] font-bold tracking-[-0.04em] text-[color:var(--fg,#0B0E17)]">
            {detail.dated.toLocaleString("en-US")}
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
            {peakBar.label} · {pct}% of dated
          </span>
        </p>
        <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
          {quiet.toLocaleString("en-US")} quiet · {foundersListed.toLocaleString("en-US")} founder names · {campusesOnMap.toLocaleString("en-US")} campuses
        </p>
      </div>
    </div>
  );
}
