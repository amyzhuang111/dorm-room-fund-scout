"use client";

import { useState } from "react";
import { classYearBandCaption, classYearBandTotal, classYearBars, type ClassYearBand, type ClassYearCount } from "@/lib/domain/class-year-cohort";

export function ClassYearChart({ years, founders }: { years: ClassYearCount[]; founders: number }) {
  const [band, setBand] = useState<ClassYearBand>("recent_class_years");
  const bars = classYearBars(years, band);
  const peak = Math.max(1, ...bars.map((bar) => bar.count));
  const shown = classYearBandTotal(bars);
  const scope = classYearBandCaption(band, shown, founders);

  return (
    <div data-class-year-chart="" data-class-year-band={band}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-medium">Founders by class year</p>
        <div className="flex h-8 rounded border border-line p-0.5" role="group" aria-label="Class year band">
          <button type="button" aria-pressed={band === "recent_class_years"} className={`rounded px-2 text-[14px] ${band === "recent_class_years" ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setBand("recent_class_years")}>2026 to 2029</button>
          <button type="button" aria-pressed={band === "earlier_class_years"} className={`rounded px-2 text-[14px] ${band === "earlier_class_years" ? "bg-raised text-fg" : "text-fg-2"}`} onClick={() => setBand("earlier_class_years")}>Earlier</button>
        </div>
      </div>
      <p className="mt-1 text-[14px] leading-5 text-fg-2" data-class-year-caption="">{scope}</p>
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
              <span className="block h-2 rounded-sm bg-ember" style={{ width: `${(bar.count / peak) * 100}%` }} />
            </span>
            <span className="num text-right text-[14px] text-fg">{bar.count.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
