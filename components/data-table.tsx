"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FounderTableRow } from "@/lib/domain/founder-table";
import { relativeTime } from "@/lib/domain/relative-time";
import { useFeedback } from "./feedback-provider";
import { useUserPipeline } from "./user-pipeline-provider";

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^A-Za-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^A-Za-z]/g, "") : "";
  return ((first[0] ?? "") + (last[0] ?? first[1] ?? "")).toUpperCase() || "·";
}

function signalKind(row: FounderTableRow): "yc" | "github" | "funding" | null {
  const text = row.signal ?? "";
  if (/Y Combinator/i.test(text)) return "yc";
  if (/GitHub/i.test(text)) return "github";
  if (row.signalType === "funding" || /\braises?\b|\bfunding\b/i.test(text)) return "funding";
  return null;
}

function emptyOr(value: string | number | null | undefined) {
  if (value == null || value === "") return <span className="text-[#6f7688]">-</span>;
  return value;
}

function SourceMark({ kind }: { kind: "yc" | "github" | "funding" }) {
  const color = kind === "yc" ? "#7C8CF0" : kind === "funding" ? "#3FB68B" : "currentColor";
  if (kind === "github") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0" fill="currentColor">
        <path d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.46-.15.46-.33v-1.16c-1.88.41-2.28-.8-2.28-.8-.3-.78-.75-1-.75-1-.62-.42.05-.41.05-.41.68.05 1.04.7 1.04.7.6 1.04 1.58.74 1.97.56.06-.44.23-.74.42-.91-1.5-.17-3.08-.75-3.08-3.34 0-.74.26-1.34.7-1.81-.07-.17-.3-.87.06-1.81 0 0 .57-.18 1.86.7a6.4 6.4 0 0 1 3.38 0c1.29-.88 1.86-.7 1.86-.7.36.94.13 1.64.06 1.81.44.47.7 1.07.7 1.81 0 2.6-1.58 3.17-3.09 3.33.24.21.46.62.46 1.26v1.87c0 .18.12.4.47.33A6.8 6.8 0 0 0 8 1.2z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />
      {kind === "funding" ? <path d="M8 4.5v7M6 6.2h3.2a1.4 1.4 0 0 1 0 2.8H6.8" fill="none" stroke={color} strokeWidth="1.3" /> : <text x="8" y="11" textAnchor="middle" fontSize="7" fill={color}>Y</text>}
    </svg>
  );
}

function tierClass(tier: string | null): string {
  if (tier === "S+") return "tier-chip tier-splus";
  if (tier === "S") return "tier-chip tier-s";
  if (tier === "A") return "tier-chip tier-a";
  if (tier === "B") return "tier-chip tier-b";
  if (tier === "C" || tier === "D") return "tier-chip tier-c";
  return "tier-chip tier-none";
}

export function DataTable({ rows, campusLocked = false }: { rows: FounderTableRow[]; campusLocked?: boolean }) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [campus, setCampus] = useState("");
  const [year, setYear] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const feedback = useFeedback();
  const pipeline = useUserPipeline();

  const campuses = useMemo(() => [...new Set(rows.map((row) => row.campus).filter(Boolean))] as string[], [rows]);
  const years = useMemo(() => [...new Set(rows.map((row) => row.year).filter((value): value is number => value != null))].sort((a, b) => b - a), [rows]);
  const mostlyEmpty = (filled: number) => rows.length === 0 || filled / rows.length < 0.5;
  const autoColumns = {
    tier: !mostlyEmpty(rows.filter((row) => row.tier).length),
    year: !mostlyEmpty(rows.filter((row) => row.year != null).length),
    score: !mostlyEmpty(rows.filter((row) => row.score != null).length),
  };
  const [columnChoice, setColumnChoice] = useState<typeof autoColumns | null>(null);
  const columns = columnChoice ?? autoColumns;
  function setColumn(key: keyof typeof autoColumns, value: boolean) {
    setColumnChoice({ ...columns, [key]: value });
  }
  const filtered = rows.filter((row) => {
    if (query && !`${row.name} ${row.company ?? ""} ${row.campus ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (tier && row.tier !== tier) return false;
    if (campus && row.campus !== campus) return false;
    if (year && String(row.year ?? "") !== year) return false;
    if (verifiedOnly && !row.verified) return false;
    return true;
  });
  const open = filtered.find((row) => row.id === openId) ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Escape") setOpenId(null);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((index) => Math.min(filtered.length - 1, index + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && filtered[cursor]) setOpenId(filtered[cursor].id);
      if ((event.key === "s" || event.key === "S") && filtered[cursor]) {
        feedback.setAction({ entityType: "person", entityId: filtered[cursor].id, nameKey: filtered[cursor].name, domainKey: null, action: "like" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, feedback, filtered]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function exportCsv() {
    const picked = rows.filter((row) => selected.includes(row.id));
    const lines = ["name,tier,campus,company,year,score,verified", ...picked.map((row) => [row.name, row.tier ?? "", row.campus ?? "", row.company ?? "", row.year ?? "", row.score ?? "", row.verified ? "yes" : "no"].join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "founders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const rowH = compact ? "h-9" : "h-11";
  const withSignal = rows.filter((row) => row.signal).length;
  const verifiedCount = rows.filter((row) => row.verified).length;

  return (
    <div>
      <p className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-fg-2">
        <span><span className="tabular-nums text-fg">{rows.length.toLocaleString("en-US")}</span> founders</span>
        <span><span className="tabular-nums text-fg">{withSignal.toLocaleString("en-US")}</span> with a signal</span>
        <span><span className="tabular-nums text-fg">{verifiedCount.toLocaleString("en-US")}</span> verified</span>
      </p>
      <div className="flex h-12 flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search founders" className="h-9 w-[280px] max-w-full rounded border border-[#8b93a7] bg-raised px-2 text-[14px] outline-none" />
        <select value={tier} onChange={(event) => setTier(event.target.value)} className="h-8 rounded border border-line bg-raised px-2 text-[13px]" aria-label="Tier">
          <option value="">Tier</option>
          {["S+", "S", "A", "B", "C", "D"].map((value) => <option key={value}>{value}</option>)}
        </select>
        {!campusLocked && (
          <select value={campus} onChange={(event) => setCampus(event.target.value)} className="h-8 rounded border border-line bg-raised px-2 text-[13px]" aria-label="Campus">
            <option value="">Campus</option>
            {campuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        )}
        {columns.year && (
          <select value={year} onChange={(event) => setYear(event.target.value)} className="h-8 rounded border border-line bg-raised px-2 text-[13px]" aria-label="Class year">
            <option value="">Year</option>
            {years.map((value) => <option key={value}>{value}</option>)}
          </select>
        )}
        <details className="relative">
          <summary className="h-8 cursor-pointer list-none rounded px-2 leading-8 text-[13px] text-fg-2">Columns</summary>
          <div className="absolute z-30 mt-1 w-40 rounded border border-line bg-bg p-2 text-[13px] shadow-[var(--shadow-menu)]">
            {(["tier", "year", "score"] as const).map((key) => (
              <label key={key} className="flex items-center gap-2 py-1 capitalize">
                <input type="checkbox" checked={columns[key]} onChange={(event) => setColumn(key, event.target.checked)} />
                {key}
              </label>
            ))}
          </div>
        </details>
        <button type="button" className={`h-8 rounded px-2 text-[13px] ${verifiedOnly ? "bg-[var(--cobalt-haze)] text-fg" : "text-fg-2"}`} onClick={() => setVerifiedOnly((value) => !value)}>
          Verified
        </button>
        <button type="button" className="h-8 rounded px-2 text-[13px] text-fg-2" onClick={() => setCompact((value) => !value)}>
          {compact ? "Comfortable" : "Compact"}
        </button>
        <span className="num ml-auto text-[13px] text-fg-2">{filtered.length.toLocaleString("en-US")} founders</span>
      </div>
      <div className="max-h-[calc(100dvh-220px)] overflow-auto border-t border-line-strong">
        <table className="w-full border-separate border-spacing-0 text-left text-[14px]">
          <thead className="sticky top-0 z-20">
            <tr className="h-9 text-[14px] uppercase tracking-[0.06em] text-fg-2">
              <th className="sticky top-0 z-20 w-8 border-b border-line-strong bg-bg px-2 font-medium" />
              <th className="sticky top-0 z-20 min-w-[180px] border-b border-line-strong bg-bg px-2 font-mono font-medium">Name</th>
              {columns.tier && <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 font-mono font-medium">Tier</th>}
              {!campusLocked && <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 font-mono font-medium">Campus</th>}
              <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 font-mono font-medium">Company</th>
              {columns.year && <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 text-right font-mono font-medium">Year</th>}
              <th className="sticky top-0 z-20 min-w-[320px] border-b border-line-strong bg-bg px-2 font-mono font-medium">Last signal</th>
              {columns.score && <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 text-right font-mono font-medium">Score</th>}
              <th className="sticky top-0 z-20 border-b border-line-strong bg-bg px-2 font-mono font-medium">Verified</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr
                key={row.id}
                className={`${rowH} align-middle [&>td]:border-b [&>td]:border-line ${openId === row.id ? "bg-[var(--cobalt-haze)] shadow-[inset_2px_0_0_var(--cobalt)]" : index === cursor ? "bg-sunken" : "hover:bg-[#161c2e]"}`}
                onClick={() => { setCursor(index); setOpenId(row.id); }}
              >
                <td className="px-2" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} />
                </td>
                <td className="min-w-[180px] whitespace-nowrap px-2">
                  <span className="mr-2 inline-grid h-7 w-7 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-medium tracking-[-0.04em] text-fg">{initials(row.name)}</span>
                  <span className="font-medium">{row.name}</span>
                </td>
                {columns.tier && <td className="px-2">{row.tier ? <span className={tierClass(row.tier)}>{row.tier}</span> : emptyOr(null)}</td>}
                {!campusLocked && <td className="px-2">{row.campusSlug ? <Link href={`/campuses/${row.campusSlug}`} className="text-link">{row.campus}</Link> : emptyOr(row.campus)}</td>}
                <td className="px-2">{row.companyId ? <Link href={`/startup/${row.companyId}`} className="text-link">{row.company}</Link> : emptyOr(row.company)}</td>
                {columns.year && <td className="num px-2 text-right text-[14px]">{emptyOr(row.year)}</td>}
                <td className="max-w-[480px] px-2 text-[14px]" title={row.signal ?? undefined}>
                  {(() => {
                    const kind = signalKind(row);
                    return (
                      <span className="flex w-full items-center gap-2">
                        {kind ? <SourceMark kind={kind} /> : null}
                        <span className="min-w-0 flex-1 truncate">{emptyOr(row.signal)}</span>
                        {row.signalAt ? <span className="shrink-0 text-[14px] text-fg-2 tabular-nums">{relativeTime(row.signalAt)}</span> : null}
                      </span>
                    );
                  })()}
                </td>
                {columns.score && (
                  <td className="num px-2 text-right text-[14px]">
                    {emptyOr(row.score)}
                    {row.score != null && <span className="ml-2 inline-block h-1 w-10 align-middle bg-sunken"><span className="block h-1 bg-cobalt" style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} /></span>}
                  </td>
                )}
                <td className="px-2 text-[#6f7688]">{row.verified ? <span className="text-ok" title="Verified">✓</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-2 py-6 text-[13px] text-fg-2">No founders match. Clear filters.</p>}
      </div>
      {open && (
        <aside className="fixed bottom-0 right-0 top-14 z-30 w-[min(480px,100%)] overflow-y-auto border-l border-line bg-raised p-6">
          <button type="button" className="text-[13px] text-fg-2" onClick={() => setOpenId(null)}>Close</button>
          <h2 className="mt-3 text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{open.name}</h2>
          <p className="mt-1 text-[13px] text-fg-2">{open.campus ?? "Campus not on record"}{open.company ? ` · ${open.company}` : ""}</p>
          <p className="mt-4"><span className={tierClass(open.tier)}>{open.tier ?? "Unranked"}</span></p>
          <p className="mt-4 text-[15px] leading-6">{open.signal ?? "No signal text is stored for this person."}</p>
          <div className="mt-6 flex gap-4 text-[13px]">
            {open.campusSlug && <Link href={`/campuses/${open.campusSlug}`} className="text-link">Open campus</Link>}
            {open.companyId && <Link href={`/startup/${open.companyId}`} className="text-link">Open company</Link>}
          </div>
        </aside>
      )}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex h-12 items-center gap-4 border-t border-line bg-raised px-6 text-[13px]">
          <span className="num">{selected.length} selected</span>
          <button type="button" className="rounded bg-ember px-3 py-1 text-[#0b0e17]" onClick={() => {
            for (const id of selected) {
              const row = rows.find((item) => item.id === id);
              if (row) feedback.setAction({ entityType: "person", entityId: row.id, nameKey: row.name, domainKey: null, action: "like" });
            }
          }}>Add to shortlist</button>
          <button type="button" className="text-fg-2" onClick={() => {
            for (const id of selected) {
              const row = rows.find((item) => item.id === id);
              if (!row) continue;
              pipeline.star({ entityType: "person", entityId: row.id, name: row.name, campusName: row.campus, websiteUrl: null, stage: "Sourced" });
            }
          }}>Move to pipeline</button>
          <button type="button" className="text-fg-2" onClick={exportCsv}>Export CSV</button>
        </div>
      )}
    </div>
  );
}
