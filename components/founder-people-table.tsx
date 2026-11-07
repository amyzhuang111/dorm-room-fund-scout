"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { affiliationIsEvent, claimDateNote, companyIdentityNote, filterFounderPeople, founderYearFacts, presentEnrollment } from "@/lib/domain/founder-people";
import type { FounderTableRow } from "@/lib/domain/founder-table";

const PAGE = 40;

function statusLabel(status: string | null): string {
  if (!status) return "Unknown";
  if (status === "unverified") return "Unverified";
  if (status === "confirmed") return "Confirmed";
  if (status === "corroborated") return "Corroborated";
  return status.replace(/_/g, " ");
}

function Affiliations({ person }: { person: FounderTableRow }) {
  if (!person.affiliations.length) {
    return <span>{person.campus || "Not on file"}</span>;
  }
  return (
    <ul className="space-y-1">
      {person.affiliations.map((item, index) => (
        <li key={`${item.campusId ?? "campus"}-${index}`}>
          <span className="font-medium">{item.campus || "Campus not on file"}</span>
          {/current student|current_student/i.test(`${item.role ?? ""} ${item.status ?? ""}`) ? (
            <span className="text-ink-soft"> · source says current student</span>
          ) : (
            <>
              {item.role ? <span className="text-ink-soft"> · {item.role.replace(/_/g, " ")}</span> : null}
              <span className="text-ink-soft"> · {statusLabel(item.status)}{affiliationIsEvent(item) ? " · not enrollment" : ""}</span>
            </>
          )}
          {item.excerpt || item.sourceUrl ? (
            <details>
              <summary className="cursor-pointer text-blue">Claim</summary>
              {item.excerpt ? <span className="block text-ink-soft">{item.excerpt}</span> : null}
              {claimDateNote(item.excerpt, item.sourceUrl) ? <span className="block text-ink-soft">{claimDateNote(item.excerpt, item.sourceUrl)}</span> : null}
              {item.retrievedAt ? <span className="block text-ink-soft">Claim retrieved {item.retrievedAt.slice(0, 10)}</span> : null}
              {item.sourceUrl ? (
                <a className="break-all text-blue underline" href={item.sourceUrl}>
                  {item.sourceUrl}
                </a>
              ) : null}
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function YearFact({ person }: { person: FounderTableRow }) {
  const year = founderYearFacts(person);
  const present = presentEnrollment(person);
  const short = [year.value, person.leftSchool ? "left school on record" : null].filter(Boolean).join(" · ");
  const hasSource = Boolean(person.enrollmentEvidence || person.enrollmentSourceUrl || person.enrollmentStatus || present.summary);
  if (!short && !hasSource) return <span>Not on file</span>;
  return (
    <span>
      {short || "No class year on record"}
      <span className="block">{present.state === "unknown" ? "Present enrollment: Unknown" : present.summary}</span>
      {hasSource ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-blue">Year source</summary>
          <span className="block text-ink-soft">{present.summary}</span>
          {person.enrollmentStatus ? <span className="block text-ink-soft">Stored enrollment status: {person.enrollmentStatus}{person.enrollmentBasis ? ` · basis ${person.enrollmentBasis}` : ""}</span> : null}
          {person.enrollmentEvidence ? <span className="block text-ink-soft">{person.enrollmentEvidence}</span> : null}
          {person.enrollmentSourceUrl ? (
            <a className="break-all text-blue underline" href={person.enrollmentSourceUrl}>
              {person.enrollmentSourceUrl}
            </a>
          ) : null}
        </details>
      ) : null}
    </span>
  );
}

export function FounderPeopleTable({
  rows,
  initialQuery = "",
  campusLocked = false,
}: {
  rows: FounderTableRow[];
  initialQuery?: string;
  campusLocked?: boolean;
}) {
  const [q, setQ] = useState(initialQuery);
  const [campus, setCampus] = useState("");
  const [shown, setShown] = useState(PAGE);
  const campuses = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of rows) {
      if (row.campusId && row.campus) names.set(row.campusId, row.campus);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const filtered = useMemo(() => filterFounderPeople(rows, { text: q, campus: campusLocked ? "" : campus }), [rows, q, campus, campusLocked]);
  const visible = filtered.slice(0, shown);

  return (
    <div>
      <form className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end" action="/founders" method="get">
        <label className="block min-w-0 sm:min-w-[220px] sm:flex-1">
          <span className="text-[13px] font-semibold text-ink">Search</span>
          <input
            name="q"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setShown(PAGE);
            }}
            placeholder="Name or campus"
            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm"
          />
        </label>
        {campusLocked ? null : (
          <label className="block sm:w-52">
            <span className="text-[13px] font-semibold text-ink">Campus</span>
            <select
              name="campus"
              value={campus}
              onChange={(event) => {
                setCampus(event.target.value);
                setShown(PAGE);
              }}
              className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-2 text-sm"
            >
              <option value="">All campuses</option>
              {campuses.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>

      <div className="space-y-2 sm:hidden">
        {visible.map((person) => {
          const year = founderYearFacts(person);
          return (
            <article key={person.id} data-founder-person className="rounded-lg border border-line bg-paper px-3 py-2">
              <h2 data-founder-name className="text-[15px] font-semibold leading-5">
                <Link href={`/founders/${person.id}`}>{person.name}</Link>
              </h2>
              <dl className="mt-1 grid grid-cols-1 gap-1 text-[13px] leading-5">
                <div data-founder-field>
                  <dt className="inline font-medium text-ink-soft">Campus </dt>
                  <dd className="inline"><Affiliations person={person} /></dd>
                </div>
                <div data-founder-field>
                  <dt className="inline font-medium text-ink-soft">Company </dt>
                  <dd className="inline">
                    {person.companyId && person.company ? <Link href={`/startup/${person.companyId}`}>{person.company}</Link> : "Not on file"}
                    {companyIdentityNote(person) ? <span className="block text-ink-soft">{companyIdentityNote(person)}</span> : null}
                  </dd>
                </div>
                <div data-founder-field>
                  <dt className="inline font-medium text-ink-soft">{year.label} </dt>
                  <dd className="inline"><YearFact person={person} /></dd>
                </div>
                {person.tier && person.tierBasis ? (
                  <div data-founder-field>
                    <dt className="inline font-medium text-ink-soft">Signal tier </dt>
                    <dd className="inline">
                      {person.tier}
                      <details>
                        <summary className="cursor-pointer text-blue">Why</summary>
                        <span className="text-ink-soft">{person.tierBasis}</span>
                      </details>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table data-founder-table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Campus</th>
              <th className="py-2 pr-3 font-semibold">Company</th>
              <th className="py-2 pr-3 font-semibold">Class year</th>
              <th className="py-2 font-semibold">Signal tier</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => (
              <tr key={person.id} data-founder-person className="border-b border-line align-top">
                <td className="py-2 pr-3">
                  <Link data-founder-name className="font-semibold" href={`/founders/${person.id}`}>
                    {person.name}
                  </Link>
                </td>
                <td data-founder-field className="py-2 pr-3">
                  <Affiliations person={person} />
                </td>
                <td data-founder-field className="py-2 pr-3">
                  {person.companyId && person.company ? <Link href={`/startup/${person.companyId}`}>{person.company}</Link> : "Not on file"}
                  {companyIdentityNote(person) ? <span className="block text-ink-soft">{companyIdentityNote(person)}</span> : null}
                </td>
                <td data-founder-field className="max-w-[280px] py-2 pr-3">
                  <YearFact person={person} />
                </td>
                <td data-founder-field className="max-w-[220px] py-2">
                  {person.tier && person.tierBasis ? (
                    <span>
                      {person.tier}
                      <details>
                        <summary className="cursor-pointer text-blue">Why</summary>
                        <span className="text-ink-soft">{person.tierBasis}</span>
                      </details>
                    </span>
                  ) : (
                    "Not on file"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown < filtered.length ? (
        <button type="button" className="mt-3 h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => setShown((count) => count + PAGE)}>
          Show more
        </button>
      ) : null}
    </div>
  );
}
