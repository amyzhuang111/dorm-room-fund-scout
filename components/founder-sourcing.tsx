"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  filterFounders,
  founderMatches,
  signalTypeLabel,
  assignWhyWorthALook,
  type FounderLead,
} from "@/lib/domain/founder-index";

const PAGE = 24;
/** Exact mobile (375) height: heading + collapsed filters + PAGE cards. */
const FOUNDER_MOBILE_PAGE_MIN_PX = 3757;

function missing(value: string | null | undefined, label: string): string {
  const text = value?.trim();
  return text ? text : `${label} missing`;
}

export function FounderSearchBar({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (value: string) => void;
}) {
  return (
    <form
      className="mb-2.5 lg:mb-4"
      role="search"
      onSubmit={(event) => event.preventDefault()}
      data-founder-search=""
    >
      <label htmlFor="founder-search" className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
        Search founders
      </label>
      <input
        id="founder-search"
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Name, campus, program, or company"
        className="mt-1 h-11 w-full rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[16px] text-[color:var(--fg,#0B0E17)] outline-none placeholder:text-[color:var(--fg-3,#5C647A)] focus:border-[color:var(--ember,#D96B1C)]"
      />
    </form>
  );
}

export function FounderResults({
  founders,
  status,
  query,
  campusId,
  campusName,
  onClearCampus,
  onMissingCampus,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
  campusName: string | null;
  onClearCampus: () => void;
  onMissingCampus: () => void;
}) {
  const [program, setProgram] = useState("");
  const [sector, setSector] = useState("");
  const [year, setYear] = useState("");
  const [signalType, setSignalType] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterKey = `${query}\n${campusId ?? ""}\n${program}\n${sector}\n${year}\n${signalType}`;
  const [windowState, setWindowState] = useState({ key: filterKey, shown: PAGE });
  const shown = windowState.key === filterKey ? windowState.shown : PAGE;

  const pool = useMemo(
    () => founders.filter((founder) => founderMatches(founder, { text: query, campusId: campusId || null })),
    [founders, query, campusId],
  );
  const missingCampusCount = useMemo(() => founders.filter((founder) => !founder.campusId).length, [founders]);

  const options = useMemo(() => {
    const programs = new Map<string, number>();
    const sectors = new Map<string, number>();
    const years = new Map<number, number>();
    const signals = new Map<string, number>();
    for (const founder of pool) {
      for (const name of founder.programs) programs.set(name, (programs.get(name) ?? 0) + 1);
      if (founder.sector) sectors.set(founder.sector, (sectors.get(founder.sector) ?? 0) + 1);
      if (founder.gradYear != null) years.set(founder.gradYear, (years.get(founder.gradYear) ?? 0) + 1);
      for (const type of founder.signalTypes) signals.set(type, (signals.get(type) ?? 0) + 1);
    }
    const byCount = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      programs: byCount(programs),
      sectors: byCount(sectors),
      years: [...years.entries()].sort((a, b) => b[0] - a[0]),
      signals: byCount(signals),
    };
  }, [pool]);

  const matches = useMemo(
    () =>
      filterFounders(founders, {
        text: query,
        campusId: campusId || null,
        program: program || null,
        sector: sector || null,
        gradYear: year === "missing" ? "missing" : year ? Number(year) : null,
        signalType: signalType || null,
      }),
    [founders, query, campusId, program, sector, year, signalType],
  );
  const page = matches.slice(0, shown);
  const unfiltered = !query.trim() && !campusId && !program && !sector && !year && !signalType;
  // Mobile CLS: hold exact first-page height from first paint so the globe does not jump when cards hydrate.
  const reserveMobileFirstPage = status !== "ready" || (unfiltered && page.length >= PAGE);

  return (
    <section
      className={`mt-0 lg:min-h-0 ${reserveMobileFirstPage ? "max-lg:min-h-[3757px]" : ""}`}
      data-founder-results=""
      data-founder-mobile-min={reserveMobileFirstPage ? String(FOUNDER_MOBILE_PAGE_MIN_PX) : undefined}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] lg:text-[18px]">Founders</h2>
          <p className="mt-1 text-[14px] text-[color:var(--fg-2,#3F465C)]">
            {status === "ready" ? (
              <>
                <span className="font-bold tabular-nums text-[color:var(--ember,#D96B1C)]" data-count={unfiltered ? "founders-indexed" : undefined}>
                  {matches.length.toLocaleString("en-US")}
                </span>
                {campusId === "missing"
                  ? " with no campus on record"
                  : campusName
                    ? ` at ${campusName}`
                    : campusId
                      ? " for this campus"
                      : unfiltered
                        ? " in the founder index"
                        : " founders"}
                {campusId ? (
                  <>
                    {" · "}
                    <button type="button" onClick={onClearCampus} className="font-medium text-[color:var(--ember,#D96B1C)] hover:underline">
                      Clear campus
                    </button>
                  </>
                ) : missingCampusCount > 0 ? (
                  <>
                    {" · "}
                    <button type="button" onClick={onMissingCampus} className="font-medium text-[color:var(--ember,#D96B1C)] hover:underline">
                      {missingCampusCount.toLocaleString("en-US")} with no campus
                    </button>
                  </>
                ) : null}
              </>
            ) : status === "error" ? (
              "Founder list could not be loaded."
            ) : (
              "Loading founders"
            )}
          </p>
        </div>
      </div>
      <div className="mb-3" data-founder-filters="">
        <button
          type="button"
          className="mb-2 inline-flex h-8 items-center gap-1.5 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)] lg:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          data-founder-filters-toggle=""
        >
          {filtersOpen ? "Hide filters" : "Filters"}
          {(program || sector || year || signalType) ? (
            <span className="font-bold normal-case tracking-normal text-[color:var(--ember,#D96B1C)]">· on</span>
          ) : null}
        </button>
        <div className={`${filtersOpen ? "flex" : "hidden"} flex-wrap gap-2 lg:flex`}>
          <FilterSelect label="Program" value={program} onChange={setProgram}>
            <option value="">Any program</option>
            {options.programs.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count.toLocaleString("en-US")})
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Sector" value={sector} onChange={setSector}>
            <option value="">Any sector</option>
            <option value="missing">Sector missing</option>
            {options.sectors.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count.toLocaleString("en-US")})
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Graduation year" value={year} onChange={setYear}>
            <option value="">Any year</option>
            <option value="missing">Year missing</option>
            {options.years.map(([value, count]) => (
              <option key={value} value={String(value)}>
                {value} ({count.toLocaleString("en-US")})
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Signal type" value={signalType} onChange={setSignalType}>
            <option value="">Any signal</option>
            <option value="missing">Signal missing</option>
            {options.signals.map(([type, count]) => (
              <option key={type} value={type}>
                {signalTypeLabel(type)} ({count.toLocaleString("en-US")})
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>
      {status === "loading" ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">Founder list is still loading.</p>
      ) : status === "error" ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">Founder list could not be loaded.</p>
      ) : founders.length === 0 ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">No founders on record.</p>
      ) : page.length === 0 ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">No founders match. Missing fields stay missing, so try clearing a filter.</p>
      ) : (
        <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]" data-founder-card-list="">
          {(() => {
            const whyById = assignWhyWorthALook(page);
            return page.map((founder) => {
            const why = whyById.get(founder.id) ?? null;
            return (
              <li key={founder.id} data-founder-card="">
                <article className="px-3 py-3 sm:px-4 lg:py-2.5">
                  <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{founder.name}</h3>
                  <p className="mt-1 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
                    <Field label="Campus" value={founder.campus} />
                    {" · "}
                    {founder.company ? (
                      founder.companyId ? (
                        <Link href={`/startup/${founder.companyId}`} className="font-medium text-[color:var(--fg,#0B0E17)] hover:text-[color:var(--ember,#D96B1C)] hover:underline">
                          {founder.company}
                        </Link>
                      ) : (
                        <span className="font-medium text-[color:var(--fg,#0B0E17)]">{founder.company}</span>
                      )
                    ) : (
                      <span>Company missing</span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                    <Field label="Sector" value={founder.sector} />
                    {" · "}
                    <Field label="Year" value={founder.gradYear != null ? String(founder.gradYear) : null} />
                    {founder.role ? (
                      <>
                        {" · "}
                        <Field label="Role" value={founder.role} />
                      </>
                    ) : null}
                  </p>
                  {founder.programs.length > 0 ? (
                    <p className="mt-0.5 font-mono text-[11px] text-[color:var(--fg-3,#5C647A)]">
                      {founder.programs.slice(0, 2).join(" · ")}
                    </p>
                  ) : null}
                  {why ? (
                    <p className="mt-2 border-l-2 border-[color:var(--ember,#D96B1C)]/50 pl-2.5 text-[13px] leading-5 text-[color:var(--fg,#0B0E17)] lg:mt-1.5 lg:pl-2 lg:text-[12px] lg:leading-4" data-why-worth="">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ember,#D96B1C)]">Why worth a look</span>
                      <span className="mt-0.5 block">{why}</span>
                    </p>
                  ) : (
                    <p className="sr-only" data-why-worth="" data-why-blank="1">
                      Why worth a look blank
                    </p>
                  )}
                </article>
              </li>
            );
          });
          })()}
        </ol>
      )}
      {shown < matches.length ? (
        <button
          type="button"
          onClick={() => setWindowState({ key: filterKey, shown: shown + PAGE })}
          className="mt-3 inline-flex h-8 items-center rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 font-mono text-[11px] font-semibold text-white"
        >
          Show more
        </button>
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return <span>{missing(value, label)}</span>;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="text-[12px] text-[color:var(--fg-2,#3F465C)]">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 max-w-[220px] rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2 text-[13px] text-[color:var(--fg,#0B0E17)]"
      >
        {children}
      </select>
    </label>
  );
}
