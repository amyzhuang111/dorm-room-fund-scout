"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  countBy,
  filterFacetCompanies,
  RECENCY_LABEL,
  recencyOf,
  type FacetCompany,
  type FacetCount,
  type RecencyId,
} from "@/lib/domain/sample-facets";

export const INK = "text-[#20140c]";
export const MUTED = "text-[#6b5443]";
export const COUNT = "font-bold tabular-nums text-[#E05612]";
export const PANEL = "rounded-xl border border-[#f0d9c6] bg-white/94 text-[#20140c] shadow-[0_10px_30px_rgba(90,44,14,0.08)]";

export function LogoMark({
  name,
  logoUrl,
  mark,
}: {
  name: string;
  logoUrl?: string | null;
  mark?: string;
}) {
  const [failed, setFailed] = useState(false);
  const letter = (mark || name).trim().charAt(0).toUpperCase() || "?";
  if (!logoUrl || failed) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-[9px] font-semibold text-[#E05612]" aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    <Image src={logoUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5 shrink-0 rounded-full border border-[#f0d9c6] bg-white object-contain" onError={() => setFailed(true)} />
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
  const letter = (mark || name).trim().charAt(0).toUpperCase() || "?";
  return (
    <Link href={href} className="flex h-5 min-w-0 items-center gap-0.5 rounded-full border border-[#f0d9c6] bg-white px-1 text-[9px] leading-none text-[#20140c] hover:border-[#E05612]" title={name}>
      {!logoUrl || failed ? (
        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#FFF1E6] text-[7px] font-semibold text-[#E05612]" aria-hidden>
          {letter}
        </span>
      ) : (
        <Image src={logoUrl} alt="" width={14} height={14} unoptimized className="h-3.5 w-3.5 shrink-0 rounded-full border border-[#f0d9c6] bg-white object-contain" onError={() => setFailed(true)} />
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

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] ${active ? "border-[#FB651E] bg-[#FB651E] text-white" : "border-[#f0d9c6] bg-white text-[#20140c]"}`}>
      {label}
    </button>
  );
}

export interface FacetState {
  query: string;
  sector: string | null;
  kind: string | null;
  stage: string | null;
  campus: string | null;
  country: string | null;
  recency: RecencyId | null;
}

export function emptyFacets(): FacetState {
  return { query: "", sector: null, kind: null, stage: null, campus: null, country: null, recency: null };
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
    const ids = new Set(countryScoped.map((campus) => campus.id));
    return companies.filter((company) => !company.schoolId || ids.has(company.schoolId));
  }, [companies, countryScoped]);

  const sectors = useMemo(() => countBy(baseCompanies, (c) => c.sectorId, (id) => baseCompanies.find((c) => c.sectorId === id)?.sector ?? id).slice(0, 10), [baseCompanies]);
  const kinds = useMemo(() => countBy(baseCompanies, (c) => c.signalKind, (id) => baseCompanies.find((c) => c.signalKind === id)?.signalLabel ?? id), [baseCompanies]);
  const stages = useMemo(() => countBy(baseCompanies, (c) => c.stage, (id) => id), [baseCompanies]);
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
        <FacetGroup title="Sector">
          <Chip active={!facets.sector} onClick={() => set({ sector: null })} label={`All · ${baseCompanies.length}`} />
          {sectors.map((item) => (
            <Chip key={item.id} active={facets.sector === item.id} onClick={() => set({ sector: facets.sector === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Country">
          <Chip active={!facets.country} onClick={() => set({ country: null })} label={`All · ${campuses.length}`} />
          {countries.map(([name, count]) => (
            <Chip key={name} active={facets.country === name} onClick={() => set({ country: facets.country === name ? null : name })} label={`${name} · ${count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Campus" defaultOpen>
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
    query: facets.query,
  });
}

export function sectorMix(companies: FacetCompany[]): FacetCount[] {
  return countBy(companies, (c) => c.sectorId, (id) => companies.find((c) => c.sectorId === id)?.sector ?? id).slice(0, 6);
}

export function recentSignals(companies: FacetCompany[]): FacetCompany[] {
  return [...companies]
    .filter((company) => company.latestSignalAt || company.signalLabel)
    .sort((a, b) => (b.latestSignalAt ?? "").localeCompare(a.latestSignalAt ?? "") || b.signals - a.signals || a.name.localeCompare(b.name))
    .slice(0, 6);
}

export function topFounders(companies: FacetCompany[]): { key: string; name: string; companyId: string; companyName: string; signals: number }[] {
  const rows: { key: string; name: string; companyId: string; companyName: string; signals: number }[] = [];
  for (const company of [...companies].sort((a, b) => b.signals - a.signals)) {
    for (const person of company.founders ?? []) {
      const name = person.trim();
      if (!name) continue;
      rows.push({ key: `${company.id}:${name}`, name, companyId: company.id, companyName: company.name, signals: company.signals });
      if (rows.length >= 6) return rows;
    }
  }
  return rows;
}

export function Board({ title, unit, children }: { title: string; unit?: string; children: ReactNode }) {
  return (
    <div className={`${PANEL} p-2`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold">{title}</p>
        {unit ? <p className="text-[10px] uppercase tracking-[0.04em] text-[#8a7260]">{unit}</p> : null}
      </div>
      <div className="mt-1.5">{children}</div>
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
      <div className="ml-[18px] mt-0.5 h-1 overflow-hidden rounded-full bg-[#FFF1E6]">
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
    <div className={`${PANEL} px-2 py-1.5`}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 px-0.5">
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
      <div className="grid max-h-[7.25rem] grid-cols-4 gap-0.5 overflow-y-auto sm:grid-cols-5 md:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-11">
        {mode === "startups"
          ? companies.map((company) => <LogoPill key={company.id} href={`/startup/${company.id}`} name={company.name} logoUrl={company.logoUrl} />)
          : founders.map((person) => <LogoPill key={person.key} href={`/startup/${person.companyId}`} name={person.name} mark={person.name} />)}
      </div>
    </div>
  );
}
