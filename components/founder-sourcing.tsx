"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CampusSeal } from "@/components/campus-seal";
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
      className="mb-2 lg:mb-4"
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
        className="mt-1 h-9 w-full rounded-sm border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-[16px] lg:h-11 text-[color:var(--fg,#0B0E17)] outline-none placeholder:text-[color:var(--fg-3,#5C647A)] focus:border-[color:var(--cobalt,#2F4FD8)]"
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
  foundersListed = 0,
  onClearCampus,
  onMissingCampus,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
  campusName: string | null;
  /** Founder-name slots on company cards  -  may be below the searchable index. */
  foundersListed?: number;
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
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 lg:mb-3 lg:gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] lg:text-[18px]">Founders</h2>
          <p className="mt-1 text-[14px] text-[color:var(--fg-2,#3F465C)]">
            {status === "ready" ? (
              <>
                <span className="font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]" data-count={unfiltered ? "founders-indexed" : undefined}>
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
                    <button type="button" onClick={onClearCampus} className="font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline">
                      Clear campus
                    </button>
                  </>
                ) : missingCampusCount > 0 ? (
                  <>
                    {" · "}
                    <button type="button" onClick={onMissingCampus} className="font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline">
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
            <span className="font-bold normal-case tracking-normal text-[color:var(--cobalt,#2F4FD8)]">· on</span>
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
        {(program || sector || year || signalType) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2" data-founder-filter-chips="">
            <span className="font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
              <span className="font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">{matches.length.toLocaleString("en-US")}</span>
              {" of "}
              <span className="font-semibold tabular-nums">{founders.length.toLocaleString("en-US")}</span>
            </span>
            {program ? (
              <button type="button" onClick={() => setProgram("")} className="inline-flex h-7 items-center gap-1 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium">
                {program} <span className="text-[color:var(--cobalt,#2F4FD8)]">×</span>
              </button>
            ) : null}
            {sector ? (
              <button type="button" onClick={() => setSector("")} className="inline-flex h-7 items-center gap-1 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium">
                {sector === "missing" ? "Sector missing" : sector} <span className="text-[color:var(--cobalt,#2F4FD8)]">×</span>
              </button>
            ) : null}
            {year ? (
              <button type="button" onClick={() => setYear("")} className="inline-flex h-7 items-center gap-1 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium">
                {year === "missing" ? "Year missing" : year} <span className="text-[color:var(--cobalt,#2F4FD8)]">×</span>
              </button>
            ) : null}
            {signalType ? (
              <button type="button" onClick={() => setSignalType("")} className="inline-flex h-7 items-center gap-1 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)]/60 px-2.5 text-[12px] font-medium">
                {signalType === "missing" ? "Signal missing" : signalTypeLabel(signalType)} <span className="text-[color:var(--cobalt,#2F4FD8)]">×</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {status === "loading" ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">Founder list is still loading.</p>
      ) : status === "error" ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">Founder list could not be loaded.</p>
      ) : founders.length === 0 ? (
        <p className="text-[14px] text-[color:var(--fg-2,#3F465C)]">No founders on record.</p>
      ) : page.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-4 py-6 text-[14px] text-[color:var(--fg-2,#3F465C)]" data-founder-empty="">
          <p className="font-semibold text-[color:var(--fg,#0B0E17)]">No founders match this view.</p>
          <p className="mt-1">Missing fields stay missing. Clear a chip, widen the search, or pick another campus on the map.</p>
          {campusId ? (
            <button type="button" onClick={onClearCampus} className="mt-3 font-medium text-[color:var(--cobalt,#2F4FD8)] hover:underline">
              Clear campus filter
            </button>
          ) : null}
        </div>
      ) : (
        <ol className="divide-y divide-[color:var(--line,#E1E5EF)] border-y border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]" data-founder-card-list="">
          {(() => {
            const whyById = assignWhyWorthALook(page);
            return page.map((founder) => {
            const why = whyById.get(founder.id) ?? null;
            return (
              <li key={founder.id} data-founder-card="" data-signal-chrome={founder.signalTypes.includes("funding") ? "funding" : founder.signalTypes.includes("launch") ? "launch" : founder.signalTypes.includes("award") ? "award" : founder.signalTypes.length ? "other" : "none"}>
                <article className="bg-[color:var(--bg,#FFFFFF)] px-3 py-3.5 sm:px-4 lg:py-2.5">
                  <div className="flex items-start gap-3">
                    <CampusSeal label={founder.campus} size="lg" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                  <h3 className="text-[18px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] lg:text-[16px]">{founder.name}</h3>
                  <p className="mt-1 text-[13px] leading-5 text-[color:var(--fg-2,#3F465C)]">
                    <Field label="Campus" value={founder.campus} />
                    {" · "}
                    {founder.company ? (
                      founder.companyId ? (
                        <Link href={`/startup/${founder.companyId}?from=map${campusId && campusId !== "missing" ? `&campus=${encodeURIComponent(campusId)}` : ""}`} className="font-medium text-[color:var(--fg,#0B0E17)] hover:text-[color:var(--cobalt,#2F4FD8)] hover:underline">
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
                    {founder.gradYear != null ? (
                      <>
                        {" · "}
                        <span className="font-semibold text-[color:var(--fg,#0B0E17)]">{founder.gradYear}</span>
                      </>
                    ) : null}
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
                    <p className="mt-2 border-l-2 border-[color:var(--cobalt,#2F4FD8)]/40 pl-2.5 text-[13px] leading-5 text-[color:var(--fg,#0B0E17)] lg:mt-1.5 lg:pl-2 lg:text-[12px] lg:leading-4" data-why-worth="">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Why worth a look</span>
                      <span className="mt-0.5 block">{why}</span>
                    </p>
                  ) : (
                    <p className="sr-only" data-why-worth="" data-why-blank="1">
                      Why worth a look blank
                    </p>
                  )}
                    </div>
                  </div>
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
          className="mt-3 inline-flex h-8 items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] px-3 font-mono text-[11px] font-semibold text-white"
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
    <label className="relative block min-w-[9.5rem] text-[12px] text-[color:var(--fg-2,#3F465C)]" data-founder-filter-select="">
      <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[linear-gradient(180deg,#FFFFFF_0%,#F4F6FC_100%)] py-1.5 pl-2.5 pr-8 text-[13px] font-medium text-[color:var(--fg,#0B0E17)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none focus:border-[color:var(--cobalt,#2F4FD8)]"
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1.25L5 4.75L9 1.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </label>
  );
}
