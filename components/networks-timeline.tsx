"use client";

import React from "react";

type Props = {
  yearMin: number;
  yearMax: number;
  year: number;
  playing: boolean;
  visibleCount: number;
  totalFounders: number;
  alwaysOnCount: number;
  proxyCount: number;
  onYear: (y: number) => void;
  onTogglePlay: () => void;
};

/** Compact bottom-left pill; keeps the cloud clear. */
export function NetworksTimeline({
  yearMin,
  yearMax,
  year,
  playing,
  visibleCount,
  totalFounders,
  alwaysOnCount,
  proxyCount,
  onYear,
  onTogglePlay,
}: Props) {
  return (
    <div
      data-networks-timeline=""
      className="pointer-events-auto absolute bottom-3 left-3 z-[3] flex max-w-[min(340px,calc(100%-1.5rem))] flex-col gap-1 rounded-full border border-[color:var(--line)] bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm md:bottom-4 md:left-4"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-networks-timeline-play=""
          aria-label={playing ? "Pause cohort timeline" : "Play cohort timeline"}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-white text-[10px] text-[color:var(--fg)]"
          onClick={onTogglePlay}
        >
          {playing ? "II" : "▶"}
        </button>
        <input
          data-networks-timeline-scrub=""
          type="range"
          min={yearMin}
          max={yearMax}
          step={1}
          value={year}
          aria-label="Cohort year"
          className="h-1 w-[88px] cursor-pointer accent-[color:var(--cobalt)] sm:w-[120px]"
          onChange={(e) => onYear(Number(e.target.value))}
        />
        <span className="text-[10px] font-medium tabular-nums text-[color:var(--fg)]">{year}</span>
        <span data-networks-timeline-count="" className="truncate text-[10px] text-[color:var(--fg-2)]">
          {visibleCount.toLocaleString("en-US")} of {totalFounders.toLocaleString("en-US")}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 px-1 text-[9px] leading-tight text-[color:var(--fg-3)]">
        <span data-networks-timeline-always="">
          {alwaysOnCount.toLocaleString("en-US")} always on (no year)
        </span>
        {proxyCount > 0 ? (
          <span data-networks-timeline-proxy="">
            {proxyCount.toLocaleString("en-US")} via company founded year
          </span>
        ) : null}
      </div>
    </div>
  );
}
