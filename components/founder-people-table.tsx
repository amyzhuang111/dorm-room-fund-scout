"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { filterFounderPeople } from "@/lib/domain/founder-people";
import type { FounderTableRow } from "@/lib/domain/founder-table";
import { absoluteDate } from "@/lib/domain/relative-time";

const PAGE = 24;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <div data-founder-field={label}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">{label}</dt>
      <dd className="break-words text-[14px] leading-5 text-[color:var(--fg,#0B0E17)]">{text}</dd>
    </div>
  );
}

export function FounderPeopleTable({
  rows,
  campusLocked = false,
}: {
  rows: FounderTableRow[];
  campusLocked?: boolean;
}) {
  const [text, setText] = useState("");
  const [campus, setCampus] = useState("");
  const [shown, setShown] = useState(PAGE);
  const campuses = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of rows) {
      if (row.campusId && row.campus) names.set(row.campusId, row.campus);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const matches = useMemo(
    () => filterFounderPeople(rows, { text, campus: campusLocked ? null : campus }),
    [rows, text, campus, campusLocked],
  );
  const page = matches.slice(0, shown);

  return (
    <div data-founder-people="">
      <form className="mb-3 flex flex-wrap items-end gap-2" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="block min-w-0 flex-1">
          <span className="mb-0.5 block font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">Search founders</span>
          <input
            type="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setShown(PAGE);
            }}
            placeholder="Name, campus, or company"
            className="h-11 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[16px] text-[color:var(--fg,#0B0E17)]"
          />
        </label>
        {campusLocked ? null : (
          <label className="block min-w-[10rem]">
            <span className="mb-0.5 block font-mono text-[11px] text-[color:var(--fg-2,#3F465C)]">Campus</span>
            <select
              value={campus}
              onChange={(event) => {
                setCampus(event.target.value);
                setShown(PAGE);
              }}
              className="h-11 w-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[16px]"
            >
              <option value="">All campuses</option>
              {campuses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>
      <p className="mb-2 text-[14px] text-[color:var(--fg-2,#3F465C)]">
        <span className="font-bold tabular-nums text-[color:var(--fg,#0B0E17)]">{matches.length.toLocaleString("en-US")}</span>
        {" named founders"}
      </p>
      {page.length === 0 ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">No named founders match this view.</p>
      ) : (
        <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)]">
          {page.map((person) => (
            <li key={person.id} className="py-3" data-founder-person="">
              <h2 className="break-words text-[18px] font-semibold leading-6 text-[color:var(--fg,#0B0E17)]" data-founder-name="">
                {person.name}
              </h2>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Campus" value={person.campus ?? "Not on file"} />
                <div data-founder-field="Company">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Company</dt>
                  <dd className="break-words text-[14px] leading-5 text-[color:var(--fg,#0B0E17)]">
                    {person.company ? (
                      person.companyId ? (
                        <Link href={`/startup/${person.companyId}`} className="text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline">
                          {person.company}
                        </Link>
                      ) : (
                        person.company
                      )
                    ) : (
                      <span className="text-[color:var(--fg-3,#5C647A)]">Not on file</span>
                    )}
                  </dd>
                </div>
                <Field label="Year" value={person.year != null ? String(person.year) : null} />
                <Field label="Signal" value={person.signalType} />
                <Field label="Signal date" value={person.signalAt ? absoluteDate(person.signalAt) : null} />
                {person.tier ? <Field label="Tier" value={person.tier} /> : null}
                {person.verified ? <Field label="Verified" value="Confirmed" /> : null}
              </dl>
              {person.signal?.trim() ? (
                <p className="mt-2 break-words text-[14px] leading-5 text-[color:var(--fg-2,#3F465C)]" data-founder-evidence="">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">Evidence </span>
                  {person.signal.trim()}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {shown < matches.length ? (
        <button
          type="button"
          className="mt-3 inline-flex h-11 items-center border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 text-[14px] font-semibold text-white"
          onClick={() => setShown((count) => count + PAGE)}
        >
          Show more
        </button>
      ) : null}
    </div>
  );
}
