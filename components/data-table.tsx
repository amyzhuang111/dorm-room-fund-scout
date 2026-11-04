"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectMate, ProjectTableRow } from "@/lib/domain/founder-table";
import { cleanCsvNames, cleanCsvText, encodeCsv } from "@/lib/display/csv";
import { plainText } from "@/lib/display/plain-text";
import { relativeTime } from "@/lib/domain/relative-time";
import { LogoMark } from "./sample-instrument";
import { useFeedback } from "./feedback-provider";
import { useUserPipeline } from "./user-pipeline-provider";

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^A-Za-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^A-Za-z]/g, "") : "";
  return ((first[0] ?? "") + (last[0] ?? first[1] ?? "")).toUpperCase() || "·";
}

function calendarDay(iso: string | null): string | null {
  if (!iso) return null;
  const match = iso.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function Empty() {
  return <span className="text-fg-3" role="img" aria-label="not on file" />;
}

function tierClass(tier: string | null): string {
  if (tier === "S+") return "tier-chip tier-splus";
  if (tier === "S") return "tier-chip tier-s";
  if (tier === "A") return "tier-chip tier-a";
  if (tier === "B") return "tier-chip tier-b";
  if (tier === "C" || tier === "D") return "tier-chip tier-c";
  return "tier-chip tier-none";
}

function personLine(person: ProjectMate): string {
  return person.signalAt ? `${person.name}, ${relativeTime(person.signalAt)}` : person.name;
}

function AvatarStack({ people }: { people: ProjectMate[] }) {
  const person = people[0];
  if (!person) return null;
  const extra = people.length - 1;
  return (
    <span className="flex shrink-0 items-center">
      <span
        title={people.map((mate) => personLine(mate)).join(", ")}
        className="inline-grid h-7 w-7 place-items-center rounded-full border-2 border-bg bg-raised text-[13px] font-medium tracking-[-0.04em] text-fg"
      >
        {initials(person.name)}
      </span>
      {extra > 0 ? <span className="ml-1.5 text-[13px] text-fg">+{extra}</span> : null}
    </span>
  );
}

interface Group {
  event: string | null;
  at: string | null;
  rows: ProjectTableRow[];
}

function groupRows(rows: ProjectTableRow[]): Group[] {
  const groups: Group[] = [];
  const byEvent = new Map<string, Group>();
  for (const row of rows) {
    if (row.event) {
      const existing = byEvent.get(row.event);
      if (existing) {
        existing.rows.push(row);
        if (calendarDay(row.signalAt) && calendarDay(row.signalAt) !== calendarDay(existing.at)) {
          const rowTime = Date.parse(row.signalAt ?? "");
          const groupTime = Date.parse(existing.at ?? "");
          if (!Number.isNaN(rowTime) && (Number.isNaN(groupTime) || rowTime > groupTime)) existing.at = row.signalAt;
        }
      } else {
        const group = { event: row.event, at: row.signalAt, rows: [row] };
        byEvent.set(row.event, group);
        groups.push(group);
      }
    } else {
      groups.push({ event: null, at: null, rows: [row] });
    }
  }
  return groups;
}

const ROW_PAGE = 150;

export function DataTable({ rows, campusLocked = false }: { rows: ProjectTableRow[]; campusLocked?: boolean }) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [campus, setCampus] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [compact, setCompact] = useState(false);
  // Show every row by default; signaled rows already sort first, and hiding the rest made
  // the table look shorter than the founder count above it.
  const [showQuiet, setShowQuiet] = useState(true);
  // Drawing every row at once (2,000+) is what made the table heavy. Filters and
  // search still run over ALL rows; only the drawn slice is limited.
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const feedback = useFeedback();
  const pipeline = useUserPipeline();

  const campuses = useMemo(() => [...new Set(rows.map((row) => row.campus).filter(Boolean))] as string[], [rows]);
  const verifiedFilled = rows.filter((row) => row.verified).length;
  const dateFilled = rows.filter((row) => row.signalAt).length;
  const mostlyEmpty = (filled: number) => rows.length === 0 || filled / rows.length < 0.5;
  const head = rows.slice(0, 20);
  const autoVerified = verifiedFilled > 0 && head.length > 0 && head.filter((row) => row.verified).length / head.length >= 0.25;
  const autoDate = campusLocked ? !mostlyEmpty(dateFilled) : true;
  const [verifiedChoice, setVerifiedChoice] = useState<boolean | null>(null);
  const [dateChoice, setDateChoice] = useState<boolean | null>(null);
  const [tierReasonId, setTierReasonId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showVerified = verifiedChoice ?? autoVerified;
  // Tier is always visible and ranked by default (task: mobile-compat / founders).
  const showTier = true;
  const showDate = dateChoice ?? autoDate;

  const filtered = rows.filter((row) => {
    if (query) {
      const hay = `${row.name} ${row.detail ?? ""} ${row.event ?? ""} ${row.people.map((person) => person.name).join(" ")}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    if (tier && row.tier !== tier && !row.people.some((person) => person.tier === tier)) return false;
    if (campus && row.campus !== campus) return false;
    if (verifiedOnly && !row.verified) return false;
    return true;
  });
  const hasSignal = (row: ProjectTableRow) => Boolean(row.detail || row.full || row.event || row.signalAt);
  const quietCount = filtered.filter((row) => !hasSignal(row)).length;
  const listed = showQuiet ? filtered : filtered.filter(hasSignal);
  const allGroups = useMemo(() => groupRows(listed), [listed]);
  const totalListed = useMemo(() => allGroups.reduce((n, group) => n + group.rows.length, 0), [allGroups]);
  const groups = useMemo(() => {
    const out: typeof allGroups = [];
    let drawn = 0;
    for (const group of allGroups) {
      if (drawn >= rowLimit) break;
      out.push(group);
      drawn += group.rows.length;
    }
    return out;
  }, [allGroups, rowLimit]);
  const ordered = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const hiddenRows = Math.max(0, totalListed - ordered.length);
  const open = ordered.find((row) => row.id === openId) ?? null;

  const shortlistPeople = useCallback((row: ProjectTableRow) => {
    for (const person of row.people) {
      feedback.setAction({ entityType: "person", entityId: person.id, nameKey: person.name, domainKey: null, action: "like" });
    }
  }, [feedback]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Escape") setOpenId(null);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((index) => Math.min(ordered.length - 1, index + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((index) => Math.max(0, index - 1));
      }
      if (event.key === "Enter" && ordered[cursor]) setOpenId(ordered[cursor].id);
      if ((event.key === "s" || event.key === "S") && ordered[cursor]) shortlistPeople(ordered[cursor]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, feedback, ordered, shortlistPeople]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function exportCsv() {
    const picked = rows.filter((row) => selected.includes(row.id));
    const csv = encodeCsv([
      ["project", "tier", "campus", "people", "signal"],
      ...picked.map((row) => [
        cleanCsvText(row.name),
        cleanCsvText(row.tier),
        cleanCsvText(row.campus),
        cleanCsvNames(row.people.map((person) => person.name)),
        cleanCsvText(row.full ?? row.detail ?? row.event),
      ]),
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "projects.csv";
    link.click();
    URL.revokeObjectURL(url);
  }


  const activeFilterCount =
    (tier ? 1 : 0) +
    (!campusLocked && campus ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (showQuiet ? 1 : 0);

  const pad = compact ? "py-2" : "py-3";
  const columns = 2 + (showTier ? 1 : 0) + (campusLocked ? 0 : 1) + 1 + (showDate ? 1 : 0) + (showVerified ? 1 : 0);
  const control = "inline-flex h-11 min-h-11 items-center rounded border border-line bg-raised px-3 text-[14px] text-fg sm:h-9 sm:min-h-0";

  const rowStarts = groups.reduce<number[]>((starts) => {
    const previous = starts.length === 0 ? 0 : starts[starts.length - 1] + groups[starts.length - 1].rows.length;
    starts.push(previous);
    return starts;
  }, []);

  return (
    <div>
      {(query || campus || tier || verifiedOnly) && <p className="mb-2 text-sm text-fg-2" role="status">{filtered.length.toLocaleString("en-US")} matching projects</p>}
      {/* Mobile: search + Filters sheet. Desk: full filter row. */}
      <div className="flex items-center gap-2 sm:hidden" data-data-explorer-filters="" role="group" aria-label="Filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company or founder"
          className="h-11 min-h-11 flex-1 rounded border border-line bg-raised px-3 text-[14px] text-fg outline-none"
        />
        <button
          type="button"
          className={`${control} relative shrink-0 ${filtersOpen || activeFilterCount > 0 ? "border-link" : ""}`}
          aria-expanded={filtersOpen}
          data-filters-toggle=""
          onClick={() => setFiltersOpen((value) => !value)}
        >
          Filters
          {activeFilterCount > 0 ? (
            <span className="num ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-link px-1 text-[11px] font-medium text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>
      {filtersOpen ? (
        <div
          className="mt-2 space-y-2 rounded border border-line bg-raised p-3 sm:hidden"
          data-filters-sheet=""
          role="group"
          aria-label="Filter options"
        >
          <select value={tier} onChange={(event) => setTier(event.target.value)} className={`${control} w-full`} aria-label="Tier">
            <option value="">Tier</option>
            {["S+", "S", "A", "B", "C", "D"].map((value) => <option key={value}>{value}</option>)}
          </select>
          {!campusLocked && (
            <select value={campus} onChange={(event) => setCampus(event.target.value)} className={`${control} w-full`} aria-label="Campus">
              <option value="">Campus</option>
              {campuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          )}
          {verifiedFilled > 0 && (
            <button type="button" className={`${control} w-full justify-between ${verifiedOnly ? "border-link" : ""}`} onClick={() => setVerifiedOnly((value) => !value)}>
              Verified only
            </button>
          )}
          {quietCount > 0 && (
            <button type="button" className={`${control} w-full justify-between`} onClick={() => setShowQuiet((value) => !value)}>
              {showQuiet ? "Hide no-signal rows" : "Show no-signal rows"}
            </button>
          )}
          {(campusLocked || verifiedFilled > 0) && (
            <div className="space-y-1 border-t border-line pt-2 text-[14px]" data-columns-panel="">
              <p className="text-fg-2">Columns</p>
              {campusLocked && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={showDate} onChange={(event) => setDateChoice(event.target.checked)} />
                  Date
                </label>
              )}
              {verifiedFilled > 0 && (
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={showVerified} onChange={(event) => setVerifiedChoice(event.target.checked)} />
                  Verified
                </label>
              )}
            </div>
          )}
          <button type="button" className={`${control} w-full`} onClick={() => setCompact((value) => !value)}>
            {compact ? "Comfortable density" : "Compact density"}
          </button>
          <button type="button" className={`${control} w-full border-link text-link`} onClick={() => setFiltersOpen(false)}>
            Done
          </button>
        </div>
      ) : null}
      <div className="mt-2 hidden flex-wrap items-center gap-2 sm:mt-0 sm:flex sm:gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters" data-data-explorer-filters-desk="">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company or founder" className="h-9 w-[280px] max-w-full rounded border border-line bg-raised px-2 text-[14px] text-fg outline-none" />
          <select value={tier} onChange={(event) => setTier(event.target.value)} className={control} aria-label="Tier">
            <option value="">Tier</option>
            {["S+", "S", "A", "B", "C", "D"].map((value) => <option key={value}>{value}</option>)}
          </select>
          {!campusLocked && (
            <select value={campus} onChange={(event) => setCampus(event.target.value)} className={control} aria-label="Campus">
              <option value="">Campus</option>
              {campuses.map((value) => <option key={value}>{value}</option>)}
            </select>
          )}
          {verifiedFilled > 0 && (
            <button type="button" className={`${control} ${verifiedOnly ? "border-link" : ""}`} onClick={() => setVerifiedOnly((value) => !value)}>
              Verified
            </button>
          )}
          {quietCount > 0 && (
            <button type="button" className={control} onClick={() => setShowQuiet((value) => !value)}>
              {showQuiet ? "Hide rows with no signal" : "Show rows with no signal"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:border-l sm:border-line sm:pl-3" role="group" aria-label="View">
          {(campusLocked || verifiedFilled > 0) && (
            <details className="relative">
              <summary className={`${control} cursor-pointer list-none`}>Columns</summary>
              <div className="absolute right-0 z-30 mt-1 w-40 rounded border border-line bg-bg p-2 text-[14px] text-fg shadow-[var(--shadow-menu)]" data-columns-panel="">
                {campusLocked && (
                  <label className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={showDate} onChange={(event) => setDateChoice(event.target.checked)} />
                    Date
                  </label>
                )}
                {verifiedFilled > 0 && (
                  <label className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={showVerified} onChange={(event) => setVerifiedChoice(event.target.checked)} />
                    Verified
                  </label>
                )}
              </div>
            </details>
          )}
          <button type="button" className={control} onClick={() => setCompact((value) => !value)}>
            {compact ? "Comfortable" : "Compact"}
          </button>
        </div>
      </div>
      {/* Mobile: stacked cards. Desk: sticky first column + horizontal scroll. */}
      <div className="mt-2 max-h-[calc(100dvh-160px)] overflow-auto border-t border-line-strong sm:mt-3 sm:max-h-[calc(100dvh-220px)] sm:overflow-x-auto" data-projects-scroll="">
        <ul className="divide-y divide-line sm:hidden" data-projects-cards="">
          {ordered.map((row, index) => {
            const text = row.detail || row.full;
            const reasonOpen = tierReasonId === row.id;
            const markName = row.name || row.people[0]?.name || "Project";
            return (
              <li key={row.id} className="px-1 py-3" data-project-card="">
                <div className="min-w-0">
                    <button type="button" className="flex min-h-11 w-full items-center gap-3 text-left" onClick={() => { setCursor(index); setOpenId(row.id); }}>
                      <LogoMark name={markName} logoUrl={row.logoUrl} size={36} />
                      <span className="min-w-0 truncate text-[14px] font-medium text-fg">{plainText(row.name) || "n/a"}</span>
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-fg-2">
                      {row.tier ? (
                        <button
                          type="button"
                          className={`${tierClass(row.tier)} min-h-11 px-2`}
                          data-tier={row.tier}
                          data-tier-reason-trigger=""
                          aria-expanded={reasonOpen}
                          onClick={() => setTierReasonId(reasonOpen ? null : row.id)}
                        >
                          {row.tier}
                        </button>
                      ) : null}
                      {!campusLocked && row.campus ? (
                        row.campusSlug ? (
                          <Link href={`/campuses/${row.campusSlug}`} className="inline-flex min-h-11 items-center text-link">{plainText(row.campus)}</Link>
                        ) : (
                          <span>{plainText(row.campus)}</span>
                        )
                      ) : null}
                      {row.verified ? <span className="text-ok">Verified</span> : null}
                    </div>
                    {reasonOpen && row.tierBasis ? (
                      <p className="mt-2 text-[14px] leading-5 text-fg" data-tier-reason="">{plainText(row.tierBasis)}</p>
                    ) : null}
                    <button type="button" className="mt-1 min-h-11 w-full text-left text-[14px] leading-5 text-fg" onClick={() => { setCursor(index); setOpenId(row.id); }}>
                      {text ? plainText(text) : "No signal yet"}
                    </button>
                </div>
              </li>
            );
          })}
        </ul>
        <table className="hidden w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-left text-[14px] text-fg sm:table">
          <thead className="sticky top-0 z-20">
            <tr className="h-9 text-[14px] text-fg">
              <th className="sticky top-0 z-20 w-8 overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium" />
              <th className="sticky top-0 z-20 w-[30%] overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium">Project</th>
              {showTier && <th className="sticky top-0 z-20 w-[72px] overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium">Tier</th>}
              {!campusLocked && <th className="sticky top-0 z-20 w-[16%] overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium">Campus</th>}
              <th className="sticky top-0 z-20 overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium">Signal</th>
              {showDate && <th className="sticky top-0 z-20 w-[88px] overflow-hidden truncate border-b border-line-strong bg-bg px-2 text-right font-medium">Date</th>}
              {showVerified && <th className="sticky top-0 z-20 w-[76px] overflow-hidden truncate border-b border-line-strong bg-bg px-2 font-medium">Verified</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIndex) => {
              const rowIndex = rowStarts[groupIndex] ?? 0;
              const headerDay = calendarDay(group.at);
              const header = group.event ? (
                <tr key={`event:${group.event}`} className="bg-bg">
                  <td colSpan={columns} className="border-b border-line px-2 py-2">
                    <span className="inline-flex items-center gap-3">
                      <span className="rounded-full border border-line bg-raised px-2 py-px text-[14px] leading-5 text-fg">{plainText(group.event)}</span>
                      {group.at ? <span className="num text-[14px] text-fg">{relativeTime(group.at)}</span> : <Empty />}
                    </span>
                  </td>
                </tr>
              ) : null;
              const body = group.rows.map((row, offset) => {
                const index = rowIndex + offset;
                const sameDay = group.event != null && headerDay != null && calendarDay(row.signalAt) === headerDay;
                const date = !row.signalAt || sameDay ? null : relativeTime(row.signalAt);
                const quiet = !hasSignal(row);
                const text = row.detail || (!group.event ? row.full : null);
                const stripe = index % 2 === 1 ? "bg-raised" : "";
                return (
                  <tr
                    key={row.id}
                    className={`align-top [&>td]:border-b [&>td]:border-line ${quiet ? "text-fg-2" : "text-fg"} ${openId === row.id ? "bg-[var(--cobalt-haze)] shadow-[inset_2px_0_0_var(--cobalt)]" : index === cursor ? "bg-sunken" : `${stripe} hover:bg-sunken`}`}
                    onClick={() => { setCursor(index); setOpenId(row.id); }}
                  >
                    <td className={`${pad} px-2`} onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name || row.people[0]?.name || "project"}`} />
                    </td>
                    <td className={`${pad} px-2`}>
                      <span className="flex min-w-0 items-center gap-2">
                        <AvatarStack people={row.people} />
                        <span className="min-w-0 truncate font-medium text-fg">{plainText(row.name) || <Empty />}</span>
                        {campusLocked && !showTier && row.tier ? <span className={tierClass(row.tier)}>{row.tier}</span> : null}
                        {campusLocked && !showVerified && row.verified ? <span className="text-[13px] font-medium text-link">Verified</span> : null}
                      </span>
                    </td>
                    {showTier && (
                      <td className={`${pad} px-2`}>
                        {row.tier ? (
                          <button
                            type="button"
                            className={`${tierClass(row.tier)} min-h-11 min-w-11`}
                            data-tier={row.tier}
                            data-tier-reason-trigger=""
                            aria-expanded={tierReasonId === row.id}
                            title={row.tierBasis ?? undefined}
                            onClick={(event) => {
                              event.stopPropagation();
                              setTierReasonId(tierReasonId === row.id ? null : row.id);
                            }}
                          >
                            {row.tier}
                          </button>
                        ) : (
                          <Empty />
                        )}
                        {tierReasonId === row.id && row.tierBasis ? (
                          <p className="mt-1 max-w-[14rem] text-[14px] leading-5 text-fg" data-tier-reason="">
                            {plainText(row.tierBasis)}
                          </p>
                        ) : null}
                      </td>
                    )}
                    {!campusLocked && (
                      <td className={`${pad} truncate px-2`}>
                        {row.campusSlug ? <Link href={`/campuses/${row.campusSlug}`} className="text-link">{plainText(row.campus)}</Link> : plainText(row.campus) || <Empty />}
                      </td>
                    )}
                    <td className={`${pad} px-2`}>
                      {text ? (
                        <span className="clamp-2 max-h-10 overflow-hidden text-[14px] leading-5 text-fg" title={plainText(row.full ?? text)}>{plainText(text)}</span>
                      ) : (
                        <span className="text-[14px] text-fg-2">No signal yet</span>
                      )}
                    </td>
                    {showDate && <td className={`${pad} num px-2 text-right text-[14px] text-fg`}>{date ?? <Empty />}</td>}
                    {showVerified && <td className={`${pad} px-2`}>{row.verified ? <span className="text-ok" title="Verified">✓</span> : <Empty />}</td>}
                  </tr>
                );
              });
              return [header, ...body];
            })}
          </tbody>
        </table>
        {hiddenRows > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-2 py-4 text-[14px] text-fg-2" data-founders-more="">
            <span>
              Showing <span className="num">{ordered.length.toLocaleString("en-US")}</span> of{" "}
              <span className="num">{totalListed.toLocaleString("en-US")}</span> projects
            </span>
            <button type="button" className={control} onClick={() => setRowLimit((n) => n + ROW_PAGE)}>
              Show {Math.min(ROW_PAGE, hiddenRows).toLocaleString("en-US")} more
            </button>
            <button type="button" className={control} onClick={() => setRowLimit(Number.MAX_SAFE_INTEGER)}>
              Show all {totalListed.toLocaleString("en-US")}
            </button>
          </div>
        )}
        {ordered.length === 0 && quietCount > 0 && !showQuiet && <p className="px-2 py-6 text-[14px] text-fg-2">Rows with no signal are hidden.</p>}
        {ordered.length === 0 && (quietCount === 0 || showQuiet) && <p className="px-2 py-6 text-[14px] text-fg-2">No projects match. Clear filters.</p>}
      </div>
      {open && (
        <aside className="fixed bottom-0 right-0 top-14 z-30 w-[min(480px,100%)] overflow-y-auto border-l border-line bg-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" data-project-sheet="">
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center text-[14px] text-fg-2" onClick={() => setOpenId(null)}>Close</button>
          <h2 className="mt-3 text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{plainText(open.name || open.people[0]?.name) || "n/a"}</h2>
          <p className="mt-1 text-[14px] text-fg-2">{plainText(open.campus) ?? "Campus not on record"}</p>
          {open.tier ? (
            <p className="mt-4">
              <span className={tierClass(open.tier)} data-tier={open.tier}>{open.tier}</span>
              {open.tierBasis ? <span className="mt-2 block text-[14px] leading-5 text-fg" data-tier-reason="">{plainText(open.tierBasis)}</span> : null}
            </p>
          ) : null}
          {open.event ? <p className="mt-4 text-[14px] text-fg-2">{plainText(open.event)}</p> : null}
          <p className="mt-4 text-[15px] leading-6">{plainText(open.full) ?? "No signal text is stored for this project."}</p>
          <ul className="mt-4 space-y-2">
            {open.people.map((person) => (
              <li key={person.id} className="flex items-center gap-2 text-[14px]">
                <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-bg text-[11px] font-medium">{initials(person.name)}</span>
                <span>{plainText(person.name)}</span>
                <span className="num ml-auto text-[14px] text-fg-2">{person.signalAt ? relativeTime(person.signalAt) : <Empty />}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-4 text-[14px]">
            {open.campusSlug && <Link href={`/campuses/${open.campusSlug}`} className="text-link">Open campus</Link>}
          </div>
        </aside>
      )}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex min-h-12 items-center gap-4 border-t border-line bg-raised px-6 pb-[env(safe-area-inset-bottom)] text-[14px]">
          <span className="num">{selected.length} selected</span>
          <button type="button" className="rounded border border-line bg-bg px-3 py-1" onClick={() => {
            for (const id of selected) {
              const row = rows.find((item) => item.id === id);
              if (row) shortlistPeople(row);
            }
          }}>Add to shortlist</button>
          <button type="button" className="text-fg-2" onClick={() => {
            for (const id of selected) {
              const row = rows.find((item) => item.id === id);
              if (!row) continue;
              const person = row.people[0];
              if (!person) continue;
              pipeline.star({ entityType: "person", entityId: person.id, name: person.name, campusName: row.campus, websiteUrl: null, stage: "Sourced" });
            }
          }}>Move to pipeline</button>
          <button type="button" className="text-fg-2" onClick={exportCsv}>Export CSV</button>
        </div>
      )}
    </div>
  );
}
