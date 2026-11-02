"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { CampusSeal } from "@/components/campus-seal";
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


/** Sitewide campus-plate ranking: founder names on record (not signals, not companies). */
export type CampusFoundersRow = { id: string; name: string; founders: number };
/** Visible plate count before All campuses expand. */
export const CAMPUS_FOUNDERS_VISIBLE = 10;
export function campusFoundersRanked<T extends CampusFoundersRow>(campuses: T[]): T[] {
  return [...campuses]
    .filter((c) => c.founders > 0)
    .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name));
}
export function campusFoundersTop<T extends CampusFoundersRow>(
  campuses: T[],
  limit = CAMPUS_FOUNDERS_VISIBLE,
): T[] {
  return campusFoundersRanked(campuses).slice(0, limit);
}

export function campusFoundersAtlasRows(
  campuses: CampusFoundersRow[],
  limit = CAMPUS_FOUNDERS_VISIBLE,
  shortLabel: (id: string, name: string) => string = (_id, name) =>
    name.replace(/^University of /, "").replace(/ University$/, ""),
): { rank: string; label: string; value: string; unit: string }[] {
  return campusFoundersTop(campuses, limit).map((campus, i) => ({
    rank: String(i + 1).padStart(2, "0"),
    label: shortLabel(campus.id, campus.name),
    value: campus.founders.toLocaleString("en-US"),
    unit: "founders",
  }));
}

/** Fold-desk atlas language for util pages — word-led plate, real rows, no twin stamps. */

/** Leaderboard-mobile identity: ranked podium ladder — not a shared ticket or atlas dial. */
export function ScoutSignalPodium({
  rows,
  totalOnDesk,
  allHref = "/campuses",
  rankedCount,
}: {
  rows: { id: string; label: string; founders: number; signals: number }[];
  totalOnDesk: number;
  allHref?: string;
  /** Total campuses with founders on record (may exceed visible rows). */
  rankedCount?: number;
}) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.founders));
  const more = typeof rankedCount === "number" ? Math.max(0, rankedCount - rows.length) : 0;
  return (
    <div
      className="relative overflow-hidden border-2 border-[color:var(--ember,#D96B1C)]/45 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[4px] before:bg-[color:var(--ember,#D96B1C)]"
      data-signal-podium=""
      data-campus-metric="founders"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5 pl-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">Signal podium</p>
          <p className="mt-0.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">Ranked by founder names</p>
        </div>
        <p className="shrink-0 text-right font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
          <span className="font-bold text-[color:var(--ember,#D96B1C)]">{totalOnDesk.toLocaleString("en-US")}</span>
          {" on desk"}
        </p>
      </div>
      <ol className="divide-y divide-[color:var(--line,#E1E5EF)]" data-campus-founders-top="">
        {rows.map((row, i) => (
          <li key={row.id} className={i === 0 ? "bg-[color:var(--ember,#D96B1C)]/[0.06]" : undefined}>
            <div className={`flex items-end gap-3 px-3.5 pl-4 ${i < 3 ? "py-3.5" : "py-2"}`}>
              <span className={`shrink-0 font-mono font-bold leading-none tracking-[-0.06em] text-[color:var(--ember,#D96B1C)] ${i === 0 ? "text-[40px]" : i === 1 ? "text-[28px]" : i === 2 ? "text-[22px]" : "text-[14px]"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <CampusSeal label={row.label} size={i === 0 ? "md" : "sm"} />
                    <span className={`min-w-0 truncate font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] ${i === 0 ? "text-[18px]" : "text-[15px]"}`}>{row.label}</span>
                  </span>
                  <span className={`shrink-0 font-mono font-bold tabular-nums text-[color:var(--ember,#D96B1C)] ${i < 3 ? "text-[18px]" : "text-[14px]"}`}>{row.founders.toLocaleString("en-US")}</span>
                </div>
                <div className={`overflow-hidden rounded-sm bg-[color:var(--bg-sunken,#F3F5F9)] ${i < 3 ? "mt-2 h-2" : "mt-1.5 h-1.5"}`}>
                  <div
                    className="h-full rounded-sm bg-[color:var(--ember,#D96B1C)]"
                    style={{ width: `${Math.max(8, Math.round((row.founders / max) * 100))}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
                  <span className="font-bold text-[color:var(--fg,#0B0E17)]">{row.signals.toLocaleString("en-US")}</span>
                  {" signals on record"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-[color:var(--line,#E1E5EF)] px-3.5 py-2.5 pl-4" data-campus-founders-all="">
        <a href={allHref} className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] underline-offset-2 hover:underline">
          All campuses
          {more > 0 ? ` · ${more.toLocaleString("en-US")} more with founders` : ""}
        </a>
      </div>
    </div>
  );
}

/** Browse-more-end identity: closing colophon + next programs to scout — not a reused chronograph dial. */
export function ScoutEndColophon({
  showing,
  total,
  signaled,
  quiet,
  namedCompany,
  namedMeta,
  namedHref,
  nextPrograms,
}: {
  showing: number;
  total: number;
  signaled: number;
  quiet: number;
  namedCompany: string;
  namedMeta: string;
  namedHref: string;
  nextPrograms: { id: string; label: string; count: number }[];
}) {
  return (
    <div
      className="relative overflow-hidden border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--cobalt,#2F4FD8)]"
      data-scout-end-colophon=""
      data-next-to-scout=""
    >
      <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-3 sm:px-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--cobalt,#2F4FD8)]">Ledger colophon</p>
        <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]" data-ledger-showing="">
          {"Showing "}
          <span className="font-bold text-[color:var(--ember,#D96B1C)]">{showing.toLocaleString("en-US")}</span>
          {" of "}
          <span className="font-bold text-[color:var(--fg,#0B0E17)]">{total.toLocaleString("en-US")}</span>
          {" · "}
          <span className="font-bold text-[color:var(--ember,#D96B1C)]">{signaled.toLocaleString("en-US")}</span>
          {" with a signal · "}
          <span className="font-bold text-[color:var(--fg,#0B0E17)]">{quiet.toLocaleString("en-US")}</span>
          {" with no signal"}
        </p>
        <div className="mt-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--ember,#D96B1C)]">Named on slice</p>
          <a href={namedHref} className="mt-1 block truncate text-[17px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] underline-offset-2 hover:text-[color:var(--ember,#D96B1C)] hover:underline">
            {namedCompany}
          </a>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--fg-3,#5C647A)]">{namedMeta}</p>
        </div>
      </div>
      {nextPrograms.length ? (
        <div className="px-3.5 py-3 sm:px-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">Next to scout</p>
          <ol className="mt-2 divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)]">
            {nextPrograms.map((prog, i) => (
              <li key={prog.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[color:var(--cobalt,#2F4FD8)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{prog.label}</span>
                <span className="shrink-0 font-mono text-[15px] font-bold text-[color:var(--ember,#D96B1C)]">{prog.count.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">Programs by company count on the matching desk · not pagination</p>
        </div>
      ) : null}
    </div>
  );
}

export function ScoutAtlasPlate({
  kicker,
  title,
  figure,
  figureLabel,
  rows,
  caption,
  tone = "cobalt",
}: {
  kicker: string;
  title: string;
  figure?: number | string;
  figureLabel?: string;
  rows?: { rank: string; label: string; value: string; unit?: string }[];
  caption?: string;
  tone?: "cobalt" | "ember";
}) {
  const edgeClass =
    tone === "ember"
      ? "border-[color:var(--ember,#D96B1C)]/35 before:bg-[color:var(--ember,#D96B1C)]"
      : "border-[color:var(--cobalt,#2F4FD8)]/35 before:bg-[color:var(--cobalt,#2F4FD8)]";
  const kickerClass =
    tone === "ember" ? "text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--cobalt,#2F4FD8)]";
  return (
    <div
      className={`relative overflow-hidden rounded-none border bg-[color:var(--bg,#FFFFFF)] shadow-[0_2px_0_rgba(47,79,216,0.1)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${edgeClass}`}
      data-scout-atlas-plate=""
    >
      <div className="px-3.5 py-3.5 pl-4">
        <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${kickerClass}`}>{kicker}</p>
        <p className="mt-1.5 text-[17px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:text-[18px]">{title}</p>
        {figure != null ? (
          <p className="mt-1.5 font-mono text-[28px] font-bold leading-[0.9] tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]">
            {typeof figure === "number" ? figure.toLocaleString("en-US") : figure}
          </p>
        ) : null}
        {figureLabel ? (
          <p className="mt-1.5 text-[14px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{figureLabel}</p>
        ) : null}
        {rows && rows.length ? (
          <ol className="mt-3 divide-y divide-[color:var(--line,#E1E5EF)] border-t border-[color:var(--line,#E1E5EF)]">
            {rows.map((row) => (
              <li key={row.rank + row.label} className="flex items-baseline gap-2.5 py-2.5">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{row.label}</span>
                <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-[color:var(--fg,#0B0E17)]">{row.value}</span>
                {row.unit ? <span className="shrink-0 font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]">{row.unit}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {caption ? (
          <p className="mt-2.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}

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
  const initials = companyInitials(name).slice(0, 1);
  return (
    <span
      className={`${cls} grid shrink-0 place-items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] font-mono text-[9px] font-medium tracking-tight text-[color:var(--fg-3,#5C647A)]`}
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
  void mark;
  const cls = size <= 16 ? "h-4 w-4" : size <= 20 ? "h-5 w-5" : size <= 24 ? "h-6 w-6" : size <= 28 ? "h-7 w-7" : "h-8 w-8";
  const [ok, setOk] = useState(Boolean(logoUrl));
  if (logoUrl && ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className={`${cls} shrink-0 rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] object-contain`}
        onError={() => setOk(false)}
        onLoad={(e) => {
          // Tiny/blank Google stub tiles → monogram (pure bugfix; layout-neutral when logo is real).
          if (e.currentTarget.naturalWidth <= 16) setOk(false);
        }}
      />
    );
  }
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
      <div className="mt-1.5 divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)]">{children}</div>
    </details>
  );
}

/** Editorial ruled facet row — label left, mono count right, tick; no chips. */
function FacetRow({
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
  /** High-visibility row for truncated "More" remainders. */
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-facet={facet || undefined}
      data-facet-count={count != null ? String(count) : undefined}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${
        active
          ? "bg-[color:var(--ember,#D96B1C)]/8"
          : emphasis
            ? "bg-[color:var(--ember,#D96B1C)]/5 hover:bg-[color:var(--ember,#D96B1C)]/10"
            : "hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/40"
      }`}
    >
      <span
        className={`relative h-3.5 w-3.5 shrink-0 rounded-[2px] border ${
          active
            ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] after:absolute after:left-[3px] after:top-[1px] after:h-[7px] after:w-[4px] after:rotate-45 after:border-b-[1.5px] after:border-r-[1.5px] after:border-white after:content-['']"
            : "border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)]"
        }`}
        aria-hidden
      />
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden /> : null}
      {icon && !dot ? <span className="font-mono text-[9px] leading-none text-[color:var(--cobalt,#2F4FD8)]" aria-hidden>{icon}</span> : null}
      <span className={`min-w-0 flex-1 truncate text-[11px] ${active ? "font-semibold text-[color:var(--fg,#0B0E17)]" : emphasis ? "font-semibold text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg,#0B0E17)]"}`}>
        {label}
      </span>
      {count != null ? (
        <span className={`shrink-0 font-mono text-[11px] tabular-nums ${active || emphasis ? "font-bold text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg-3,#5C647A)]"}`}>
          {` · ${count.toLocaleString("en-US")}`}
        </span>
      ) : null}
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
  sheet = false,
  index = false,
  caption = "Narrow the map",
  indexCount,
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
  /** Editorial filter-sheet chrome (desktop aside + mobile sheet language). */
  sheet?: boolean;
  /** Persistent magazine table-of-contents column (desk) — not a sheet over content. */
  index?: boolean;
  /** Sheet/desk title under Scout filters (map vs ledger). */
  caption?: string;
  /** Live count figure for index column header. */
  indexCount?: number;
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

  // Sheet / index / dense share cobalt kickers / Status pin; index = persistent TOC column.
  const editorial = dense || sheet || index;
  const shell = index
    ? "relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
    : sheet
      ? "relative overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]"
      : dense
        ? ""
        : PANEL;

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${shell}`} data-facet-rail="scout" data-facet-sheet={sheet ? "1" : undefined} data-facet-index={index ? "1" : undefined}>
      <div className={`border-b border-[color:var(--line,#E1E5EF)] ${editorial ? "px-2.5 py-2.5" : "px-2.5 py-2"}`}>
        {dense && !sheet && !index ? null : (
          <>
            <p className={`font-mono text-[10px] uppercase ${sheet || dense || index ? "tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]" : "tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]"}`}>
              Filters
            </p>
            {(index || sheet) && indexCount != null ? (
              <p
                className={`mt-1.5 font-mono font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)] ${index ? "text-[28px]" : "text-[24px]"}`}
                data-facet-figure=""
              >
                {indexCount.toLocaleString("en-US")}
              </p>
            ) : null}
            <p className={`mt-0.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] ${(index || sheet) && indexCount != null ? "mt-1.5" : ""}`}>{caption}</p>
            {sheet || index ? (
              <p className="mt-0.5 font-mono text-[9px] tabular-nums text-[color:var(--fg-3,#5C647A)]">Status · Year · Sector · Campus</p>
            ) : null}
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
          className={`${dense && !sheet ? "mt-0" : "mt-1.5"} h-7 w-full rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-2 text-[11px] text-[color:var(--fg,#0B0E17)] outline-none placeholder:text-[color:var(--fg-3,#5C647A)]`}
        />
      </div>
      {editorial ? (
        <div className="shrink-0 border-b border-[color:var(--line,#E1E5EF)] px-2 py-1.5" data-facet-status-pin="">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Status</p>
          <div className="mt-1.5 divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--line,#E1E5EF)] border-l-2 border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)]">
            <FacetRow facet="status" count={baseCompanies.length} active={!facets.status} onClick={() => set({ status: null })} label="All" />
            {statuses.map((item) => (
              <FacetRow key={item.id} facet="status" count={item.count} active={facets.status === item.id} onClick={() => set({ status: facets.status === item.id ? null : item.id })} label={item.label} dot={STATUS_DOT[item.id]} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {editorial ? null : (
          <FacetGroup title="Status" dense={editorial}>
            <FacetRow facet="status" count={baseCompanies.length} active={!facets.status} onClick={() => set({ status: null })} label="All" />
            {statuses.map((item) => (
              <FacetRow key={item.id} facet="status" count={item.count} active={facets.status === item.id} onClick={() => set({ status: facets.status === item.id ? null : item.id })} label={item.label} dot={STATUS_DOT[item.id]} />
            ))}
          </FacetGroup>
        )}
                {flags.length > 0 ? (
          <FacetGroup title="Flags" dense={editorial}>
            <FacetRow facet="flag" active={!facets.flag} onClick={() => set({ flag: null })} label="All" />
            {flags.map((item) => (
              <FacetRow key={item.id} facet="flag" count={item.count} active={facets.flag === item.id} onClick={() => set({ flag: facets.flag === item.id ? null : item.id })} label={item.label} />
            ))}
          </FacetGroup>
        ) : null}
<FacetGroup title="Founded year" dense={editorial}>
          <FacetRow
            facet="year"
            count={baseCompanies.length}
            active={facets.foundedYear == null && !facets.yearMissing}
            onClick={() => set({ foundedYear: null, yearMissing: false })}
            label="All"
          />
          {years.map((item) => {
            const missing = item.id === NOT_ON_RECORD;
            const active = missing ? facets.yearMissing : facets.foundedYear === Number(item.id);
            return (
              <FacetRow
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
                label={item.label}
              />
            );
          })}
        </FacetGroup>
        <FacetGroup title="HQ city" dense={editorial}>
          <FacetRow facet="hq" count={baseCompanies.length} active={!facets.hqRegion} onClick={() => set({ hqRegion: null })} label="All" />
          {hqRegions.map((item) => (
            <FacetRow
              key={item.id}
              facet="hq"
              count={item.count}
              active={facets.hqRegion === item.id}
              onClick={() => set({ hqRegion: facets.hqRegion === item.id ? null : item.id })}
              label={item.label}
            />
          ))}
          {!hqExpanded && hqPills.more.length > 0 ? (
            <FacetRow
              facet="hq-more"
              count={hqPills.moreCount}
              active={false}
              emphasis
              onClick={() => setHqExpanded(true)}
              label="More cities"
            />
          ) : null}
        </FacetGroup>
        <FacetGroup title="Sector" dense={editorial}>
          <FacetRow facet="sector" count={baseCompanies.length} active={!facets.sector && !facets.sectorMissing} onClick={() => set({ sector: null, sectorMissing: false })} label="All" />
          {sectorRows.map((item) => {
            const missing = item.id === NOT_ON_RECORD;
            return (
              <FacetRow
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
                label={item.label}
                dot={missing ? undefined : sectorDot(item.id)}
              />
            );
          })}
          {!sectorExpanded && sectorPack.more.length > 0 ? (
            <FacetRow
              facet="sector-more"
              count={sectorPack.moreCount}
              active={false}
              emphasis
              onClick={() => setSectorExpanded(true)}
              label="More sectors"
            />
          ) : null}
        </FacetGroup>
        <FacetGroup title="Country" defaultOpen={false} dense={editorial}>
          <FacetRow active={!facets.country} onClick={() => set({ country: null })} label="All" count={campuses.length} />
          {countries.map(([name, count]) => (
            <FacetRow key={name} active={facets.country === name} onClick={() => set({ country: facets.country === name ? null : name })} label={name} count={count} />
          ))}
        </FacetGroup>
        <FacetGroup title="Campus" defaultOpen={false} dense={editorial}>
          {campusRows.map((campus) => (
            <FacetRow
              key={campus.id}
              active={facets.campus === campus.id}
              onClick={() => {
                set({ campus: facets.campus === campus.id ? null : campus.id });
                onCampusFocus?.(campus.id);
              }}
              label={shortCampusLabel(campus.id, campus.name)}
              count={campus.founders}
            />
          ))}
        </FacetGroup>
        <FacetGroup title="Signal kind" defaultOpen={false} dense={editorial}>
          <FacetRow active={!facets.kind} onClick={() => set({ kind: null })} label="All" />
          {kinds.map((item) => (
            <FacetRow key={item.id} active={facets.kind === item.id} onClick={() => set({ kind: facets.kind === item.id ? null : item.id })} label={item.label} count={item.count} />
          ))}
        </FacetGroup>
        <FacetGroup title="Stage" defaultOpen={false} dense={editorial}>
          <FacetRow active={!facets.stage} onClick={() => set({ stage: null })} label="All" />
          {stages.map((item) => (
            <FacetRow key={item.id} active={facets.stage === item.id} onClick={() => set({ stage: facets.stage === item.id ? null : item.id })} label={item.label} count={item.count} />
          ))}
        </FacetGroup>
        <FacetGroup title="Signal recency" defaultOpen={false} dense={editorial}>
          <FacetRow active={!facets.recency} onClick={() => set({ recency: null })} label="All" />
          {recency.map((item) => (
            <FacetRow key={item.id} active={facets.recency === item.id} onClick={() => set({ recency: facets.recency === item.id ? null : item.id })} label={item.label} count={item.count} />
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

/** Real-data signal month buckets from latestSignalAt. */
export type ChronoMonth = {
  id: string;
  label: string;
  short: string;
  count: number;
  peak: boolean;
  /** Valid ym before the drawn window. */
  earlier?: boolean;
  /** Year-only / month -00 (e.g. 2026-00-00) — not chronologically "earlier". */
  monthUnknown?: boolean;
};

export type ChronographDetail = {
  bars: ChronoMonth[];
  /** Companies with latestSignalAt length >= 7 in this set. */
  dated: number;
  /** Sum of month bars inside the drawn window. */
  inWindow: number;
  /** Valid ym before the window start (universe: 13). */
  earlierValid: number;
  /** latestSignalAt with month -00 (universe: 34, all 2026-00-00). */
  undatedMonth: number;
  /** @deprecated Alias of earlierValid — do not add undatedMonth into this. */
  earlier: number;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Snapshot ceiling — never draw months after the Scout dispatch through-date. */
export const CHRONO_THROUGH_YM = "2026-10";

/** Page-specific Contents figure — newest-sector or signal-rate lead; never a global program stamp. */
export type ContentsInsight = {
  figure: number;
  /** Signaled companies in the sector (e.g. 46). */
  signaled: number;
  /** Sector size (e.g. 353). */
  sectorSize: number;
  kicker: string;
  label: string;
  /** Spell-out strip: "46 of 353 since Sep". */
  detail: string;
  sectorId: string;
};

export function contentsPageInsight(
  companies: FacetCompany[],
  throughYm: string = CHRONO_THROUGH_YM,
): ContentsInsight | null {
  const [yy, mm] = throughYm.split("-").map((x) => Number(x));
  if (!yy || !mm) return null;
  const startM = mm === 1 ? 12 : mm - 1;
  const startY = mm === 1 ? yy - 1 : yy;
  const startYm = `${startY}-${String(startM).padStart(2, "0")}`;
  const startShort = MONTH_SHORT[startM - 1] ?? startYm;

  type Agg = { id: string; label: string; n: number; sig: number; recent: number };
  const map = new Map<string, Agg>();
  for (const company of companies) {
    const id = company.sectorId?.trim() || "";
    const label = company.sector?.trim() || "";
    if (!id || !label || /^unlabeled$/i.test(label)) continue;
    const row = map.get(id) ?? { id, label, n: 0, sig: 0, recent: 0 };
    row.n += 1;
    if ((company.signals ?? 0) > 0) row.sig += 1;
    const at = company.latestSignalAt ?? "";
    if (at.length >= 7 && at.slice(0, 7) >= startYm) row.recent += 1;
    map.set(id, row);
  }
  const rows = [...map.values()];
  const byRecent = [...rows]
    .filter((row) => row.recent > 0)
    .sort((a, b) => b.recent - a.recent || b.sig - a.sig || a.label.localeCompare(b.label));
  if (byRecent[0] && byRecent[0].recent >= 3) {
    const top = byRecent[0];
    return {
      figure: top.recent,
      signaled: top.sig,
      sectorSize: top.n,
      kicker: "Newest sector",
      label: top.label,
      detail: `${top.sig.toLocaleString("en-US")} of ${top.n.toLocaleString("en-US")} since ${startShort}`,
      sectorId: top.id,
    };
  }
  const byRate = [...rows]
    .filter((row) => row.n >= 15)
    .sort((a, b) => b.sig / b.n - a.sig / a.n || b.sig - a.sig || a.label.localeCompare(b.label));
  if (byRate[0]) {
    const top = byRate[0];
    const pct = Math.round((top.sig / top.n) * 100);
    return {
      figure: top.sig,
      signaled: top.sig,
      sectorSize: top.n,
      kicker: "Signal-rate lead",
      label: top.label,
      detail: `${pct}% of ${top.n.toLocaleString("en-US")} since ${startShort}`,
      sectorId: top.id,
    };
  }
  return null;
}

/** Named sectors ranked by newest signals in the last two chrono months. */
export function newestSectorMix(
  companies: FacetCompany[],
  throughYm: string = CHRONO_THROUGH_YM,
  limit = 5,
): FacetCount[] {
  const [yy, mm] = throughYm.split("-").map((x) => Number(x));
  if (!yy || !mm) return [];
  const startM = mm === 1 ? 12 : mm - 1;
  const startY = mm === 1 ? yy - 1 : yy;
  const startYm = `${startY}-${String(startM).padStart(2, "0")}`;
  const map = new Map<string, FacetCount>();
  for (const company of companies) {
    const id = company.sectorId?.trim() || "";
    const label = company.sector?.trim() || "";
    if (!id || !label || /^unlabeled$/i.test(label)) continue;
    const at = company.latestSignalAt ?? "";
    if (at.length < 7 || at.slice(0, 7) < startYm) continue;
    const prev = map.get(id);
    if (prev) prev.count += 1;
    else map.set(id, { id, label, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

/**
 * Build chronograph bars from latestSignalAt (source_date only).
 * Bars are the last `limit` real months through throughYm. Earlier months and
 * year-only dates stay off the bars (caption: 13 earlier, 34 year-only).
 * Month bars sum to inWindow. dated = inWindow + earlierValid + undatedMonth
 * (source_date universe 223 + 13 + 34 = 270; peak Apr 2026 = 109).
 */
export function signalChronographDetail(
  companies: FacetCompany[],
  limit = 9,
  throughYm = CHRONO_THROUGH_YM,
): ChronographDetail {
  const months = new Map<string, number>();
  let dated = 0;
  let undatedMonth = 0;
  for (const company of companies) {
    const at = company.latestSignalAt;
    if (!at || at.length < 7) continue;
    dated += 1;
    const ym = at.slice(0, 7);
    if (ym.endsWith("-00")) {
      undatedMonth += 1;
      continue;
    }
    if (throughYm && ym > throughYm) continue;
    months.set(ym, (months.get(ym) ?? 0) + 1);
  }
  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const slice = sorted.slice(-limit);
  const earlierValid = sorted.slice(0, Math.max(0, sorted.length - limit)).reduce((sum, [, n]) => sum + n, 0);
  const inWindow = slice.reduce((sum, [, n]) => sum + n, 0);
  const bars: ChronoMonth[] = slice.map(([id, count]) => {
    const y = id.slice(0, 4);
    const m = Number(id.slice(5, 7));
    const short = MONTH_SHORT[m - 1] ?? id.slice(5, 7);
    return {
      id,
      label: `${short} ${y}`,
      short,
      count,
      peak: false,
    };
  });
  if (bars.length === 0) {
    return { bars, dated, inWindow, earlierValid, undatedMonth, earlier: earlierValid };
  }
  const max = Math.max(1, ...bars.map((b) => b.count));
  for (const b of bars) b.peak = b.count === max;
  return { bars, dated, inWindow, earlierValid, undatedMonth, earlier: earlierValid };
}

export function signalChronograph(companies: FacetCompany[], limit = 9, throughYm = CHRONO_THROUGH_YM): ChronoMonth[] {
  return signalChronographDetail(companies, limit, throughYm).bars;
}

/** Plain caption for counts that are not month bars. Example: "13 earlier, 34 undated". */
export function chronographCaption(detail: ChronographDetail): string {
  const parts: string[] = [];
  if (detail.earlierValid > 0) parts.push(`${detail.earlierValid.toLocaleString("en-US")} earlier`);
  if (detail.undatedMonth > 0) parts.push(`${detail.undatedMonth.toLocaleString("en-US")} undated`);
  return parts.join(", ");
}

/**
 * Plain-language "when signals landed" — real calendar months only.
 * Earlier / year-only counts stay in a caption; never as Ear/Unk bar codes.
 */
export function SignalsLanded({ companies, compact = false }: { companies: FacetCompany[]; compact?: boolean }) {
  const detail = useMemo(() => signalChronographDetail(companies), [companies]);
  const bars = detail.bars;
  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const peak = bars.find((b) => b.peak) ?? bars[bars.length - 1]!;
  const aside = [
    detail.earlierValid > 0 ? `${detail.earlierValid.toLocaleString("en-US")} earlier` : null,
    detail.undatedMonth > 0 ? `${detail.undatedMonth.toLocaleString("en-US")} year-only` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (compact) {
    // filters-375 / companies-375: peak sparkline + count as hero (list stays high)
    return (
      <section
        className="border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 py-2"
        data-signals-landed=""
        data-signals-landed-compact=""
        data-chrono-peak={String(peak.count)}
        data-chrono-peak-month={peak.id}
        data-chrono-window={String(detail.inWindow)}
        data-chrono-earlier={String(detail.earlierValid)}
        data-chrono-month-unknown={String(detail.undatedMonth)}
        data-chrono-dated={String(detail.dated)}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">Peak · {peak.short} {peak.id.slice(0, 4)}</p>
            <p className="mt-1 scout-figure text-[32px] leading-none">
              {peak.count.toLocaleString("en-US")}
              <span className="ml-1.5 text-[13px] font-semibold tracking-tight text-[color:var(--fg-3,#5C647A)]">
                / {detail.dated.toLocaleString("en-US")}
              </span>
            </p>
            <p className="mt-1 text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">
              {peak.label} took {Math.round((peak.count / Math.max(1, detail.dated)) * 100)}% of dated signals
            </p>
          </div>
          <ol className="flex h-11 max-w-[46%] flex-1 items-end gap-0.5" data-signals-landed-bars="" aria-hidden>
            {bars.map((b) => (
              <li key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
                <span
                  className={`w-full max-w-[1.1rem] rounded-sm ${b.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/35"}`}
                  style={{ height: `${Math.max(3, Math.round((b.count / max) * 36))}px` }}
                />
              </li>
            ))}
          </ol>
        </div>
        {aside ? (
          <p className="mt-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-signals-landed-aside="">
            {aside}
            {" · not on the chart"}
          </p>
        ) : null}
      </section>
    );
  }
  return (
    <section
      className="border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 py-2 sm:px-4 sm:py-3"
      data-signals-landed=""
      data-chrono-peak={String(peak.count)}
      data-chrono-peak-month={peak.id}
      data-chrono-window={String(detail.inWindow)}
      data-chrono-earlier={String(detail.earlierValid)}
      data-chrono-month-unknown={String(detail.undatedMonth)}
      data-chrono-dated={String(detail.dated)}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">When signals landed</p>
      <p className="mt-1 text-[13px] text-[color:var(--fg-2,#3F465C)]">
        Real months only · months through October 2026
      </p>
      <ol className="mt-2 flex h-14 items-end gap-1 sm:mt-3 sm:h-20" data-signals-landed-bars="">
        {bars.map((b) => (
          <li key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" data-signal-month={b.id} title={`${b.label}: ${b.count}`}>
            <span className={`font-mono text-[10px] font-bold tabular-nums ${b.peak ? "text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg-2,#3F465C)]"}`}>
              {b.count.toLocaleString("en-US")}
            </span>
            <span
              className={`w-full max-w-[1.75rem] rounded-sm ${b.peak ? "bg-[color:var(--ember,#D96B1C)]" : "bg-[color:var(--cobalt,#2F4FD8)]/35"}`}
              style={{ height: `${Math.max(6, Math.round((b.count / max) * 52))}px` }}
            />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.04em] text-[color:var(--fg-3,#5C647A)]">{b.short}</span>
          </li>
        ))}
      </ol>
      {aside ? (
        <p className="mt-2 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]" data-signals-landed-aside="">
          {aside}
          {" · not on the chart"}
        </p>
      ) : null}
    </section>
  );
}


/**
 * Scout Chronograph — unifying editorial system across fold / browse / signals / company.
 * Real latestSignalAt month bars; peak month is the editorial figure (not decoration).
 */
export function ScoutChronograph({
  companies,
  variant = "ribbon",
  kicker = "Signals by month",
  datedLabel,
  reading,
  lead = "peak",
}: {
  companies: FacetCompany[];
  variant?: "ribbon" | "folio" | "hero" | "compact" | "ticket" | "spine";
  kicker?: string;
  /** Extra dated line. The earlier/undated caption is always appended in full. */
  datedLabel?: string;
  /** Page-specific real-data reading under the peak caption. */
  reading?: string;
  /** Unfiltered filter rails can lead with month-unknown (honest non-peak beat). */
  lead?: "peak" | "earlier" | "monthUnknown";
}) {
  const detail = useMemo(() => signalChronographDetail(companies), [companies]);
  const bars = detail.bars;
  if (bars.length === 0) return null;
  const dated = detail.dated;
  const peak = bars.find((b) => b.peak) ?? bars[bars.length - 1]!;
  const earlierBar = bars.find((b) => b.earlier);
  const unknownBar = bars.find((b) => b.monthUnknown);
  const figure =
    lead === "monthUnknown" && unknownBar && unknownBar.count > 0
      ? unknownBar
      : lead === "earlier" && earlierBar && earlierBar.count > 0
        ? earlierBar
        : peak;
  const figureIsEarlier = Boolean(figure.earlier);
  const figureIsUnknown = Boolean(figure.monthUnknown);
  const max = Math.max(1, ...bars.map((b) => b.count));
  const bucketCaption = chronographCaption(detail);
  const caption = [datedLabel, bucketCaption].filter(Boolean).join(" · ") || `${dated.toLocaleString("en-US")} dated`;
  const figureCaption = figureIsUnknown
    ? "Year on record, month not on record"
    : figureIsEarlier
      ? "Before the months in this chart"
      : `Tallest bar · ${figure.label}`;

  function barFill(b: ChronoMonth): string {
    if (b.monthUnknown) return "bg-[color:var(--cobalt,#2F4FD8)]/70";
    if (b.earlier) return "bg-[color:var(--ember,#D96B1C)]/55";
    if (b.peak) return "bg-[color:var(--ember,#D96B1C)]";
    return "bg-[color:var(--cobalt,#2F4FD8)]/40";
  }
  function barLabelClass(b: ChronoMonth): string {
    if (b.monthUnknown || b.earlier || b.peak) return "font-bold text-[color:var(--ember,#D96B1C)]";
    return "text-[color:var(--fg-3,#5C647A)]";
  }

  /** Fold-mobile only: typographic chronograph spine — not the shared dispatch ticket. */
  if (variant === "spine") {
    const monthWord = figureIsUnknown ? "UNKNOWN" : figureIsEarlier ? "EARLIER" : figure.label.replace(/\s+\d{4}$/, "").toUpperCase();
    return (
      <div
        className="relative overflow-hidden border-2 border-[color:var(--ember,#D96B1C)]/50 bg-[color:var(--bg,#FFFFFF)]"
        data-scout-chronograph="spine"
        data-fold-chrono-spine=""
        data-chrono-peak={String(peak.count)}
        data-chrono-peak-month={peak.id}
        data-chrono-dated={String(dated)}
        data-chrono-earlier={String(detail.earlierValid)}
        data-chrono-month-unknown={String(detail.undatedMonth)}
        data-chrono-window={String(detail.inWindow)}
        data-chrono-lead={figureIsUnknown ? "monthUnknown" : figureIsEarlier ? "earlier" : "peak"}
      >
        <div className="border-b border-[color:var(--line,#E1E5EF)] px-3.5 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ember,#D96B1C)]">{kicker}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-stretch">
          <div className="min-w-0 px-3.5 py-5">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[color:var(--cobalt,#2F4FD8)]">{monthWord}</p>
            <p className="mt-2 font-mono text-[64px] font-bold leading-[0.82] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)]">
              {figure.count.toLocaleString("en-US")}
            </p>
            <p className="mt-3 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{figureCaption}</p>
            <p data-chrono-caption="" className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{caption}</p>
            {reading ? <p className="mt-2 font-mono text-[11px] leading-snug text-[color:var(--fg-2,#3F465C)]">{reading}</p> : null}
          </div>
          <div className="flex flex-col justify-between gap-0.5 border-l border-[color:var(--ember,#D96B1C)]/35 bg-[color:var(--ember,#D96B1C)]/[0.04] px-1.5 py-3" data-spine-rail="">
            {bars.map((b) => (
              <div key={b.id} data-chrono-bar={b.id} className="flex min-h-0 flex-1 items-center gap-1" title={`${b.label}: ${b.count}`}>
                <span className={`h-full w-1.5 shrink-0 rounded-sm ${barFill(b)}`} style={{ minHeight: 4, height: `${Math.max(4, Math.round((b.count / max) * 100))}%` }} />
                <span className={`whitespace-nowrap font-mono text-[10px] uppercase leading-none tracking-[0.04em] ${barLabelClass(b)}`}>{b.short}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /** Mobile identity: dispatch ticket + vertical chronograph spine — not a shrunken desk atlas. */
  if (variant === "ticket") {
    return (
      <div
        className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/45 bg-[color:var(--bg,#FFFFFF)] shadow-[0_2px_0_rgba(217,107,28,0.12)]"
        data-scout-chronograph="ticket"
        data-dispatch-ticket=""
        data-chrono-peak={String(peak.count)}
        data-chrono-peak-month={peak.id}
        data-chrono-dated={String(dated)}
        data-chrono-earlier={String(detail.earlierValid)}
        data-chrono-month-unknown={String(detail.undatedMonth)}
        data-chrono-window={String(detail.inWindow)}
        data-chrono-lead={figureIsUnknown ? "monthUnknown" : figureIsEarlier ? "earlier" : "peak"}
      >
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1 border-r border-dashed border-[color:var(--line-strong,#C5CAD8)] px-3.5 py-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--ember,#D96B1C)]" aria-hidden />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ember,#D96B1C)]">Dispatch ticket</p>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{kicker}</p>
            <p className="mt-3 font-mono text-[44px] font-bold leading-[0.88] tracking-[-0.06em] text-[color:var(--ember,#D96B1C)]">
              {figure.count.toLocaleString("en-US")}
            </p>
            <p className="mt-2 text-[15px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{figureCaption}</p>
            <p data-chrono-caption="" className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{caption}</p>
            {reading ? <p className="mt-2 font-mono text-[11px] leading-snug text-[color:var(--fg-2,#3F465C)]">{reading}</p> : null}
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--fg-3,#5C647A)]">Scout · chronograph spine</p>
          </div>
          <div className="flex w-[4.25rem] shrink-0 flex-col justify-between gap-1 bg-[color:var(--bg,#FFFFFF)] px-2 py-3" data-ticket-spine="">
            {bars.map((b) => (
              <div key={b.id} data-chrono-bar={b.id} className="flex min-h-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${b.label}: ${b.count}`}>
                <span
                  className={`w-full max-w-[1.35rem] rounded-sm ${barFill(b)}`}
                  style={{ height: `${Math.max(6, Math.round((b.count / max) * 28))}px` }}
                />
                <span className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.04em] ${barLabelClass(b)}`}>{b.short}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className="relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-2.5 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
        data-scout-chronograph="compact"
        data-chrono-peak={String(peak.count)}
        data-chrono-peak-month={peak.id}
        data-chrono-dated={String(dated)}
        data-chrono-earlier={String(detail.earlierValid)}
        data-chrono-month-unknown={String(detail.undatedMonth)}
        data-chrono-window={String(detail.inWindow)}
        data-chrono-lead={figureIsUnknown ? "monthUnknown" : figureIsEarlier ? "earlier" : "peak"}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--ember,#D96B1C)]">{kicker}</p>
          <p data-chrono-caption="" className="min-w-0 text-right font-mono text-[11px] tabular-nums leading-snug text-[color:var(--fg-2,#3F465C)]">{caption}</p>
        </div>
        <p className="mt-1.5 font-mono text-[28px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
          {figure.count.toLocaleString("en-US")}
        </p>
        <p className="mt-1 text-[12px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{figureCaption}</p>
        {reading ? <p className="mt-0.5 font-mono text-[9px] leading-snug text-[color:var(--fg-2,#3F465C)]">{reading}</p> : null}
        <div className="mt-2 flex h-10 items-end gap-1">
          {bars.map((b) => (
            <div key={b.id} data-chrono-bar={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${b.label}: ${b.count}`}>
              <span className={`w-full rounded-sm ${barFill(b)}`} style={{ height: `${Math.max(5, Math.round((b.count / max) * 36))}px` }} />
              <span className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.04em] ${barLabelClass(b)}`}>{b.short}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "folio") {
    return (
      <div
        data-scout-chronograph="folio"
        data-chrono-peak={String(peak.count)}
        data-chrono-peak-month={peak.id}
        data-chrono-dated={String(dated)}
        data-chrono-earlier={String(detail.earlierValid)}
        data-chrono-month-unknown={String(detail.undatedMonth)}
        data-chrono-window={String(detail.inWindow)}
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">{kicker}</p>
          <p data-chrono-caption="" className="min-w-0 text-right font-mono text-[11px] tabular-nums leading-snug text-[color:var(--fg-2,#3F465C)]">{caption}</p>
        </div>
        <div className="relative mb-2 overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]">
          <p className="font-mono text-[32px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]">
            {figure.count.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-[13px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)]">{figureCaption}</p>
          {reading ? <p className="mt-0.5 font-mono text-[10px] text-[color:var(--fg-2,#3F465C)]">{reading}</p> : null}
        </div>
        <ol className="relative overflow-hidden divide-y divide-[color:var(--line,#E1E5EF)] border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]">
          {bars.map((b) => (
            <li key={b.id} data-chrono-bar={b.id} className={b.peak || b.earlier || b.monthUnknown ? "bg-[color:var(--ember,#D96B1C)]/6" : undefined}>
              <div className="flex items-center gap-3 px-3 py-2">
                <span className={`shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums ${b.earlier || b.monthUnknown || b.peak ? "text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg-2,#3F465C)]"}`}>
                  {b.label}
                </span>
                <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[color:var(--bg-sunken,#F3F5F9)]">
                  <span className={`absolute inset-y-0 left-0 ${barFill(b)}`} style={{ width: `${Math.max(6, Math.round((b.count / max) * 100))}%` }} />
                </span>
                <span className={`shrink-0 font-mono text-[16px] font-bold leading-none tabular-nums tracking-[-0.03em] ${b.earlier || b.monthUnknown || b.peak ? "text-[color:var(--ember,#D96B1C)]" : "text-[color:var(--fg,#0B0E17)]"}`}>
                  {b.count.toLocaleString("en-US")}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const tall = variant === "hero";
  return (
    <div
      className={`relative overflow-hidden border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)] ${tall ? "px-3.5 py-4 sm:px-4 sm:py-3.5" : "px-2.5 py-2.5"}`}
      data-scout-chronograph={variant}
      data-chrono-peak={String(peak.count)}
      data-chrono-peak-month={peak.id}
      data-chrono-dated={String(dated)}
      data-chrono-earlier={String(detail.earlierValid)}
      data-chrono-month-unknown={String(detail.undatedMonth)}
      data-chrono-window={String(detail.inWindow)}
      data-chrono-lead={figureIsUnknown ? "monthUnknown" : figureIsEarlier ? "earlier" : "peak"}
    >
      <div className={`flex flex-wrap items-end justify-between gap-3 ${tall ? "flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:gap-4" : ""}`}>
        <div className={`min-w-0 ${tall ? "w-full sm:flex-1 sm:basis-[12rem]" : "flex-1 basis-[12rem]"}`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ember,#D96B1C)]">{kicker}</p>
          {tall ? (
            <>
              <p className="font-mono text-[12px] font-bold uppercase tracking-[0.32em] text-[color:var(--cobalt,#2F4FD8)]" data-chrono-month-word="">
                {figureIsUnknown ? "MONTH UNKNOWN" : figureIsEarlier ? "EARLIER" : figure.label.replace(/\s+\d{4}$/, "").toUpperCase()}
              </p>
              <p className="mt-1.5 font-mono text-[64px] font-bold leading-[0.82] tracking-[-0.08em] text-[color:var(--ember,#D96B1C)] sm:mt-1 sm:text-[56px] sm:leading-none sm:tracking-[-0.07em] lg:text-[72px]">
                {figure.count.toLocaleString("en-US")}
              </p>
              <p className="mt-2 text-[16px] font-semibold tracking-tight text-[color:var(--fg,#0B0E17)] sm:mt-1.5 sm:text-[17px]">{figureCaption}</p>
              <p data-chrono-caption="" className="mt-0.5 font-mono text-[12px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{caption}</p>
              {reading ? <p className="mt-1.5 max-w-[28rem] font-mono text-[11px] leading-snug text-[color:var(--fg-2,#3F465C)]">{reading}</p> : null}
            </>
          ) : (
            <>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
                <span className="font-bold text-[color:var(--ember,#D96B1C)]">{figure.count.toLocaleString("en-US")}</span>
                {" · "}
                {figureCaption}
                {" · "}
                {caption}
              </p>
              {reading ? <p className="mt-0.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">{reading}</p> : null}
            </>
          )}
        </div>
        <div className={`flex items-end gap-1.5 ${tall ? "h-32 sm:h-36" : "h-16"} w-full`}>
          {bars.map((b) => (
            <div key={b.id} data-chrono-bar={b.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${b.label}: ${b.count} companies`}>
              <span className={`whitespace-nowrap font-mono text-[11px] font-bold tabular-nums ${barLabelClass(b)}`}>{b.count.toLocaleString("en-US")}</span>
              <span
                className={`w-full max-w-[36px] rounded-sm ${barFill(b)}`}
                style={{ height: `${Math.max(tall ? 8 : 6, Math.round((b.count / max) * (tall ? 72 : 36)))}px` }}
              />
              <span className={`whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.04em] ${barLabelClass(b)}`}>{b.short}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export function topFounders(companies: FacetCompany[]): { key: string; name: string; companyId: string; companyName: string; campus: string; signals: number; logoUrl?: string | null }[] {
  const rows: { key: string; name: string; companyId: string; companyName: string; campus: string; signals: number; logoUrl?: string | null }[] = [];
  for (const company of [...companies].sort((a, b) => b.signals - a.signals)) {
    for (const person of company.founders ?? []) {
      const name = person.trim();
      if (!name) continue;
      rows.push({
        key: `${company.id}:${name}`,
        name,
        companyId: company.id,
        companyName: company.name,
        campus: company.school?.trim() || "Campus not on record",
        signals: company.signals,
        logoUrl: company.logoUrl,
      });
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
  const rawDate = (company.latestSignalAt ?? "").replace(/-00/g, "").trim();
  const date = rawDate || null;
  const kind = company.signalLabel ?? "Signal";
  return (
    <Link href={`/startup/${company.id}`} className="group flex items-start gap-2.5 px-0.5 py-2 text-left transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50">
      <span className={`${COUNT} mt-0.5 w-5 shrink-0 text-right text-[12px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
      <LogoMark name={company.name} logoUrl={company.logoUrl} size={22} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)]">{company.name}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1.5 font-mono text-[10px] font-semibold tracking-[0.02em] text-[color:var(--cobalt,#2F4FD8)]">{kind}</span>
          {date ? (
            <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--fg-2,#3F465C)]">{date}</span>
          ) : (
            <span className="inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">No source date</span>
          )}
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
  person: { key: string; name: string; companyId: string; companyName: string; campus: string; signals: number; logoUrl?: string | null };
  index: number;
}) {
  return (
    <Link href={`/startup/${person.companyId}`} className="group flex items-center gap-2.5 px-0.5 py-2 text-left transition-colors hover:bg-[color:var(--cobalt-haze,#E8ECFA)]/50" title={`${person.name} · ${person.campus}`}>
      <span className={`${COUNT} w-5 shrink-0 text-right text-[12px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
      <LogoMark name={person.name} logoUrl={person.logoUrl} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-5 text-[color:var(--fg,#0B0E17)] group-hover:text-[color:var(--ember,#D96B1C)]">{person.name}</span>
        <span className="mt-0.5 block text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]">
          {person.campus}
          {person.companyName ? ` · ${person.companyName}` : ""}
        </span>
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

/** Universe program totals use programs[] membership (not primaryProgram alone). YC = 564 in sample. */
export const YC_MEMBERSHIP_EXPECTED = 564;

export function isYcProgramLabel(label: string): boolean {
  return /^y\s*combinator$/i.test(label.trim());
}

/** Membership count of companies with Y Combinator in programs[] (fallback primaryProgram). */
export function ycMembershipCount(companies: FacetCompany[]): number {
  const yc = topPrograms(companies).find((p) => isYcProgramLabel(p.label));
  return yc?.count ?? 0;
}

export function topPrograms(companies: FacetCompany[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const raws = company.programs?.map((name) => name.trim()).filter(Boolean) ?? [];
    const names = raws.length > 0 ? raws : company.primaryProgram?.trim() ? [company.primaryProgram.trim()] : [];
    const labels = new Set(names.map((name) => programDisplayName(name)).filter(Boolean));
    for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
}

/** Shared intelligence boards — surface varies module order so Explore / Signals / company do not stamp one WIRE. */
export function IntelligenceBoards({
  companies,
  compact = false,
  hideSector = false,
  hideLatest = false,
  hidePrograms = false,
  surface = "fold",
}: {
  companies: FacetCompany[];
  limit?: number;
  compact?: boolean;
  hideSector?: boolean;
  /** Map home does not list startups. */
  hideLatest?: boolean;
  /** Browse-more end already ranks programs in the center colophon. */
  hidePrograms?: boolean;
  /** fold keeps programs-first; browse leads sector; signals leads programs+recent; company is dossier-thin. */
  surface?: "fold" | "browse" | "signals" | "company";
}) {
  const recentN = compact ? 2 : 3;
  const founderN = compact ? 2 : surface === "browse" ? 4 : 3;
  const recent = useMemo(() => recentSignals(companies).slice(0, recentN), [companies, recentN]);
  const mix = useMemo(() => sectorMix(companies).slice(0, compact ? 3 : 5), [companies, compact]);
  const founders = useMemo(() => topFounders(companies).slice(0, founderN), [companies, founderN]);
  const programs = useMemo(() => topPrograms(companies), [companies]);
  const maxProg = programs[0]?.count || 1;
  const gap = compact ? "space-y-1.5" : "space-y-2";
  const rowGap = "divide-y divide-[color:var(--line,#E1E5EF)]";
  const showSector = !hideSector && surface !== "company" && surface !== "signals";
  const showFounders = surface !== "signals";
  const showPrograms = surface !== "company" && !hidePrograms;
  const programsBoard =
    showPrograms && programs.length > 0 ? (
      <Board title="Programs" unit="companies">
        <ol className={rowGap}>
          {programs.slice(0, surface === "signals" ? 4 : 3).map((item, index) => (
            <li key={item.id} className="py-1">
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`${COUNT} w-5 shrink-0 text-right text-[11px] tracking-tight`}>{String(index + 1).padStart(2, "0")}</span>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[color:var(--cobalt,#2F4FD8)]/70 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[8px] font-semibold text-[color:var(--cobalt,#2F4FD8)]" aria-hidden title={item.label}>
                  {companyInitials(item.label).slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--fg,#0B0E17)]">{item.label}</span>
                <span
                  className={`${COUNT} shrink-0 text-[11px]`}
                  {...(isYcProgramLabel(item.label) && item.count === YC_MEMBERSHIP_EXPECTED
                    ? { "data-yc-membership-count": String(item.count) }
                    : {})}
                >
                  {item.count.toLocaleString("en-US")}
                </span>
                {isYcProgramLabel(item.label) && item.count === YC_MEMBERSHIP_EXPECTED ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">in YC</span>
                ) : isYcProgramLabel(item.label) ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">YC on slice</span>
                ) : null}
              </div>
              <div className="ml-12 mt-1 h-0.5 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#F3F5F9)]">
                <div className="h-full rounded-full bg-[color:var(--ember,#D96B1C)]" style={{ width: `${Math.max(8, Math.round((item.count / maxProg) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </Board>
    ) : null;
  const recentBoard = hideLatest ? null : (
    <Board title="Latest" unit="kind · date">
      <ol className={rowGap}>
        {recent.map((company, index) => (
          <li key={company.id}>
            <SignalFeedRow company={company} index={index} />
          </li>
        ))}
      </ol>
    </Board>
  );
  const sectorBoard = showSector ? (
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
            <Link href={`/companies?sector=${encodeURIComponent(item.id)}`} className="flex items-center gap-1.5 text-[10px] hover:text-[color:var(--ember,#D96B1C)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sectorDot(item.id) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[color:var(--fg,#0B0E17)]">{item.label}</span>
              <span className={`${COUNT} shrink-0`}>{item.count.toLocaleString("en-US")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Board>
  ) : null;
  const foundersBoard = showFounders && founders.length > 0 ? (
    <Board title="Founders" unit="signals">
      <ol className={rowGap}>
        {founders.map((person, index) => (
          <li key={person.key}>
            <FounderFeedRow person={person} index={index} />
          </li>
        ))}
      </ol>
    </Board>
  ) : null;

  // Per-surface order breaks the stamped WIRE template across Explore / Signals / company.
  let modules: ReactNode[] = [];
  if (surface === "browse") {
    modules = [recentBoard, foundersBoard, programsBoard, sectorBoard].filter(Boolean);
  } else if (surface === "signals") {
    modules = [programsBoard, recentBoard].filter(Boolean);
  } else if (surface === "company") {
    modules = [recentBoard, foundersBoard].filter(Boolean);
  } else if (compact) {
    // Fold compact: programs above sector/founders so #3 Penn Venture Lab stays in the 900px fold.
    modules = [programsBoard, recentBoard, sectorBoard, foundersBoard].filter(Boolean);
  } else {
    modules = [recentBoard, sectorBoard, foundersBoard, programsBoard].filter(Boolean);
  }

  return (
    <div className={gap}>
      {modules.map((node, index) => (
        <div key={index}>{node}</div>
      ))}
      {!compact && surface === "fold" ? (
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


/** Mobile-native WIRE: horizontal swipe digest — not a shrunk desktop column.
 *  Per-surface card mix + accent so fold / browse / continued / company do not twin. */
export function MobileWireStrip({
  companies,
  label = "Wire",
  surface = "browse",
}: {
  companies: FacetCompany[];
  label?: string;
  surface?: "fold" | "browse" | "signals" | "company";
}) {
  const mix = useMemo(() => sectorMix(companies).slice(0, 3), [companies]);
  const recent = useMemo(() => recentSignals(companies).slice(0, 3), [companies]);
  const founders = useMemo(() => topFounders(companies).slice(0, 2), [companies]);
  const programs = useMemo(() => topPrograms(companies).slice(0, 3), [companies]);

  type Card = { key: string; kicker: string; figure: string; caption: string; href?: string; ycCount?: number };
  const cards: Card[] = [];
  // fold: programs only — dispatch desk beat
  if (surface === "fold") {
    for (const [i, p] of programs.entries()) {
      cards.push({
        key: `prog-${p.id}`,
        kicker: `0${i + 1} program`,
        figure: p.count.toLocaleString("en-US"),
        caption: isYcProgramLabel(p.label)
          ? p.count === YC_MEMBERSHIP_EXPECTED
            ? `${p.label} · in YC`
            : `${p.label} · YC on slice`
          : p.label,
        ycCount: isYcProgramLabel(p.label) && p.count === YC_MEMBERSHIP_EXPECTED ? p.count : undefined,
      });
    }
  }
  // browse: sectors lead the ledger
  if (surface === "browse") {
    for (const s of mix) {
      cards.push({
        key: `sec-${s.id}`,
        kicker: "Sector",
        figure: s.count.toLocaleString("en-US"),
        caption: s.label,
        href: `/companies?sector=${encodeURIComponent(s.id)}`,
      });
    }
  }
  // signals (browse-more continued): recent signals only — label must match
  if (surface === "signals") {
    for (const [i, c] of recent.entries()) {
      cards.push({
        key: `sig-${c.id}`,
        kicker: `0${i + 1} signal`,
        figure: c.signalLabel ?? "Signal",
        caption: c.name,
        href: `/startup/${c.id}`,
      });
    }
  }
  // company: campus peers by signal weight (6c770b0; skip empty founder stubs) — sim-375
  if (surface === "company") {
    const peers = [...companies]
      .filter((c) => (c.signals ?? 0) > 0)
      .sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name))
      .slice(0, 6);
    for (const [i, c] of peers.entries()) {
      cards.push({
        key: `peer-${c.id}`,
        kicker: c.school ? c.school : `0${i + 1} peer`,
        figure: String(c.signals),
        caption: c.signalLabel ? `${c.name} · ${c.signalLabel}` : c.name,
        href: `/startup/${c.id}`,
      });
    }
  }
  if (cards.length === 0) return null;

  const hint =
    surface === "fold"
      ? "Swipe · programs"
      : surface === "browse"
        ? "Swipe · sectors"
        : surface === "signals"
          ? "Swipe · recent"
          : "Swipe · peers";

  // Distinct card chrome per surface (avoid twin strips)
  const cardCls =
    surface === "fold"
      ? "relative w-[168px] shrink-0 overflow-hidden rounded-none border border-[color:var(--ember,#D96B1C)]/35 bg-[color:var(--bg,#FFFFFF)] p-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--ember,#D96B1C)]"
      : surface === "browse"
        ? "relative w-[168px] shrink-0 overflow-hidden rounded-none border border-[color:var(--cobalt,#2F4FD8)]/30 bg-[color:var(--bg,#FFFFFF)] p-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color:var(--cobalt,#2F4FD8)]"
        : surface === "signals"
          ? "relative w-[160px] shrink-0 overflow-hidden rounded-none border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] p-3 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[color:var(--ember,#D96B1C)]"
          : "relative w-[196px] shrink-0 overflow-hidden rounded-none border border-[color:var(--line-strong,#C5CAD8)] bg-[color:var(--bg,#FFFFFF)] p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-[color:var(--ember,#D96B1C)]";

  const figureCls =
    surface === "signals"
      ? "mt-2 font-mono text-[24px] font-bold leading-none tracking-[-0.04em] text-[color:var(--ember,#D96B1C)]"
      : "mt-2 font-mono text-[28px] font-bold leading-none tracking-[-0.05em] text-[color:var(--ember,#D96B1C)]";

  return (
    <div className="lg:hidden" data-mobile-wire-strip={surface}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">{label}</p>
        <p className="font-mono text-[10px] tabular-nums text-[color:var(--fg-3,#5C647A)]">{hint}</p>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((card) => {
          const inner = (
            <>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">{card.kicker}</p>
              <p
                className={figureCls}
                {...(card.ycCount != null ? { "data-yc-membership-count": String(card.ycCount) } : {})}
              >
                {card.figure}
              </p>
              <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-[color:var(--fg,#0B0E17)]">{card.caption}</p>
            </>
          );
          return card.href ? (
            <Link key={card.key} href={card.href} className={cardCls}>
              {inner}
            </Link>
          ) : (
            <div key={card.key} className={cardCls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bottom-anchored filter dock — tone varies per page so docks do not twin.
 *  When `observe` is set, the dock only mounts while that selector intersects the viewport
 *  (home page hosts both fold + browse docks; without this they stack as twins). */
export function MobileFilterDock({
  onOpen,
  count,
  caption = "Narrow the desk",
  tone = "ember",
  kicker = "Scout filters",
  observe,
}: {
  onOpen: () => void;
  count?: number;
  caption?: string;
  /** ember = filled (fold); outline = cobalt framed (browse); magazine = hairline bar (company) */
  tone?: "ember" | "outline" | "magazine";
  kicker?: string;
  /** CSS selector — dock shows only while this node is in view */
  observe?: string;
}) {
  const [inView, setInView] = useState(() => !observe);
  useEffect(() => {
    if (!observe) return;
    const el = document.querySelector(observe);
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { root: null, threshold: 0.12, rootMargin: "-18% 0px -28% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [observe]);
  if (observe && !inView) return null;

  const shell =
    tone === "ember"
      ? "fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--bg,#FFFFFF)]/95 px-3 py-2.5 backdrop-blur-sm lg:hidden"
      : tone === "outline"
        ? "fixed inset-x-0 bottom-0 z-40 border-t-2 border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] px-3 py-2 lg:hidden"
        : "fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)]/90 px-3 py-1.5 lg:hidden";

  const btn =
    tone === "ember"
      ? "flex h-11 w-full items-center justify-between gap-3 rounded-sm border border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] px-3 text-left"
      : tone === "outline"
        ? "flex h-10 w-full items-center justify-between gap-3 rounded-none border border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] px-3 text-left before:absolute"
        : "flex h-9 w-full items-center justify-between gap-3 rounded-none border-0 bg-transparent px-2.5 text-left";

  const kickerCls =
    tone === "ember"
      ? "block font-mono text-[10px] uppercase tracking-[0.08em] text-white/80"
      : "block whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]";
  const captionCls =
    tone === "ember"
      ? "mt-0.5 block truncate text-[13px] font-semibold text-white"
      : "mt-0.5 block truncate text-[13px] font-semibold text-[color:var(--fg,#0B0E17)]";
  const countCls =
    tone === "ember"
      ? "shrink-0 font-mono text-[12px] font-bold tabular-nums text-white"
      : "shrink-0 font-mono text-[14px] font-bold tabular-nums text-[color:var(--ember,#D96B1C)]";

  return (
    <div
      className={shell}
      data-mobile-filter-dock={tone}
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <button type="button" onClick={onOpen} className={btn}>
        <span className="min-w-0">
          <span className={kickerCls}>{kicker}</span>
          <span className={captionCls}>{caption}</span>
        </span>
        <span className={countCls}>{count != null ? count.toLocaleString("en-US") : "Open"}</span>
      </button>
    </div>
  );
}

/** @deprecated Prefer MobileWireStrip — kept as alias for any residual imports. */
export function MobileBrowsePulse({ companies }: { companies: FacetCompany[] }) {
  return <MobileWireStrip companies={companies} label="Wire" surface="browse" />;
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
