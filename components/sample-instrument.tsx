"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import {
  countBy,
  FLAG_LABEL,
  filterFacetCompanies,
  foundedYearBuckets,
  hasFlag,
  hqRegionPills,
  NOT_ON_RECORD,
  preferLogoCompanies,
  RECENCY_LABEL,
  recencyOf,
  sectorPills,
  STATUS_LABEL,
  statusOf,
  type FacetCompany,
  type FacetCount,
  type FlagId,
  type RecencyId,
  type StatusId,
} from "@/lib/domain/sample-facets";

export { preferLogoCompanies };

export const INK = "text-[color:var(--fg,#0B0E17)]";
export const MUTED = "text-[color:var(--fg-2,#3F465C)]";
export const COUNT = "font-bold tabular-nums text-[color:var(--ember,#D96B1C)]";
export const PANEL = "rounded-md border border-[color:var(--line,#E1E5EF)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg-raised,#FFFFFF)] text-[color:var(--fg,#0B0E17)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

/** Real initials from the company name — intentional monogram, not an orange-dot stub. */
export function companyInitials(name: string): string {
  const cleaned = name.replace(/["""'']/g, " ").replace(/[^a-zA-Z0-9&+\s.-]/g, " ").trim();
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean).filter((p) => !/^(inc|llc|ltd|co|corp|the|and|&)$/i.test(p));
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0]!;
    if (/^[A-Z0-9]{2,4}$/.test(w)) return w.slice(0, 3).toUpperCase();
    return w.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

function NeutralMark({ name, cls }: { name: string; cls: string }) {
  const initials = companyInitials(name).slice(0, 2);
  return (
    <span
      className={`${cls} grid shrink-0 place-items-center rounded-md border border-[color:var(--cobalt,#2F4FD8)]/70 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[8px] font-semibold tracking-tight text-[color:var(--cobalt,#2F4FD8)] shadow-[inset_0_0_0_1px_rgba(47,79,216,0.12)]`}
      aria-hidden
      title={name}
    >
      {initials}
    </span>
  );
}

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
  // Monogram-first: sample UI stays cobalt NeutralMarks. External favicons (e.g. AfterQuery
  // dark squares) break WIRE rhythm next to monograms.
  void logoUrl;
  void mark;
  const cls = size <= 16 ? "h-4 w-4" : size <= 20 ? "h-5 w-5" : size <= 24 ? "h-6 w-6" : size <= 28 ? "h-7 w-7" : "h-8 w-8";
  return <NeutralMark name={name} cls={cls} />;
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
  void mark;
  const needsProof = Boolean(logoUrl && /google\.com\/s2\/favicons/i.test(logoUrl));
  const [ok, setOk] = useState(!needsProof && Boolean(logoUrl));
  const initials = companyInitials(name).slice(0, 2);
  return (
    <Link
      href={href}
      className="relative flex h-6 min-w-0 max-w-[8rem] items-center gap-1 rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-1 text-[9px] leading-none text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--ember,#D96B1C)]"
      title={name}
    >
      {ok && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={14}
          height={14}
          className="h-4 w-4 shrink-0 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] object-contain"
          onError={() => setOk(false)}
        />
      ) : (
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/70 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[8px] font-semibold tracking-tight text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>
          {initials}
        </span>
      )}
      {logoUrl && needsProof && !ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={1}
          height={1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth > 16) setOk(true);
          }}
        />
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </Link>
  );
}

function FacetGroup({ title, children, defaultOpen = true, dense = false }: { title: string; children: ReactNode; defaultOpen?: boolean; dense?: boolean }) {
  return (
    <details className={`border-b border-[color:var(--line,#E1E5EF)] ${dense ? "px-2 py-1.5" : "px-2.5 py-2"}`} open={defaultOpen}>
      <summary className={`cursor-pointer font-mono text-[10px] font-medium uppercase ${dense ? "tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]" : "tracking-[0.06em] text-[color:var(--fg-3,#5C647A)]"}`}>{title}</summary>
      <div className={`flex flex-wrap ${dense ? "mt-1.5 gap-1" : "mt-1.5 gap-1"}`}>{children}</div>
    </details>
  );
}

function Chip({
  active,
  label,
  onClick,
  dot,
  icon,
  facet,
  count,
  emphasis,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  dot?: string;
  icon?: string;
  /** Facet group id for DOM sum checks (e.g. sector, hq, year). */
  facet?: string;
  count?: number;
  /** High-visibility chip for truncated "More" remainders. */
  emphasis?: boolean;
}) {
  const tone = active
    ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white"
    : emphasis
      ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)]/10 text-[color:var(--ember,#D96B1C)] shadow-[0_0_0_1px_rgba(217,107,28,0.2)] hover:bg-[color:var(--ember,#D96B1C)]/18"
      : "border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]";
  return (
    <button
      type="button"
      onClick={onClick}
      data-facet={facet || undefined}
      data-facet-count={count != null ? String(count) : undefined}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-tight ${tone}`}
    >
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: active ? "#FFFFFF" : dot }} aria-hidden /> : null}
      {icon && !dot ? <span className="text-[9px] leading-none text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>{icon}</span> : null}
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
  new: "◆",
  signaled: "●",
  funded: "$",
  founders: "◎",
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
  sectorMissing: boolean;
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
    sectorMissing: false,
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
  dense = false,
}: {
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
  facets: FacetState;
  onChange: (next: FacetState) => void;
  onCampusFocus?: (id: string) => void;
  footer?: ReactNode;
  searchPlaceholder?: string;
  /** Drop outer chrome when nested in a modal/details that already labels Scout filters. */
  dense?: boolean;
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

  const [hqExpanded, setHqExpanded] = useState(false);
  const [sectorExpanded, setSectorExpanded] = useState(false);
  const sectorPack = useMemo(() => sectorPills(baseCompanies, 10), [baseCompanies]);
  const sectorRows = sectorExpanded ? [...sectorPack.visible, ...sectorPack.more] : sectorPack.visible;
  const kinds = useMemo(() => countBy(baseCompanies, (c) => c.signalKind, (id) => baseCompanies.find((c) => c.signalKind === id)?.signalLabel ?? id), [baseCompanies]);
  const stages = useMemo(() => countBy(baseCompanies, (c) => c.stage, (id) => id), [baseCompanies]);
  const years = useMemo(() => foundedYearBuckets(baseCompanies), [baseCompanies]);
  const statuses = useMemo(() => {
    const counts = new Map<StatusId, number>();
    for (const company of baseCompanies) {
      const id = statusOf(company);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Always emit Active / Acquired / Closed with real counts (never omit a zero as a blank chip).
    return (Object.keys(STATUS_LABEL) as StatusId[]).map((id) => ({
      id,
      label: STATUS_LABEL[id],
      count: counts.get(id) ?? 0,
    }));
  }, [baseCompanies]);
  const flags = useMemo(() => {
    return (Object.keys(FLAG_LABEL) as FlagId[])
      .map((id) => ({ id, label: FLAG_LABEL[id], count: baseCompanies.filter((c) => hasFlag(c, id)).length }))
      .filter((item) => item.count > 0);
  }, [baseCompanies]);
  const hqPills = useMemo(() => hqRegionPills(baseCompanies, 8), [baseCompanies]);
  const hqRegions = hqExpanded ? [...hqPills.visible, ...hqPills.more] : hqPills.visible;
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
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${dense ? "" : PANEL}`} data-facet-rail="scout">
      <div className={`border-b border-[color:var(--line,#E1E5EF)] ${dense ? "px-1.5 py-1.5" : "px-2.5 py-2"}`}>
        {dense ? null : (
          <>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Scout filters</p>
            <p className="mt-0.5 text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Narrow the map</p>
          </>
        )}
        <label className="sr-only" htmlFor="sample-facet-q">
          {searchPlaceholder}
        </label>
        <input
          id="sample-facet-q"
          type="search"
          value={facets.query}
          onChange={(event) => set({ query: event.target.value })}
          placeholder={searchPlaceholder}
          className={`${dense ? "mt-0" : "mt-1.5"} h-7 w-full rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-2 text-[11px] text-[color:var(--fg,#0B0E17)] outline-none placeholder:text-[color:var(--fg-3,#5C647A)]`}
        />
      </div>
      {dense ? (
        <div className="shrink-0 border-b border-[color:var(--line,#E1E5EF)] px-2 py-1.5" data-facet-status-pin="">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Status</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Chip facet="status" count={baseCompanies.length} active={!facets.status} onClick={() => set({ status: null })} label={`All · ${baseCompanies.length}`} />
            {statuses.map((item) => (
              <Chip key={item.id} facet="status" count={item.count} active={facets.status === item.id} onClick={() => set({ status: facets.status === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} dot={STATUS_DOT[item.id]} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {dense ? null : (
          <FacetGroup title="Status" dense={dense}>
            <Chip facet="status" count={baseCompanies.length} active={!facets.status} onClick={() => set({ status: null })} label={`All · ${baseCompanies.length}`} />
            {statuses.map((item) => (
              <Chip key={item.id} facet="status" count={item.count} active={facets.status === item.id} onClick={() => set({ status: facets.status === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} dot={STATUS_DOT[item.id]} />
            ))}
          </FacetGroup>
        )}
        <FacetGroup title="Flags" dense={dense}>
          <Chip facet="flag" active={!facets.flag} onClick={() => set({ flag: null })} label="All" />
          {flags.map((item) => (
            <Chip key={item.id} facet="flag" count={item.count} active={facets.flag === item.id} onClick={() => set({ flag: facets.flag === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} icon={FLAG_ICON[item.id]} />
          ))}
        </FacetGroup>
        <FacetGroup title="Founded year" dense={dense}>
          <Chip
            facet="year"
            count={baseCompanies.length}
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
                facet="year"
                count={item.count}
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
        <FacetGroup title="HQ city" dense={dense}>
          <Chip facet="hq" count={baseCompanies.length} active={!facets.hqRegion} onClick={() => set({ hqRegion: null })} label={`All · ${baseCompanies.length}`} />
          {hqRegions.map((item) => (
            <Chip
              key={item.id}
              facet="hq"
              count={item.count}
              active={facets.hqRegion === item.id}
              onClick={() => set({ hqRegion: facets.hqRegion === item.id ? null : item.id })}
              label={`${item.label} · ${item.count}`}
            />
          ))}
          {!hqExpanded && hqPills.more.length > 0 ? (
            <Chip
              facet="hq-more"
              count={hqPills.moreCount}
              active={false}
              emphasis
              onClick={() => setHqExpanded(true)}
              label={`More cities · ${hqPills.moreCount}`}
            />
          ) : null}
        </FacetGroup>
        <FacetGroup title="Sector" dense={dense}>
          <Chip facet="sector" count={baseCompanies.length} active={!facets.sector && !facets.sectorMissing} onClick={() => set({ sector: null, sectorMissing: false })} label={`All · ${baseCompanies.length}`} />
          {sectorRows.map((item) => {
            const missing = item.id === NOT_ON_RECORD;
            return (
              <Chip
                key={item.id}
                facet="sector"
                count={item.count}
                active={missing ? facets.sectorMissing : facets.sector === item.id}
                onClick={() =>
                  set(
                    missing
                      ? { sectorMissing: !facets.sectorMissing, sector: null }
                      : { sector: facets.sector === item.id ? null : item.id, sectorMissing: false },
                  )
                }
                label={`${item.label} · ${item.count}`}
                dot={missing ? undefined : sectorDot(item.id)}
              />
            );
          })}
          {!sectorExpanded && sectorPack.more.length > 0 ? (
            <Chip
              facet="sector-more"
              count={sectorPack.moreCount}
              active={false}
              emphasis
              onClick={() => setSectorExpanded(true)}
              label={`More sectors · ${sectorPack.moreCount}`}
            />
          ) : null}
        </FacetGroup>
        <FacetGroup title="Country" defaultOpen={false} dense={dense}>
          <Chip active={!facets.country} onClick={() => set({ country: null })} label={`All · ${campuses.length}`} />
          {countries.map(([name, count]) => (
            <Chip key={name} active={facets.country === name} onClick={() => set({ country: facets.country === name ? null : name })} label={`${name} · ${count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Campus" defaultOpen={false} dense={dense}>
          {campusRows.map((campus) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => {
                set({ campus: facets.campus === campus.id ? null : campus.id });
                onCampusFocus?.(campus.id);
              }}
              className={`flex w-full items-baseline gap-1 rounded-md px-1 py-0.5 text-left text-[11px] hover:bg-[color:var(--bg-sunken,#F3F5F9)] ${facets.campus === campus.id ? "bg-[color:var(--bg-sunken,#F3F5F9)]" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate">{shortCampusLabel(campus.id, campus.name)}</span>
              <span className={`${COUNT} shrink-0 text-[10px]`}>{campus.founders.toLocaleString("en-US")}</span>
            </button>
          ))}
        </FacetGroup>
        <FacetGroup title="Signal kind" defaultOpen={false} dense={dense}>
          <Chip active={!facets.kind} onClick={() => set({ kind: null })} label="All" />
          {kinds.map((item) => (
            <Chip key={item.id} active={facets.kind === item.id} onClick={() => set({ kind: facets.kind === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Stage" defaultOpen={false} dense={dense}>
          <Chip active={!facets.stage} onClick={() => set({ stage: null })} label="All" />
          {stages.map((item) => (
            <Chip key={item.id} active={facets.stage === item.id} onClick={() => set({ stage: facets.stage === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
        <FacetGroup title="Signal recency" defaultOpen={false} dense={dense}>
          <Chip active={!facets.recency} onClick={() => set({ recency: null })} label="All" />
          {recency.map((item) => (
            <Chip key={item.id} active={facets.recency === item.id} onClick={() => set({ recency: facets.recency === item.id ? null : item.id })} label={`${item.label} · ${item.count}`} />
          ))}
        </FacetGroup>
      </div>
      {footer ? <div className="border-t border-[color:var(--line,#E1E5EF)] px-2.5 py-1.5 text-[10px] leading-[14px] text-[color:var(--fg-2,#3F465C)]">{footer}</div> : null}
    </div>
  );
}

export function applyFacets(companies: FacetCompany[], facets: FacetState, countryCampusIds?: Set<string>): FacetCompany[] {
  const scoped = countryCampusIds
    ? companies.filter((company) => !company.schoolId || countryCampusIds.has(company.schoolId))
    : companies;
  return filterFacetCompanies(scoped, {
    sector: facets.sector,
    sectorMissing: facets.sectorMissing,
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
    <div className={`${PANEL} relative overflow-hidden p-2 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">{title}</p>
        {unit ? <p className="font-mono text-[9px] uppercase tracking-[0.04em] text-[color:var(--fg-3,#5C647A)]">{unit}</p> : null}
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
      <div className="flex items-baseline gap-1.5 font-mono text-[11px]">
        <span className={`${COUNT} w-4 shrink-0 text-right text-[11px] tracking-tight`}>{String(rank).padStart(2, "0")}</span>
        <span className="min-w-0 flex-1 truncate font-sans text-[color:var(--fg,#0B0E17)]">{label}</span>
        <span className={`${COUNT} shrink-0 text-[11px]`}>{value.toLocaleString("en-US")}</span>
      </div>
      <div className="ml-5 mt-0.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#F3F5F9)]">
        <div className="h-full rounded-full bg-[color:var(--ember,#D96B1C)]" style={{ width: `${width}%` }} />
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block w-full text-left hover:text-[color:var(--ember,#D96B1C)]">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="w-full text-left hover:text-[color:var(--ember,#D96B1C)]">
      {inner}
    </button>
  );
}

export function SignalFeedRow({ company, index }: { company: FacetCompany; index: number }) {
  const date = (company.latestSignalAt ?? "").replace(/-00/g, "") || "n/a";
  const kind = company.signalLabel ?? "Signal";
  return (
    <Link href={`/startup/${company.id}`} className="group flex items-start gap-2.5 px-0.5 py-2 text-left transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50">
      <span className={`${COUNT} mt-0.5 w-5 shrink-0 text-right text-[12px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
      <LogoMark name={company.name} logoUrl={company.logoUrl} size={22} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)]">{company.name}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1.5 font-mono text-[10px] font-semibold tracking-[0.02em] text-[color:var(--cobalt,#2F4FD8)]">{kind}</span>
          <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{date}</span>
        </span>
      </span>
      {company.signals > 0 ? <span className={`${COUNT} mt-0.5 shrink-0 text-[12px]`}>{company.signals}</span> : null}
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
    <Link href={`/startup/${person.companyId}`} className="group flex items-center gap-2.5 px-0.5 py-2 text-left transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50" title={person.companyName}>
      <span className={`${COUNT} w-5 shrink-0 text-right text-[12px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
      <LogoMark name={person.name} logoUrl={person.logoUrl} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5 text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)]">{person.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">{person.companyName}</span>
      </span>
      <span className={`${COUNT} shrink-0 text-[12px]`}>{person.signals.toLocaleString("en-US")}</span>
    </Link>
  );
}

/** Display label for stored investor/program facts (VIP-X is Penn Venture Lab). */
export function programDisplayName(raw: string): string {
  const name = raw.trim();
  if (!name) return name;
  if (/venture\s*lab\s*vip-?x/i.test(name) || /^penn\s+venture\s+lab$/i.test(name)) return "Penn Venture Lab";
  return name;
}

export function topPrograms(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const raw = company.primaryProgram?.trim();
    if (!raw) continue;
    const label = programDisplayName(raw);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
}

/** Shared right-rail intelligence boards (no campus list). */
export function IntelligenceBoards({
  companies,
  compact = false,
  hideSector = false,
}: {
  companies: FacetCompany[];
  limit?: number;
  compact?: boolean;
  hideSector?: boolean;
}) {
  const recentN = compact ? 2 : 3;
  const founderN = compact ? 2 : 3;
  const recent = useMemo(() => recentSignals(companies).slice(0, recentN), [companies, recentN]);
  const mix = useMemo(() => sectorMix(companies).slice(0, compact ? 3 : 5), [companies, compact]);
  const founders = useMemo(() => topFounders(companies).slice(0, founderN), [companies, founderN]);
  const programs = useMemo(() => topPrograms(companies), [companies]);
  const maxProg = programs[0]?.count || 1;
  const gap = compact ? "space-y-1.5" : "space-y-2";
  const rowGap = "divide-y divide-[color:var(--line,#E1E5EF)]";
  const programsBoard =
    programs.length > 0 ? (
      <Board title="Top programs" unit="companies">
        <ol className={rowGap}>
          {programs.slice(0, 3).map((item, index) => (
            <li key={item.id} className="py-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`${COUNT} w-5 shrink-0 text-right text-[11px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[color:var(--cobalt,#2F4FD8)]/70 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[8px] font-semibold text-[color:var(--cobalt,#2F4FD8)]" aria-hidden title={item.label}>
                  {companyInitials(item.label).slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--fg,#0B0E17)]">{item.label}</span>
                <span className={`${COUNT} shrink-0 text-[11px]`}>{item.count.toLocaleString("en-US")}</span>
              </div>
              <div className="ml-12 mt-1 h-0.5 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#F3F5F9)]">
                <div className="h-full rounded-full bg-[color:var(--ember,#D96B1C)]" style={{ width: `${Math.max(8, Math.round((item.count / maxProg) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </Board>
    ) : null;
  return (
    <div className={gap}>
      {/* Compact fold: programs sit above sector/founders so #3 Penn Venture Lab is in the 900px fold. */}
      {compact ? programsBoard : null}
      <Board title="Recent signals" unit="kind · date">
        <ol className={rowGap}>
          {recent.map((company, index) => (
            <li key={company.id}>
              <SignalFeedRow company={company} index={index} />
            </li>
          ))}
        </ol>
      </Board>
      {!hideSector ? (
      <Board title="Sector mix" unit="companies">
        <div className="flex h-2 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#F3F5F9)]">
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
              <Link href={`/?sample=1&sector=${encodeURIComponent(item.id)}#browse`} className="flex items-center gap-1.5 text-[10px] hover:text-[color:var(--ember,#D96B1C)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sectorDot(item.id) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[color:var(--fg,#0B0E17)]">{item.label}</span>
                <span className={`${COUNT} shrink-0`}>{item.count.toLocaleString("en-US")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Board>
      ) : null}
      <Board title="Top founders" unit="signals">
        <ol className={rowGap}>
          {founders.map((person, index) => (
            <li key={person.key}>
              <FounderFeedRow person={person} index={index} />
            </li>
          ))}
        </ol>
      </Board>
      {!compact ? programsBoard : null}
      {!compact ? (
        <div className={`${PANEL} relative overflow-hidden p-1.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#D96B1C)]`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout ask</p>
          <Link
            href="/ask"
            className="mt-1 flex h-8 items-center gap-2 rounded-sm border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg-sunken,#F3F5F9)] px-2 font-mono text-[11px] text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--ember,#D96B1C)]"
          >
            <span className="font-mono text-[10px] text-[color:var(--ember,#D96B1C)]" aria-hidden>{">"}</span>
            Forming on campus this month?
          </Link>
        </div>
      ) : null}
    </div>
  );
}


export function MobileBrowsePulse({ companies }: { companies: FacetCompany[] }) {
  // Collapsed by default so the company feed leads on mobile; expand for Wire boards.
  return (
    <details className={`${PANEL} relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
      <summary className="cursor-pointer list-none px-2.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#0B0E17)] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>Wire</span>
          <span className="font-mono text-[10px] font-medium normal-case tracking-normal tabular-nums text-[color:var(--ember,#D96B1C)]">{companies.length.toLocaleString("en-US")} · Boards</span>
        </span>
      </summary>
      <div className="border-t border-[color:var(--line,#E1E5EF)] px-2 pb-2 pt-2">
        <IntelligenceBoards companies={companies} compact />
      </div>
    </details>
  );
}


/** Mobile fold wire: always-filled monogram + name + count (no empty outline pills). */
export function DispatchWire({
  companies,
  limit = 10,
}: {
  companies: FacetCompany[];
  limit?: number;
}) {
  const rows = useMemo(() => {
    return [...companies]
      .filter((c) => c.name && c.name.trim())
      .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name))
      .slice(0, limit);
  }, [companies, limit]);
  if (rows.length === 0) return null;
  return (
    <div className={`${PANEL} relative overflow-hidden p-2 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Wire</p>
        <p className="font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">{rows.length} on desk</p>
      </div>
      <ul className="divide-y divide-[color:var(--line,#E1E5EF)]">
        {rows.map((company, index) => {
          const initials = companyInitials(company.name).slice(0, 2) || "·";
          return (
            <li key={company.id}>
              <Link href={`/startup/${company.id}`} className="flex items-center gap-2 py-1.5 transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50">
                <span className={`${COUNT} w-5 shrink-0 text-right text-[10px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/40 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[9px] font-bold text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>
                  {initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--fg,#0B0E17)]">{company.name}</span>
                <span className={`${COUNT} shrink-0 text-[11px]`}>{company.signals.toLocaleString("en-US")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
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
  compact = false,
}: {
  mode: "startups" | "founders";
  onMode: (mode: "startups" | "founders") => void;
  companies: FacetCompany[];
  founders: { key: string; name: string; companyId: string; companyName: string }[];
  companyTotal: number;
  founderTotal: number;
  compact?: boolean;
}) {
  const total = mode === "startups" ? companyTotal : founderTotal;
  if (companyTotal === 0 && founderTotal === 0) return null;
  return (
    <div className={`${PANEL} relative overflow-hidden px-1.5 py-1.5 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Ledger</p>
        <p className={`${COUNT} text-[11px]`}>{total.toLocaleString("en-US")}</p>
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-[color:var(--line,#E1E5EF)]">
          <button type="button" onClick={() => onMode("startups")} className={`h-5 px-2 text-[10px] font-medium ${mode === "startups" ? "bg-[color:var(--ember,#D96B1C)] text-white" : "bg-[color:var(--bg-sunken,#F3F5F9)] text-[color:var(--fg-2,#3F465C)]"}`}>
            Startups
          </button>
          <button type="button" onClick={() => onMode("founders")} className={`h-5 px-2 text-[10px] font-medium ${mode === "founders" ? "bg-[color:var(--ember,#D96B1C)] text-white" : "bg-[color:var(--bg-sunken,#F3F5F9)] text-[color:var(--fg-2,#3F465C)]"}`}>
            Founders
          </button>
        </div>
      </div>
      <div className={`flex content-start gap-1 overflow-y-auto pr-0.5 ${compact ? "max-h-[7.5rem] flex-nowrap overflow-x-auto overflow-y-hidden" : "max-h-[min(70vh,560px)] flex-wrap"}`}>
        {mode === "startups"
          ? preferLogoCompanies(companies).map((company) => <LogoPill key={company.id} href={`/startup/${company.id}`} name={company.name} logoUrl={company.logoUrl} />)
          : founders.map((person) => <LogoPill key={person.key} href={`/startup/${person.companyId}`} name={person.name} mark={person.name} />)}
      </div>
    </div>
  );
}
