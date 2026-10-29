"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  countBy,
  FLAG_LABEL,
  filterFacetCompanies,
  foundedYearBuckets,
  hasFlag,
  hqRegionBuckets,
  NOT_ON_RECORD,
  preferLogoCompanies,
  RECENCY_LABEL,
  recencyOf,
  STATUS_LABEL,
  statusOf,
  type FacetCompany,
  type FacetCount,
  type FlagId,
  type RecencyId,
  type StatusId,
} from "@/lib/domain/sample-facets";

export { preferLogoCompanies };

export const INK = "text-[#20140c]";
export const MUTED = "text-[#6b5443]";
export const COUNT = "font-bold tabular-nums text-[#E05612]";
export const PANEL = "rounded-xl border border-[#f0d9c6] bg-white/94 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]";

export function LogoMark({
  name,
  logoUrl,
  mark,
  size = 20,
}: {
  name: string;
  logoUrl?: string | null;
  mark?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (mark || name).trim().charAt(0).toUpperCase() || "?";
  const cls = size <= 16 ? "h-4 w-4 text-[8px]" : size <= 20 ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  if (!logoUrl || failed) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-full bg-[#FFF1E6] font-semibold text-[#E05612] ${cls}`} aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    <Image src={logoUrl} alt="" width={size} height={size} unoptimized className={`${cls.split(" ").slice(0, 2).join(" ")} shrink-0 rounded-full border border-[#f0d9c6] bg-white object-contain`} onError={() => setFailed(true)} />
  );
}

export function LogoPill({
  href,
  name,
  logoUrl,
  mark,
}: {
  href: string;
  name: string;
  logoUrl?: string | null;
  mark?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showLetter = Boolean(mark) && (!logoUrl || failed);
  const letter = (mark || name).trim().charAt(0).toUpperCase() || "?";
  return (
    <Link
      href={href}
      className="flex h-4 min-w-0 max-w-[6.5rem] items-center gap-0.5 rounded-full border border-[#f0d9c6] bg-white px-1 text-[8px] leading-none text-[#20140c] hover:border-[#E05612]"
      title={name}
    >
      {logoUrl && !failed ? (
        <Image src={logoUrl} alt="" width={12} height={12} unoptimized className="h-3 w-3 shrink-0 rounded-full border border-[#f0d9c6] bg-white object-contain" onError={() => setFailed(true)} />
      ) : showLetter ? (
        <span className="grid h-3 w-3 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-[6px] font-semibold text-[#E05612]" aria-hidden>
          {letter}
        </span>
      ) : (
        <span className="h-3 w-3 shrink-0 rounded-full border border-[#f0d9c6] bg-[#FFF1E6]" aria-hidden />
      )}
      <span className="min-w-0 truncate">{name}</span>
    </Link>
  );
}

function FacetGroup({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="border-b border-[#f0d9c6] px-2 py-1.5" open={defaultOpen}>
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.06em] text-[#8a7260]">{title}</summary>
      <div className="mt-1.5 flex flex-wrap gap-1">{children}</div>
    </details>
  );
}

function Chip({ active, label, onClick, dot, icon }: { active: boolean; label: string; onClick: () => void; dot?: string; icon?: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] ${active ? "border-[#FB651E] bg-[#FB651E] text-white" : "border-[#f0d9c6] bg-white text-[#20140c]"}`}>
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: active ? "#fff" : dot }} aria-hidden /> : null}
      {icon && !dot ? <span className="text-[9px] leading-none" aria-hidden>{icon}</span> : null}
      {label}
    </button>
  );
}

const STATUS_DOT: Record<StatusId, string> = {
  active: "#22c55e",
  acquired: "#a855f7",
  closed: "#ef4444",
};

const FLAG_ICON: Record<FlagId, string> = {
  new: "✦",
  signaled: "◎",
  funded: "$",
  founders: "👤",
};

const SECTOR_DOTS = ["#3b82f6", "#a855f7", "#ef4444", "#f59e0b", "#10b981", "#ec4899", "#6366f1", "#14b8a6"];
function sectorDot(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % SECTOR_DOTS.length;
  return SECTOR_DOTS[h]!;
}

export interface FacetState {
  query: string;
  sector: string | null;
  kind: string | null;
  stage: string | null;
  campus: string | null;
  country: string | null;
  recency: RecencyId | null;
  foundedYear: number | null;
  yearMissing: boolean;
  status: StatusId | null;
  flag: FlagId | null;
  hqRegion: string | null;
}

export function emptyFacets(): FacetState {
  return {
    query: "",
    sector: null,
    kind: null,
    stage: null,
    campus: null,
    country: null,
    recency: null,
    foundedYear: null,
    yearMissing: false,
    status: null,
    flag: null,
    hqRegion: null,
  };
}

export function FacetRail({
  companies,
  campuses,
  facets,
  onChange,
  onCampusFocus,
  footer,
  searchPlaceholder = "Search company or founder",
}: {
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  facets: FacetState;
  onChange: (next: FacetState) => void;
  onCampusFocus?: (id: string) => void;
  footer?: ReactNode;
  searchPlaceholder?: string;
}) {
  const countryScoped = useMemo(() => {
    if (!facets.country) return campuses;
    return campuses.filter((campus) => campus.country === facets.country);
  }, [campuses, facets.country]);

  const baseCompanies = useMemo(() => {
    if (!facets.country) return companies;
    const ids = new Set(countryScoped.map((campus) => campus.id));
    return companies.filter((company) => !company.schoolId || ids.has(company.schoolId));
  }, [companies, countryScoped, facets.country]);

  const sectors = useMemo(() => countBy(baseCompanies, (c) => c.sectorId, (id) => baseCompanies.find((c) => c.sectorId === id)?.sector ?? id).slice(0, 10), [baseCompanies]);
  const kinds = useMemo(() => countBy(baseCompanies, (c) => c.signalKind, (id) => baseCompanies.find((c) => c.signalKind === id)?.signalLabel ?? id), [baseCompanies]);
  const stages = useMemo(() => countBy(baseCompanies, (c) => c.stage, (id) => id), [baseCompanies]);
  const years = useMemo(() => foundedYearBuckets(baseCompanies), [baseCompanies]);
  const statuses = useMemo(() => {
    const counts = new Map<StatusId, number>();
    for (const company of baseCompanies) {
      const id = statusOf(company);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return (Object.keys(STATUS_LABEL) as StatusId[])
      .filter((id) => (counts.get(id) ?? 0) > 0)
      .map((id) => ({ id, label: STATUS_LABEL[id], count: counts.get(id) ?? 0 }));
  }, [baseCompanies]);
  const flags = useMemo(() => {
    return (Object.keys(FLAG_LABEL) as FlagId[])
      .map((id) => ({ id, label: FLAG_LABEL[id], count: baseCompanies.filter((c) => hasFlag(c, id)).length }))
      .filter((item) => item.count > 0);
  }, [baseCompanies]);
  const hqRegions = useMemo(() => hqRegionBuckets(baseCompanies), [baseCompanies]);
  const recency = useMemo(() => {
    const counts = new Map<RecencyId, number>();
    for (const company of baseCompanies) {
      const id = recencyOf(company.latestSignalAt);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return (Object.keys(RECENCY_LABEL) as RecencyId[])
      .filter((id) => (counts.get(id) ?? 0) > 0)
      .map((id) => ({ id, label: RECENCY_LABEL[id], count: counts.get(id) ?? 0 }));
  }, [baseCompanies]);
  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const campus of campuses) {
      const name = campus.country.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [campuses]);
  const campusRows = useMemo(() => {
    const q = facets.query.trim().toLowerCase();
    return [...countryScoped]
      .filter((campus) => !q || campus.name.toLowerCase().includes(q) || shortCampusLabel(campus.id, campus.name).toLowerCase().includes(q))
      .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
      .slice(0, 36);
  }, [countryScoped, facets.query]);

  function set(partial: Partial<FacetState>) {
    onChange({ ...facets, ...partial });
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${PANEL}`}>
      <div className="border-b border-[#f0d9c6] px-2.5 py-2">
        <p className="text-[12px] font-semibold tracking-tight">Filters</p>
        <label className="sr-only" htmlFor="sample-facet-q">
          {searchPlaceholder}
        </label>
        <input
          id="sample-facet-q"
          type="search"
          value={facets.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder={searchPlaceholder}
          className="mt-1.5 h-7 w-full rounded-md border border-[#f0d9c6] bg-[#FFF7F0] px-2 text-[11px] text-[#20140c] outline-none placeholder:text-[#8a7260]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FacetGroup title="Founded year">
          <Chip
            active={facets.foundedYear == null && !facets.yearMissing}
            onClick={() => set({ foundedYear: null, yearMissing: false })}
            label={`All · ${baseCompanies.length}`}
          />
          {years.map((item) => {
            const missing = item.id === NOT_ON_RECORD;
            const active = missing ? facets.yearMissing : facets.foundedYear === Number(item.id);
            return (
              <Chip
                key={item.id}
                active={active}
                onClick={() =>
                  set(
                    missing
                      ? { foundedYear: null, yearMissing: !facets.yearMissing }
                      : { foundedYear: active ? null : Number(item.id), yearMissing: false },
                  )
                }
                label={`${item.label} · ${item.count}`}
              />
            );
          })}
        </FacetGroup>
        <FacetGroup title="Status">
          <Chip active={!facets.status} onClick={() => set({ status: null })} label="All" />
          {statuses.map((item) => (
            <Chip key={item.id} active={facets.status === item.id} onClick={() => set({ status: facets.status === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} dot={STATUS_DOT[item.id]} />
          ))}
        </FacetGroup>
        <FacetGroup title="Flags">
          <Chip active={!facets.flag} onClick={() => set({ flag: null })} label="All" />
          {flags.map((item) => (
            <Chip key={item.id} active={facets.flag === item.id} onClick={() => set({ flag: facets.flag === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} icon={FLAG_ICON[item.id]} />
          ))}
        </FacetGroup>
        <FacetGroup title="Sector">
          <Chip active={!facets.sector} onClick={() => set({ sector: null })} label={`All · ${baseCompanies.length}`} />
          {sectors.map((item) => (
            <Chip key={item.id} active={facets.sector === item.id} onClick={() => set({ sector: facets.sector === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} dot={sectorDot(item.id)} />
          ))}
        </FacetGroup>
        <FacetGroup title="HQ region">
          <Chip active={!facets.hqRegion} onClick={() => set({ hqRegion: null })} label={`All · ${baseCompanies.length}`} />
          {hqRegions.map((item) => (
            <Chip
              key={item.id}
              active={facets.hqRegion === item.id}
              onClick={() => set({ hqRegion: facets.hqRegion === item.id ? null : item.id })}
              label={`${item.label} · ${item.count}`}
            />
          ))}
        </FacetGroup>
        <FacetGroup title="Country" defaultOpen={false}>
          <Chip active={!facets.country} onClick={() => set({ country: null })} label={`All · ${campuses.length}`} />
          {countries.map(([name, count]) => (
            <Chip key={name} active={facets.country === name} onClick={() => set({ country: facets.country === name ? null : name })} label={`${name} · ${count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Campus" defaultOpen={false}>
          {campusRows.map((campus) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => {
                set({ campus: facets.campus === campus.id ? null : campus.id });
                onCampusFocus?.(campus.id);
              }}
              className={`flex w-full items-baseline gap-1 rounded-md px-1 py-0.5 text-left text-[11px] hover:bg-[#FFF1E6] ${facets.campus === campus.id ? "bg-[#FFF1E6]" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate">{shortCampusLabel(campus.id, campus.name)}</span>
              <span className={`${COUNT} shrink-0 text-[10px]`}>{campus.founders.toLocaleString("en-US")}</span>
            </button>
          ))}
        </FacetGroup>
        <FacetGroup title="Signal kind" defaultOpen={false}>
          <Chip active={!facets.kind} onClick={() => set({ kind: null })} label="All" />
          {kinds.map((item) => (
            <Chip key={item.id} active={facets.kind === item.id} onClick={() => set({ kind: facets.kind === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Stage" defaultOpen={false}>
          <Chip active={!facets.stage} onClick={() => set({ stage: null })} label="All" />
          {stages.map((item) => (
            <Chip key={item.id} active={facets.stage === item.id} onClick={() => set({ stage: facets.stage === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Signal recency" defaultOpen={false}>
          <Chip active={!facets.recency} onClick={() => set({ recency: null })} label="All" />
          {recency.map((item) => (
            <Chip key={item.id} active={facets.recency === item.id} onClick={() => set({ recency: facets.recency === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
      </div>
      {footer ? <div className="border-t border-[#f0d9c6] px-2.5 py-1.5 text-[10px] leading-[14px] text-[#6b5443]">{footer}</div> : null}
    </div>
  );
}

export function applyFacets(companies: FacetCompany[], facets: FacetState, countryCampusIds?: Set<string>): FacetCompany[] {
  const scoped = countryCampusIds
    ? companies.filter((company) => !company.schoolId || countryCampusIds.has(company.schoolId))
    : companies;
  return filterFacetCompanies(scoped, {
    sector: facets.sector,
    kind: facets.kind,
    stage: facets.stage,
    campus: facets.campus,
    recency: facets.recency,
    foundedYear: facets.foundedYear,
    yearMissing: facets.yearMissing,
    status: facets.status,
    flag: facets.flag,
    hqRegion: facets.hqRegion,
    query: facets.query,
  });
}

export function sectorMix(companies: FacetCompany[]): FacetCount[] {
  return countBy(companies, (c) => c.sectorId, (id) => companies.find((c) => c.sectorId === id)?.sector ?? id).slice(0, 5);
}

export function recentSignals(companies: FacetCompany[]): FacetCompany[] {
  return [...companies]
    .filter((company) => company.latestSignalAt || company.signalLabel)
    .sort((a, b) => (b.latestSignalAt ?? "").localeCompare(a.latestSignalAt ?? "") || b.signals - a.signals || a.name.localeCompare(b.name))
    .slice(0, 6);
}

export function topFounders(companies: FacetCompany[]): { key: string; name: string; companyId: string; companyName: string; signals: number; logoUrl?: string | null }[] {
  const rows: { key: string; name: string; companyId: string; companyName: string; signals: number; logoUrl?: string | null }[] = [];
  for (const company of [...companies].sort((a, b) => b.signals - a.signals)) {
    for (const person of company.founders ?? []) {
      const name = person.trim();
      if (!name) continue;
      rows.push({ key: `${company.id}:${name}`, name, companyId: company.id, companyName: company.name, signals: company.signals, logoUrl: company.logoUrl });
      if (rows.length >= 6) return rows;
    }
  }
  return rows;
}

export function Board({ title, unit, children }: { title: string; unit?: string; children: ReactNode }) {
  return (
    <div className={`${PANEL} p-1.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold">{title}</p>
        {unit ? <p className="text-[9px] uppercase tracking-[0.04em] text-[#8a7260]">{unit}</p> : null}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function BarRow({
  rank,
  label,
  value,
  max,
  onClick,
  href,
}: {
  rank: number;
  label: string;
  value: number;
  max: number;
  onClick?: () => void;
  href?: string;
}) {
  const width = Math.max(8, Math.round((value / Math.max(1, max)) * 100));
  const inner = (
    <>
      <div className="flex items-baseline gap-1.5 text-[11px]">
        <span className={`${COUNT} w-3.5 shrink-0 text-[10px]`}>{rank}</span>
        <span className="min-w-0 flex-1 truncate text-[#20140c]">{label}</span>
        <span className={`${COUNT} shrink-0 text-[10px]`}>{value.toLocaleString("en-US")}</span>
      </div>
      <div className="ml-[18px] mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#FFF1E6]">
        <div className="h-full rounded-full bg-[#FB651E]" style={{ width: `${width}%` }} />
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block w-full text-left hover:text-[#FB651E]">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="w-full text-left hover:text-[#FB651E]">
      {inner}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").replace(/[^A-Za-z]/g, "");
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^A-Za-z]/g, "") : "";
  return ((first[0] ?? "") + (last[0] ?? first[1] ?? "")).toUpperCase() || "?";
}

export function SignalFeedRow({ company, index }: { company: FacetCompany; index: number }) {
  const date = (company.latestSignalAt ?? "").replace(/-00/g, "") || "Date not stored";
  return (
    <Link href={`/startup/${company.id}`} className="flex items-center gap-1.5 text-left text-[11px] hover:text-[#FB651E]">
      <span className={`${COUNT} w-3 shrink-0 text-[10px]`}>{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-[#20140c]">{company.name}</span>
      <span className="shrink-0 tabular-nums text-[9px] text-[#8a7260]">{date}</span>
      <span className="shrink-0 rounded-full border border-[#f0d9c6] bg-[#FFF7F0] px-1 py-px text-[8px] text-[#6b5443]">{company.signalLabel ?? "Signal"}</span>
    </Link>
  );
}

export function FounderFeedRow({
  person,
  index,
}: {
  person: { key: string; name: string; companyId: string; companyName: string; signals: number; logoUrl?: string | null };
  index: number;
}) {
  return (
    <Link href={`/startup/${person.companyId}`} className="flex items-center gap-1 text-left hover:text-[#FB651E]" title={person.companyName}>
      <span className={`${COUNT} w-3 shrink-0 text-[10px]`}>{index + 1}</span>
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-[7px] font-semibold text-[#E05612]" aria-hidden>
        {initials(person.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-[#20140c]">
        {person.name}
        <span className="text-[#8a7260]"> · {person.companyName}</span>
      </span>
      <span className={`${COUNT} shrink-0 text-[10px]`}>{person.signals.toLocaleString("en-US")}</span>
    </Link>
  );
}

export function topPrograms(companies: FacetCompany[]): FacetCount[] {
  return countBy(companies, (c) => c.primaryProgram, (id) => id).slice(0, 5);
}

/** Shared right-rail intelligence boards (no campus list). */
export function IntelligenceBoards({
  companies,
  compact = false,
}: {
  companies: FacetCompany[];
  limit?: number;
  compact?: boolean;
}) {
  const recentN = 3;
  const founderN = 3;
  const recent = useMemo(() => recentSignals(companies).slice(0, recentN), [companies, recentN]);
  const mix = useMemo(() => sectorMix(companies).slice(0, compact ? 4 : 5), [companies, compact]);
  const founders = useMemo(() => topFounders(companies).slice(0, founderN), [companies, founderN]);
  const programs = useMemo(() => topPrograms(companies), [companies]);
  const maxProg = programs[0]?.count || 1;
  const gap = "space-y-1.5";
  const rowGap = "space-y-1";
  return (
    <div className={gap}>
      <Board title="Recent signals" unit="time · kind">
        <ol className={rowGap}>
          {recent.map((company, index) => (
            <li key={company.id}>
              <SignalFeedRow company={company} index={index} />
            </li>
          ))}
        </ol>
      </Board>
      <Board title="Sector mix" unit="companies">
        <div className="flex h-2 overflow-hidden rounded-full bg-[#FFF1E6]">
          {mix.map((item) => (
            <div
              key={item.id}
              className="h-full"
              style={{
                width: `${Math.max(3, Math.round((item.count / Math.max(1, mix.reduce((s, m) => s + m.count, 0))) * 100))}%`,
                background: sectorDot(item.id),
              }}
              title={`${item.label}: ${item.count}`}
            />
          ))}
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {mix.map((item) => (
            <li key={item.id}>
              <Link href={`/?sample=1&sector=${encodeURIComponent(item.id)}#browse`} className="flex items-center gap-1.5 text-[10px] hover:text-[#FB651E]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sectorDot(item.id) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[#20140c]">{item.label}</span>
                <span className={`${COUNT} shrink-0`}>{item.count.toLocaleString("en-US")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Board>
      <Board title="Top founders" unit="signals">
        <ol className={rowGap}>
          {founders.map((person, index) => (
            <li key={person.key}>
              <FounderFeedRow person={person} index={index} />
            </li>
          ))}
        </ol>
      </Board>
      {programs.length > 0 ? (
        <Board title="Top programs" unit="companies">
          <ol className={rowGap}>
            {programs.slice(0, 3).map((item, index) => (
              <li key={item.id}>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={`${COUNT} w-3.5 shrink-0 text-[10px]`}>{index + 1}</span>
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#FFF1E6] text-[8px] font-semibold text-[#E05612]" aria-hidden>
                    {item.label.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[#20140c]">{item.label}</span>
                  <span className={`${COUNT} shrink-0 text-[10px]`}>{item.count.toLocaleString("en-US")}</span>
                </div>
                <div className="ml-[18px] mt-0.5 h-1 overflow-hidden rounded-full bg-[#FFF1E6]">
                  <div className="h-full rounded-full bg-[#FB651E]" style={{ width: `${Math.max(8, Math.round((item.count / maxProg) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Board>
      ) : null}
      {!compact ? (
        <div className={`${PANEL} p-1.5`}>
          <p className="text-[11px] font-semibold">Ask Campus Scout</p>
          <Link
            href="/ask"
            className="mt-1 flex h-7 items-center rounded-md border border-[#f0d9c6] bg-[#FFF7F0] px-2 text-[11px] text-[#8a7260] hover:border-[#E05612] hover:text-[#E05612]"
          >
            Tell me a theme. I will narrow the globe.
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ViewDrawer({
  mode,
  onMode,
  companies,
  founders,
  companyTotal,
  founderTotal,
}: {
  mode: "startups" | "founders";
  onMode: (mode: "startups" | "founders") => void;
  companies: FacetCompany[];
  founders: { key: string; name: string; companyId: string; companyName: string }[];
  companyTotal: number;
  founderTotal: number;
}) {
  const total = mode === "startups" ? companyTotal : founderTotal;
  if (companyTotal === 0 && founderTotal === 0) return null;
  return (
    <div className={`${PANEL} px-1.5 py-1`}>
      <div className="mb-1 flex flex-wrap items-center gap-1 px-0.5">
        <p className="text-[11px] font-semibold tracking-tight">Current view</p>
        <p className={`${COUNT} text-[11px]`}>{total.toLocaleString("en-US")}</p>
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-[#f0d9c6]">
          <button type="button" onClick={() => onMode("startups")} className={`h-5 px-2 text-[10px] font-medium ${mode === "startups" ? "bg-[#FB651E] text-white" : "bg-white text-[#6b5443]"}`}>
            Startups
          </button>
          <button type="button" onClick={() => onMode("founders")} className={`h-5 px-2 text-[10px] font-medium ${mode === "founders" ? "bg-[#FB651E] text-white" : "bg-white text-[#6b5443]"}`}>
            Founders
          </button>
        </div>
      </div>
      <div className="flex max-h-[7rem] flex-wrap content-start gap-0 overflow-y-auto">
        {mode === "startups"
          ? preferLogoCompanies(companies).map((company) => <LogoPill key={company.id} href={`/startup/${company.id}`} name={company.name} logoUrl={company.logoUrl} />)
          : founders.map((person) => <LogoPill key={person.key} href={`/startup/${person.companyId}`} name={person.name} mark={person.name} />)}
      </div>
    </div>
  );
}
