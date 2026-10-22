"use client";

import { useState } from "react";

const BAR = "#b7cffc";

function range(start: number, end: number): number[] {
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

export function ClassYearChart({ years, founders }: { years: { year: number; count: number }[]; founders: number }) {
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
  const shown = bars.reduce((sum, bar) => sum + bar.count, 0);
  const scope = alumni
    ? `Alumni with a class year on file. ${shown.toLocaleString("en-US")} of ${founders.toLocaleString("en-US")} founders.`
    : `Current students, class of 2026 to 2029. ${shown.toLocaleString("en-US")} of ${founders.toLocaleString("en-US")} founders.`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-medium">Founders by class year</p>
        <div className="flex h-8 rounded border border-line p-0.5" role="group" aria-label="Class year range">
          <button type="button" className={`rounded px-2 text-[14px] ${alumni ? "text-fg-2" : "bg-raised text-fg"}`} onClick={() => setAlumni(false)}>Current</button>
          <button type="button" className={`rounded px-2 text-[14px] ${alumni ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setAlumni(true)}>Alumni</button>
        </div>
      </div>
      <p className="mt-1 text-[14px] leading-5 text-fg-2">{scope}</p>
      <div className="mt-3 grid grid-cols-[108px_minmax(0,1fr)_56px] items-center gap-2 text-[14px] text-fg">
        <span>Year</span>
        <span />
        <span className="text-right">Count</span>
      </div>
      <ul className="mt-1.5 space-y-1.5" aria-label="Founders by class year">
        {bars.map((bar) => (
          <li key={bar.label} className="grid grid-cols-[108px_minmax(0,1fr)_56px] items-center gap-2">
            <span className="num text-[14px] text-fg">{bar.label}</span>
            <span className="block h-2 w-full overflow-hidden rounded-sm bg-sunken">
              <span className="block h-2 rounded-sm" style={{ width: `${(bar.count / peak) * 100}%`, background: BAR }} />
            </span>
            <span className="num text-right text-[14px] text-fg">{bar.count.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
