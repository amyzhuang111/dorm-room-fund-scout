"use client";

import { useState } from "react";

const BAR = "#b7cffc";

function range(start: number, end: number): number[] {
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

export function ClassYearChart({ years }: { years: { year: number; count: number }[] }) {
  const [alumni, setAlumni] = useState(false);
  const counts = new Map(years.map((item) => [item.year, item.count]));
  const earlier = years.filter((item) => item.year < 2016).reduce((sum, item) => sum + item.count, 0);
  const bars = alumni
    ? [
        ...(earlier > 0 ? [{ label: "2015 and earlier", count: earlier }] : []),
        ...range(2016, 2025).map((year) => ({ label: String(year), count: counts.get(year) ?? 0 })),
      ]
    : range(2026, 2029).map((year) => ({ label: String(year), count: counts.get(year) ?? 0 }));
  const peak = Math.max(1, ...bars.map((bar) => bar.count));
  const currentYear = String(new Date().getFullYear());

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="display text-[18px] font-medium">Founders by class year</p>
        <div className="flex h-8 rounded border border-line p-0.5" role="group" aria-label="Class year range">
          <button type="button" className={`rounded px-2 text-[14px] ${alumni ? "text-fg-2" : "bg-raised text-fg"}`} onClick={() => setAlumni(false)}>Current</button>
          <button type="button" className={`rounded px-2 text-[14px] ${alumni ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setAlumni(true)}>Alumni</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[108px_minmax(0,1fr)_56px] items-center gap-2 text-[14px] text-fg">
        <span>Year</span>
        <span />
        <span className="text-right">Count</span>
      </div>
      <ul className="mt-1.5 space-y-1.5" aria-label="Founders by class year">
        {bars.map((bar) => {
          const current = bar.label === currentYear;
          return (
            <li key={bar.label} className="grid grid-cols-[108px_minmax(0,1fr)_56px] items-center gap-2">
              <span className={`num text-[14px] text-fg ${current ? "font-semibold" : ""}`}>{bar.label}</span>
              <span className="block h-2 overflow-hidden rounded-sm bg-sunken">
                <span className="block h-2 rounded-sm" style={{ width: `${(bar.count / peak) * 100}%`, background: BAR, boxShadow: current ? "inset 0 0 0 1px #f7f8fc" : undefined }} />
              </span>
              <span className="num text-right text-[14px] text-fg">{bar.count.toLocaleString("en-US")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
