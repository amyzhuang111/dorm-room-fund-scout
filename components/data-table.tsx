"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FounderTableRow } from "@/lib/domain/founder-table";
import { relativeTime } from "@/lib/domain/relative-time";
import { useFeedback } from "./feedback-provider";
import { useUserPipeline } from "./user-pipeline-provider";

const SIGNAL_COLOR: Record<string, string> = {
  funding: "var(--sig-raise)",
  demo: "var(--sig-launch)",
  continued_dev: "var(--sig-launch)",
  team_change: "var(--sig-hiring)",
  award: "var(--sig-press)",
  customer_evidence: "var(--sig-research)",
};

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

  return (
    <div>
      <div className="flex h-12 flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search founders" className="h-8 w-[280px] max-w-full rounded border border-line bg-sunken px-2 text-[13px] outline-none" />
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
        <select value={year} onChange={(event) => setYear(event.target.value)} className="h-8 rounded border border-line bg-raised px-2 text-[13px]" aria-label="Class year">
          <option value="">Year</option>
          {years.map((value) => <option key={value}>{value}</option>)}
        </select>
        <button type="button" className={`h-8 rounded px-2 text-[13px] ${verifiedOnly ? "bg-[var(--cobalt-haze)] text-fg" : "text-fg-2"}`} onClick={() => setVerifiedOnly((value) => !value)}>
          Verified
        </button>
        <button type="button" className="h-8 rounded px-2 text-[13px] text-fg-2" onClick={() => setCompact((value) => !value)}>
          {compact ? "Comfortable" : "Compact"}
        </button>
        <span className="num ml-auto text-[13px] text-fg-2">{filtered.length.toLocaleString("en-US")} founders</span>
      </div>
      <div className="overflow-x-auto border-t border-line-strong">
        <table className="w-full text-left text-[14px]">
          <thead className="sticky top-14 z-10 bg-sunken">
            <tr className="h-9 text-[11px] uppercase tracking-[0.06em] text-fg-3">
              <th className="w-8 px-2 font-medium" />
              <th className="px-2 font-mono font-medium">Name</th>
              <th className="px-2 font-mono font-medium">Tier</th>
              {!campusLocked && <th className="px-2 font-mono font-medium">Campus</th>}
              <th className="px-2 font-mono font-medium">Company</th>
              <th className="px-2 text-right font-mono font-medium">Year</th>
              <th className="px-2 font-mono font-medium">Last signal</th>
              <th className="px-2 text-right font-mono font-medium">Score</th>
              <th className="px-2 font-mono font-medium">Verified</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr
                key={row.id}
                className={`${rowH} border-b border-line ${index === cursor ? "bg-sunken" : ""} ${openId === row.id ? "bg-[var(--cobalt-haze)] shadow-[inset_2px_0_0_var(--cobalt)]" : ""}`}
                onClick={() => { setCursor(index); setOpenId(row.id); }}
              >
                <td className="px-2" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} />
                </td>
                <td className="px-2">
                  <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-sunken text-[11px] text-fg-2">{row.name.slice(0, 1)}</span>
                  <span className="font-medium">{row.name}</span>
                </td>
                <td className="px-2"><span className={tierClass(row.tier)}>{row.tier ?? "—"}</span></td>
                {!campusLocked && <td className="px-2 text-fg-2">{row.campusSlug ? <Link href={`/campuses/${row.campusSlug}`} className="text-cobalt">{row.campus}</Link> : row.campus ?? "—"}</td>}
                <td className="px-2">{row.companyId ? <Link href={`/startup/${row.companyId}`} className="text-cobalt">{row.company}</Link> : row.company ?? "—"}</td>
                <td className="num px-2 text-right text-[13px]">{row.year ?? "—"}</td>
                <td className="px-2 text-[13px] text-fg-2">
                  <span className="sig-dot mr-2 inline-block" style={{ background: SIGNAL_COLOR[row.signalType ?? ""] ?? "var(--sig-social)" }} />
                  <span className="line-clamp-1">{row.signal ?? "No signal on record"}</span>
                  {row.signalAt ? <span className="num ml-2 text-fg-3" title={row.signalAt}>{relativeTime(row.signalAt)}</span> : null}
                </td>
                <td className="num px-2 text-right text-[13px]">
                  {row.score == null ? "—" : row.score}
                  {row.score != null && <span className="ml-2 inline-block h-1 w-10 align-middle bg-sunken"><span className="block h-1 bg-cobalt" style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} /></span>}
                </td>
                <td className="px-2">{row.verified ? <span className="text-ok">✓</span> : <span className="text-fg-3">○</span>}</td>
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
            {open.campusSlug && <Link href={`/campuses/${open.campusSlug}`} className="text-cobalt">Open campus</Link>}
            {open.companyId && <Link href={`/startup/${open.companyId}`} className="text-cobalt">Open company</Link>}
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
