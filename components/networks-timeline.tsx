"use client";

import React from "react";

type Props = {
  yearMin: number;
  yearMax: number;
  year: number;
  playing: boolean;
  visibleCount: number;
  totalFounders: number;
  noYearCount: number;
  onYear: (y: number) => void;
  onTogglePlay: () => void;
};

export function NetworksTimeline({
  yearMin,
  yearMax,
  year,
  playing,
  visibleCount,
  totalFounders,
  noYearCount,
  onYear,
  onTogglePlay,
}: Props) {
  const span = Math.max(1, yearMax - yearMin);
  return (
    <div
      data-networks-timeline=""
      className="pointer-events-auto absolute bottom-10 left-1/2 z-[3] flex w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-1.5 rounded-lg border border-[color:var(--line)] bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2 text-[10px] text-[color:var(--fg-2)]">
        <span data-networks-timeline-count="">
          {visibleCount.toLocaleString("en-US")} of {totalFounders.toLocaleString("en-US")} founders by {year}
        </span>
        <span data-networks-timeline-noyear="" className="text-[color:var(--fg-3)]">
          {noYearCount.toLocaleString("en-US")} with no year left out
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-networks-timeline-play=""
          aria-label={playing ? "Pause cohort timeline" : "Play cohort timeline"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-white text-[color:var(--fg)]"
          onClick={onTogglePlay}
        >
          {playing ? (
            <span aria-hidden="true" className="text-[11px] font-semibold">
              II
            </span>
          ) : (
            <span aria-hidden="true" className="ml-0.5 text-[11px]">
              ▶
            </span>
          )}
        </button>
        <input
          data-networks-timeline-scrub=""
          type="range"
          min={yearMin}
          max={yearMax}
          step={1}
          value={year}
          aria-label="Cohort year"
          className="h-1.5 w-full cursor-pointer accent-[color:var(--cobalt)]"
          onChange={(e) => onYear(Number(e.target.value))}
        />
        <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-[color:var(--fg)]">
          {year}
        </span>
      </div>
      <div className="flex justify-between px-9 text-[9px] text-[color:var(--fg-3)]" aria-hidden="true">
        <span>{yearMin}</span>
        <span style={{ marginLeft: `${((year - yearMin) / span) * 100}%` }} />
        <span>{yearMax}</span>
      </div>
    </div>
  );
}
