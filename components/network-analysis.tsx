"use client";

import { useState } from "react";
import { NETWORK_FILTER_EVENT, type NetworkMapFilter } from "@/lib/domain/network-filter";
import { formatHitRate } from "@/lib/domain/campus-hit-rate-model";
import type { AnalysisCell, DensityRow, DensityTable, HeatmapTable, HitRateTable, NetworkAnalysis, PitchbookTable } from "@/lib/domain/network-analysis-model";
import { formatCapitalUsd } from "@/lib/domain/pitchbook-model";

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Slate-blue ramp. Text flips to white when that pairing has the higher contrast. */
export function heatPaint(t: number): { background: string; color: string } {
  const clamped = Math.min(1, Math.max(0, t));
  const light = [232, 238, 243];
  const dark = [36, 58, 82];
  const rgb = light.map((start, index) => Math.round(start + (dark[index] - start) * clamped));
  const lum = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const ink = 0.2126 * channel(28) + 0.7152 * channel(21) + 0.0722 * channel(37);
  const color = contrast(1, lum) > contrast(ink, lum) ? "#ffffff" : "#1c1525";
  return { background: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, color };
}

function paintCount(count: number, max: number): { background: string; color: string } {
  if (count <= 0 || max <= 0) return { background: "transparent", color: "#5c516e" };
  return heatPaint(Math.sqrt(count / max));
}

function pinMap(label: string, ids: string[]) {
  const detail: NetworkMapFilter = { label, ids };
  window.dispatchEvent(new CustomEvent(NETWORK_FILTER_EVENT, { detail }));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function NetworkAnalysis({ data }: { data: NetworkAnalysis }) {
  return (
    <section className="bg-surface px-4 py-6 sm:px-6" aria-label="Network analysis">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6">
        <Heatmap table={data.programs} />
        <Density table={data.density} />
        <PitchbookRankings table={data.pitchbook} />
        <HitRates table={data.hitRate} />
        <Heatmap table={data.metros} defaultOpen={false} />
      </div>
    </section>
  );
}

function Heatmap({ table, defaultOpen = true }: { table: HeatmapTable; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState<string | null>(null);
  let max = 0;
  for (const row of table.rows) {
    row.cells.forEach((cell, index) => {
      if (table.columns[index]?.shade && cell.count > max) max = cell.count;
    });
  }

  return (
    <article className="overflow-hidden rounded-lg border border-border-c bg-white text-foreground shadow-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="block text-[15px] font-semibold tracking-tight text-foreground">{table.title}</span>
          <span className="mt-0.5 block text-[13px] font-medium text-muted">{table.subtitle}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className={`sticky left-0 z-10 bg-[#f6f5f8] px-2 py-2 text-left text-[11px] font-semibold text-muted ${table.id === "programs" ? "min-w-[16rem]" : "min-w-[8.5rem]"}`}>{table.rowHeader}</th>
                  {table.columns.map((column) => (
                    <th key={column.id} className="min-w-[4.25rem] bg-[#f6f5f8] px-1 py-2 text-center text-[11px] font-semibold leading-tight text-muted">
                      {column.label}
                    </th>
                  ))}
                  <th className="min-w-[4.5rem] bg-[#f6f5f8] px-2 py-2 text-right text-[11px] font-semibold text-muted">{table.allLabel}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium text-foreground" scope="row">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <RowButton
                          label={row.label}
                          count={row.all.count}
                          pressed={active === `${row.id}:all`}
                          onClick={() => {
                            if (row.all.count === 0) return;
                            setActive(`${row.id}:all`);
                            pinMap(`${table.title}: ${row.label}`, row.all.ids);
                          }}
                        />
                        {row.tier ? <ProgramTierChip tier={row.tier} /> : null}
                      </span>
                    </th>
                    {row.cells.map((cell, index) => {
                      const column = table.columns[index];
                      const key = `${row.id}:${column?.id ?? index}`;
                      return (
                        <td key={column?.id ?? index} className="p-0 text-center">
                          <HeatCell
                            cell={cell}
                            label={`${row.label}, ${column?.label ?? ""}`}
                            paint={column?.shade ? paintCount(cell.count, max) : null}
                            pressed={active === key}
                            onClick={() => {
                              setActive(key);
                              pinMap(`${row.label} · ${column?.label ?? ""}`, cell.ids);
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="p-0 text-right">
                      {row.all.count === 0 ? (
                        <span className="inline-flex h-7 items-center px-2 text-muted">-</span>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={active === `${row.id}:all`}
                          aria-label={`${row.label}, ${table.allLabel}, ${row.all.count}. Filter the map.`}
                          className={`inline-flex h-7 items-center px-2 text-xs font-semibold tabular-nums text-foreground hover:underline ${active === `${row.id}:all` ? "underline" : ""}`}
                          onClick={() => {
                            setActive(`${row.id}:all`);
                            pinMap(`${table.title}: ${row.label}`, row.all.ids);
                          }}
                        >
                          {row.all.count.toLocaleString("en-US")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footer caption={table.caption} />
        </div>
      )}
    </article>
  );
}

function Density({ table }: { table: DensityTable }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const maxFounders = Math.max(0, ...table.rows.map((row) => row.founders));
  const maxStartups = Math.max(0, ...table.rows.map((row) => row.startups));
  const maxRate = Math.max(0, ...table.rows.map((row) => row.perThousand));

  return (
    <article className="overflow-hidden rounded-lg border border-border-c bg-white text-foreground shadow-sm">
      <button type="button" className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <span className="block text-[15px] font-semibold tracking-tight text-foreground">{table.title}</span>
          <span className="mt-0.5 block text-[13px] font-medium text-muted">{table.subtitle}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  {["Campus", "Verified founders", "Verified startups", "Undergrad enrollment", "Founders per 1,000"].map((label, index) => (
                    <th
                      key={label}
                      className={`bg-[#f6f5f8] px-2 py-2 text-[11px] font-semibold text-muted ${index === 0 ? "sticky left-0 z-10 min-w-[8.5rem] text-left" : "text-right"}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium text-foreground" scope="row">
                      <RowButton
                        label={row.label}
                        count={row.founders}
                        pressed={active === row.id}
                        onClick={() => {
                          setActive(row.id);
                          pinMap(`${row.label} verified founders`, row.ids);
                        }}
                      />
                    </th>
                    <td className="p-0 text-right">
                      <RateCell value={row.founders} paint={paintCount(row.founders, maxFounders)} label={`${row.label} verified founders`} pressed={active === `${row.id}:founders`} onClick={() => chooseDensity(row, "founders", setActive)} />
                    </td>
                    <td className="p-0 text-right">
                      <RateCell value={row.startups} paint={paintCount(row.startups, maxStartups)} label={`${row.label} verified startups`} pressed={active === `${row.id}:startups`} onClick={() => chooseDensity(row, "startups", setActive)} />
                    </td>
                    <td className="px-2 py-1 text-right text-xs tabular-nums text-foreground">{row.undergrads.toLocaleString("en-US")}</td>
                    <td className="p-0 text-right">
                      <RateCell
                        value={row.perThousand}
                        paint={paintCount(row.perThousand, maxRate)}
                        label={`${row.label} founders per 1,000 undergraduates`}
                        pressed={active === `${row.id}:rate`}
                        digits
                        onClick={() => chooseDensity(row, "rate", setActive)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footer caption={table.caption} />
          <details className="mt-2 px-1 text-[11px] text-muted">
            <summary className="cursor-pointer font-medium text-foreground">Enrollment sources</summary>
            <ul className="mt-2 space-y-1">
              {table.rows.map((row) => (
                <li key={row.id}>
                  {row.label}: {row.undergrads.toLocaleString("en-US")} {row.enrollmentKind} ({row.enrollmentYear}).{" "}
                  <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                    {row.sourceName}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </article>
  );
}

function PitchbookRankings({ table }: { table: PitchbookTable }) {
  const [open, setOpen] = useState(true);
  const maxRate = Math.max(0, ...table.rows.map((row) => row.perThousand ?? 0));
  return (
    <article className="overflow-hidden rounded-lg border border-border-c bg-white text-foreground shadow-sm">
      <button type="button" className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <span className="block text-[15px] font-semibold tracking-tight text-foreground">{table.title}</span>
          <span className="mt-0.5 block text-[13px] font-medium text-muted">{table.subtitle}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  {["Campus", "Rank", "Founders", "Companies", "Capital raised", "Enrollment band", "Founders per 1,000"].map((label, index) => (
                    <th key={label} className={`bg-[#f6f5f8] px-2 py-2 text-[11px] font-semibold text-muted ${index === 0 ? "sticky left-0 z-10 min-w-[8.5rem] text-left" : "text-right"}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium text-foreground" scope="row">
                      {row.label}
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.rank}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.founders.toLocaleString("en-US")}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.companies.toLocaleString("en-US")}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{formatCapitalUsd(row.capitalRaisedUsd)}</td>
                    <td className="px-2 py-1 text-right text-foreground">{row.enrollmentBand ?? "-"}</td>
                    <td className="p-0 text-right">
                      {row.perThousand == null ? (
                        <span className="inline-flex h-7 items-center px-2 text-muted">-</span>
                      ) : (
                        <span
                          className="inline-flex h-7 min-w-[2.5rem] items-center justify-end rounded-md px-2 text-xs font-medium tabular-nums"
                          style={paintCount(row.perThousand, maxRate)}
                        >
                          {row.perThousand.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.rows.length === 0 && <p className="px-1 text-sm text-muted">No PitchBook rankings are imported yet.</p>}
          <Footer caption={table.caption} source={{ href: table.sourceUrl, label: table.sourceLabel }} />
        </div>
      )}
    </article>
  );
}

function HitRates({ table }: { table: HitRateTable }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const maxRate = Math.max(0, ...table.rows.map((row) => row.hitRate));
  return (
    <article className="overflow-hidden rounded-lg border border-border-c bg-white text-foreground shadow-sm">
      <button type="button" className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <span className="block text-[15px] font-semibold tracking-tight text-foreground">{table.title}</span>
          <span className="mt-0.5 block text-[13px] font-medium text-foreground">{table.sentence}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  {["Campus", "Tracked founders", "Good outcomes", "Hit rate", "95% interval"].map((label, index) => (
                    <th key={label} className={`bg-[#f6f5f8] px-2 py-2 text-[11px] font-semibold text-muted ${index === 0 ? "sticky left-0 z-10 min-w-[8.5rem] text-left" : "text-right"}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-xs font-medium text-foreground" scope="row">
                      <RowButton
                        label={row.label}
                        count={row.founders}
                        pressed={active === row.id}
                        onClick={() => {
                          setActive(row.id);
                          pinMap(`${row.label} tracked founders`, row.ids);
                        }}
                      />
                    </th>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.founders.toLocaleString("en-US")}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{row.good.toLocaleString("en-US")}</td>
                    <td className="p-0 text-right">
                      <span
                        className="inline-flex h-7 min-w-[2.5rem] items-center justify-end rounded-md px-2 text-xs font-medium tabular-nums"
                        style={paintCount(row.hitRate, maxRate)}
                      >
                        {formatHitRate(row.hitRate)}×
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">
                      {formatHitRate(row.low)}-{formatHitRate(row.high)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footer caption={table.caption} />
        </div>
      )}
    </article>
  );
}

function chooseDensity(row: DensityRow, key: string, setActive: (value: string) => void) {
  setActive(`${row.id}:${key}`);
  pinMap(`${row.label} verified founders`, row.ids);
}

function HeatCell({
  cell,
  label,
  paint,
  pressed,
  onClick,
}: {
  cell: AnalysisCell;
  label: string;
  paint: { background: string; color: string } | null;
  pressed: boolean;
  onClick: () => void;
}) {
  if (cell.count <= 0) {
    return (
      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-muted" aria-label={`${label}, none`}>
        -
      </span>
    );
  }
  const style = paint ?? { background: "#eef0f3", color: "#1c1525" };
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}, ${cell.count}. Filter the map.`}
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums ${pressed ? "ring-2 ring-foreground ring-offset-1" : ""}`}
      style={style}
    >
      {cell.count.toLocaleString("en-US")}
    </button>
  );
}

function RateCell({
  value,
  paint,
  label,
  pressed,
  digits,
  onClick,
}: {
  value: number;
  paint: { background: string; color: string };
  label: string;
  pressed: boolean;
  digits?: boolean;
  onClick: () => void;
}) {
  const text = digits ? value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : value.toLocaleString("en-US");
  if (value <= 0) {
    return <span className="inline-flex h-7 min-w-7 items-center justify-end rounded-md px-2 text-muted">-</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}, ${text}. Filter the map.`}
      onClick={onClick}
      className={`inline-flex h-7 min-w-[2.5rem] items-center justify-end rounded-md px-2 text-xs font-medium tabular-nums ${pressed ? "ring-2 ring-foreground ring-offset-1" : ""}`}
      style={paint}
    >
      {text}
    </button>
  );
}

const PROGRAM_TIER_CLASS: Record<string, string> = {
  "S+": "bg-accent text-accent-foreground border-accent",
  S: "bg-accent text-accent-foreground border-accent",
  A: "bg-ok-bg text-ok border-ok/20",
  B: "bg-warn-bg text-warn border-warn/20",
};

function ProgramTierChip({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${PROGRAM_TIER_CLASS[tier] ?? "bg-surface-2 text-muted border-border-c"}`}
      title={`Scouting tier ${tier}`}
    >
      {tier}
    </span>
  );
}

function RowButton({ label, count, pressed, onClick }: { label: string; count: number; pressed: boolean; onClick: () => void }) {
  if (count <= 0) return <span>{label}</span>;
  return (
    <button type="button" aria-pressed={pressed} className={`text-left hover:underline ${pressed ? "underline" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Footer({ caption, source }: { caption: string; source?: { href: string; label: string } }) {
  const stops = [0.08, 0.28, 0.5, 0.72, 0.94];
  return (
    <div className="mt-2 flex flex-wrap items-end justify-between gap-3 px-1">
      <p className="max-w-3xl text-[11px] leading-snug text-muted">
        {caption}{" "}
        {source ? (
          <a href={source.href} target="_blank" rel="noopener noreferrer" className="text-link underline">
            {source.label}
          </a>
        ) : null}
      </p>
      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
        Fewer
        <span className="inline-flex items-center gap-0.5" aria-hidden="true">
          {stops.map((stop) => (
            <span key={stop} className="h-3 w-4 rounded-[3px]" style={{ background: heatPaint(stop).background }} />
          ))}
        </span>
        More
      </p>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`mt-1 shrink-0 text-muted transition-transform ${open ? "" : "rotate-180"}`}>
      <path d="M3.2 10.2 8 5.6l4.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
