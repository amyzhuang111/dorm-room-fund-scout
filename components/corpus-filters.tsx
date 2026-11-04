"use client";

import { useState } from "react";

type Opt = { id: string; label?: string; name?: string };

export function CorpusFilters({
  q,
  sector,
  campus,
  sort,
  scope,
  kind,
  sectors,
  campuses,
}: {
  q: string;
  sector: string;
  campus: string;
  sort: string;
  scope: string;
  kind: string;
  sectors: Opt[];
  campuses: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const active =
    (scope ? 1 : 0) + (kind ? 1 : 0) + (sector ? 1 : 0) + (campus ? 1 : 0) + (sort && sort !== "rank" ? 1 : 0);
  const field =
    "h-11 min-h-11 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[16px] sm:h-8 sm:text-[14px]";
  const control =
    "inline-flex h-11 min-h-11 items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[14px] text-[color:var(--fg,#0B0E17)] sm:h-8 sm:min-h-0 sm:text-[11px]";

  return (
    <form
      method="get"
      action="/data"
      className="mt-1.5 border-b border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] pb-2 sm:mt-2"
      data-corpus-filters=""
    >
      <div className="flex items-center gap-2 sm:flex-wrap sm:items-end sm:gap-1.5">
        <label className="block min-w-0 flex-1 sm:flex-[1_1_10rem]">
          <span className="sr-only">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or founder"
            className="h-11 min-h-11 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 font-mono text-[16px] text-[color:var(--fg,#0B0E17)] sm:h-8 sm:text-[14px]"
          />
        </label>
        <button
          type="button"
          className={`${control} relative shrink-0 sm:hidden ${open || active ? "border-[color:var(--cobalt,#2F4FD8)]" : ""}`}
          aria-expanded={open}
          data-corpus-filters-toggle=""
          onClick={() => setOpen((v) => !v)}
        >
          Filters
          {active > 0 ? (
            <span className="ml-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--cobalt,#2F4FD8)] px-1 text-[11px] font-semibold text-white">
              {active}
            </span>
          ) : null}
        </button>
        <div className={`w-full space-y-2 sm:contents ${open ? "block" : "hidden sm:contents"}`} data-corpus-filters-sheet="">
          <label className="block min-w-0 sm:flex-none"><span className="sr-only">Record type</span><select name="kind" defaultValue={kind} className={field}><option value="">All companies & projects</option><option value="company">Companies</option><option value="project">Other projects</option></select></label>
          <label className="block min-w-0 sm:flex-none"><span className="sr-only">Scouting status</span><select name="scope" defaultValue={scope} className={field}><option value="">All statuses</option><option value="scout">Scouting list</option><option value="review">Needs review</option><option value="excluded">Excluded from scouting list</option></select></label>
          <label className="block min-w-0 sm:min-w-[7.5rem] sm:flex-none">
            <span className="sr-only">Sector</span>
            <select name="sector" defaultValue={sector || ""} className={field}>
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label ?? s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 sm:min-w-[7.5rem] sm:flex-none">
            <span className="sr-only">Campus</span>
            <select name="campus" defaultValue={campus || ""} className={field}>
              <option value="">All campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 sm:min-w-[6.5rem] sm:flex-none">
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={sort || "rank"} className={field}>
              <option value="rank">Rank</option>
              <option value="recent">Newest signal</option>
              <option value="name">Name</option>
              <option value="stage">Stage</option>
              <option value="signals">Signal count</option>
              <option value="founded">Founded year</option>
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[14px] font-semibold text-white sm:h-8 sm:w-auto sm:px-3 sm:text-[11px]"
          >
            Apply
          </button>
        </div>
      </div>
    </form>
  );
}

