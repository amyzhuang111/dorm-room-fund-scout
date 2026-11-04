"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CampusSeal } from "@/components/campus-seal";
import { LogoMark } from "@/components/sample-instrument";
import {
  founderMatches,
  assignWhyWorthALook,
  signalTypeLabel,
  type FounderLead,
} from "@/lib/domain/founder-index";
import {
  founderIsOpenLane,
  type OpenLaneShell,
} from "@/lib/domain/open-lane";
import { WRAP_2, WRAP_FULL } from "@/lib/display/ellipsis";

const DECK_PAGE = 12;
const STRONG = new Set(["funding", "launch", "accelerator", "award"]);

function evidenceChips(
  founder: FounderLead,
): { key: string; label: string; kind: "signal" | "program"; href: string | null }[] {
  const out: { key: string; label: string; kind: "signal" | "program"; href: string | null }[] = [];
  const signalSources = founder.signalSourceByType ?? {};
  const programSources = founder.programSourceByLabel ?? {};
  const signals = [...founder.signalTypes]
    .filter((t) => STRONG.has(t))
    .sort(
      (a, b) =>
        ({ funding: 0, launch: 1, accelerator: 2, award: 3 }[a] ?? 50) -
          ({ funding: 0, launch: 1, accelerator: 2, award: 3 }[b] ?? 50) || a.localeCompare(b),
    );
  for (const type of signals.slice(0, 3)) {
    const href = signalSources[type] ?? null;
    // Signal chips without a real source stay off the card (plain claim with no link).
    if (!href) continue;
    out.push({ key: `s:${type}`, label: signalTypeLabel(type), kind: "signal", href });
  }
  for (const program of founder.programs.slice(0, 2)) {
    if (out.some((c) => c.label === program)) continue;
    const href = programSources[program] ?? null;
    if (!href) continue;
    out.push({ key: `p:${program}`, label: program, kind: "program", href });
  }
  return out.slice(0, 4);
}

function poolForLane(
  founders: FounderLead[],
  query: string,
  campusId: string | null,
  preferOpenLane: boolean,
  investableCompanyIds: ReadonlySet<string>,
) {
  const matched = founders.filter((f) => founderMatches(f, { text: query, campusId: campusId || null }));
  if (!preferOpenLane) return { list: matched, lane: "all" as const };
  const open = matched.filter((f) => founderIsOpenLane(f, investableCompanyIds));
  if (open.length > 0) return { list: open, lane: "open" as const };
  return { list: matched, lane: "all" as const };
}

/**
 * r57 mobile: vertical open-lane founder feed for investors.
 * Desktop never mounts this. Cards keep data-founder-card for density/fold gates.
 */
export function MobileFounderDeck({
  founders,
  status,
  query,
  campusId,
  openLane = null,
  investableCompanyIds,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
  openLane?: OpenLaneShell | null;
  investableCompanyIds: ReadonlySet<string>;
}) {
  const [shown, setShown] = useState(DECK_PAGE);

  const { list: matches, lane } = useMemo(
    () => poolForLane(founders, query, campusId, true, investableCompanyIds),
    [founders, query, campusId, investableCompanyIds],
  );
  const list = matches.slice(0, shown);
  const whyById = useMemo(() => assignWhyWorthALook(list), [list]);
  const openCount = openLane?.count ?? matches.length;

  if (status === "loading") {
    return (
      <p className="px-1 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]" data-founder-results="">
        Loading founders
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="px-1 py-3 text-[13px] text-[color:var(--fg-2,#3F465C)]" data-founder-results="">
        Founder list could not be loaded.
      </p>
    );
  }
  if (list.length === 0) {
    return (
      <p className="px-1 py-3 text-[13px] text-[color:var(--fg-2,#3F465C)]" data-founder-results="">
        No founders match.
      </p>
    );
  }

  return (
    <section
      data-founder-results=""
      data-founder-deck="1"
      data-founder-deck-lane={lane}
      data-founder-peek={String(Math.min(list.length, 3))}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
          {lane === "open" ? "No top fund yet" : "Founders"}
          <span className="ml-2 tabular-nums text-[color:var(--fg-3,#5C647A)]">
            {(lane === "open" ? openCount : matches.length).toLocaleString("en-US")}
          </span>
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--fg-3,#5C647A)]">
          {lane === "open" ? "No top fund yet" : "Matches"}
        </p>
      </div>
      <div className="space-y-1.5" data-founder-deck-list="">
        {list.map((founder) => {
          const why = whyById.get(founder.id) ?? null;
          const chips = evidenceChips(founder);
          const href = founder.companyId
            ? `/startup/${founder.companyId}?from=map${campusId && campusId !== "missing" ? `&campus=${encodeURIComponent(campusId)}` : ""}`
            : null;
          return (
            <div
              key={founder.id}
              className="w-full"
              data-founder-card=""
              data-founder-card-lane={lane}
              data-signal-chrome={
                founder.signalTypes.includes("funding")
                  ? "funding"
                  : founder.signalTypes.includes("launch")
                    ? "launch"
                    : founder.signalTypes.includes("award")
                      ? "award"
                      : founder.signalTypes.length
                        ? "other"
                        : "none"
              }
            >
              <article
                className="flex flex-col rounded-md border border-[color:var(--cobalt,#2F4FD8)]/20 bg-[color:var(--bg,#FFFFFF)] px-3 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                data-founder-card-body=""
              >
                <div className="flex items-start gap-2.5">
                  <span data-founder-seal="" className="mt-0.5 inline-flex shrink-0">
                    <CampusSeal label={founder.campus} size="lg" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`${WRAP_2} text-[15px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]`} data-founder-name="">
                      {founder.name}
                    </h3>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]" data-founder-campus-company="">
                      {founder.companyId ? (
                        <LogoMark name={founder.company || "Company"} logoUrl={`/company-logos/${founder.companyId}.webp`} size={14} />
                      ) : null}
                      <span className={`${WRAP_FULL} font-semibold text-[color:var(--fg,#0B0E17)]`}>{founder.company || "Company missing"}</span>
                    </p>
                    <p className={`mt-0.5 ${WRAP_FULL} font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]`}>
                      {founder.campus}
                      {founder.gradYear != null ? ` · ${founder.gradYear}` : ""}
                      {founder.sector ? ` · ${founder.sector}` : ""}
                    </p>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex min-h-11 min-w-[2.75rem] shrink-0 items-center justify-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--cobalt,#2F4FD8)] hover:underline active:scale-[0.97] transition-transform duration-150 ease-out"
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
                {chips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-founder-evidence-chips="">
                    {chips.map((chip) => {
                      const className =
                        chip.kind === "signal"
                          ? "inline-flex h-[18px] items-center rounded-sm border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--cobalt-haze,#E8ECFA)] px-1.5 font-mono text-[10px] font-semibold text-[color:var(--cobalt,#2F4FD8)] hover:underline"
                          : "inline-flex h-[18px] items-center rounded-sm border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-1.5 font-mono text-[10px] text-[color:var(--fg-2,#3F465C)] hover:underline";
                      return (
                        <a
                          key={chip.key}
                          href={chip.href!}
                          target="_blank"
                          rel="noreferrer"
                          className={className}
                          data-evidence-chip={chip.kind}
                          data-evidence-href={chip.href!}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {chip.label}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
                {why ? (
                  <p className="mt-2 overflow-visible border-l-2 border-[color:var(--cobalt,#2F4FD8)]/40 pl-2 text-[12px] leading-4 text-[color:var(--fg,#0B0E17)]" data-why-worth="">
                    <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Why worth a look</span>
                    <span className="mt-0.5 block overflow-visible whitespace-normal break-words [text-overflow:clip]" data-why-text="">
                      {why}
                    </span>
                  </p>
                ) : (
                  <p className="sr-only" data-why-worth="" data-why-blank="1">
                    Why worth a look blank
                  </p>
                )}
              </article>
            </div>
          );
        })}
      </div>
      {shown < matches.length ? (
        <button
          type="button"
          className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md border border-[color:var(--cobalt,#2F4FD8)]/40 bg-[color:var(--cobalt-haze,#E8ECFA)]/50 font-mono text-[11px] font-semibold text-[color:var(--cobalt,#2F4FD8)] active:scale-[0.98] transition-transform duration-150 ease-out"
          onClick={() => setShown((n) => Math.min(matches.length, n + DECK_PAGE))}
          data-founder-deck-more=""
        >
          More
          <span className="ml-2 tabular-nums text-[10px] text-[color:var(--fg-3,#5C647A)]">
            {(matches.length - shown).toLocaleString("en-US")} left
          </span>
        </button>
      ) : null}
    </section>
  );
}

/** Compact open-lane chips for the map-peek rest state (~120px sheet). */
export function MobileFounderPeek({
  founders,
  status,
  query,
  campusId,
  openLane = null,
  investableCompanyIds,
  onExpand,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
  openLane?: OpenLaneShell | null;
  investableCompanyIds: ReadonlySet<string>;
  onExpand?: () => void;
}) {
  const { list: matches, lane } = useMemo(
    () => poolForLane(founders, query, campusId, true, investableCompanyIds),
    [founders, query, campusId, investableCompanyIds],
  );
  const list = matches.slice(0, 16);
  const figure = openLane?.count ?? matches.length;

  if (status === "loading") {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]" data-founder-results="">
        Loading founders
      </p>
    );
  }
  if (status === "error" || list.length === 0) {
    return (
      <p className="text-[12px] text-[color:var(--fg-2,#3F465C)]" data-founder-results="">
        {status === "error" ? "Founder list could not be loaded." : "No founders match."}
      </p>
    );
  }

  return (
    <section
      data-founder-results=""
      data-founder-peek-strip="1"
      data-founder-peek-lane={lane}
      data-founder-peek={String(Math.min(list.length, 3))}
    >
      <div className="relative z-[2] mb-0.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
          {lane === "open" ? "No top fund yet" : "Founders"}
          <span className="ml-1.5 tabular-nums text-[color:var(--fg,#0B0E17)]" data-fold-open-lane-peek-figure="">
            {figure.toLocaleString("en-US")}
          </span>
          {lane === "open" ? (
            <span className="ml-1.5 font-sans text-[10px] font-semibold normal-case tracking-normal text-[color:var(--fg-2,#3F465C)]">
              no top fund yet
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className="relative inline-flex items-center font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] active:scale-[0.97] transition-transform duration-150 ease-out"
          data-fold-sheet-expand=""
          onClick={() => onExpand?.()}
        >
          Expand
        </button>
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-founder-peek-scroller=""
        onClick={() => onExpand?.()}
      >
        {list.map((founder) => {
          const href = founder.companyId
            ? `/startup/${founder.companyId}?from=map${campusId && campusId !== "missing" ? `&campus=${encodeURIComponent(campusId)}` : ""}`
            : null;
          const chip = evidenceChips(founder)[0];
          return (
            <div
              key={founder.id}
              className="relative inline-flex min-h-10 max-w-[18rem] shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--cobalt,#2F4FD8)]/25 bg-[color:var(--bg,#FFFFFF)] px-2.5 py-1"
              data-founder-card=""
              data-founder-peek-chip=""
            >
              <CampusSeal label={founder.campus} size="sm" />
              <span className="min-w-0">
                <span className={`block ${WRAP_FULL} text-[11px] font-semibold leading-4 text-[color:var(--fg,#0B0E17)]`} data-founder-name="">
                  {founder.name}
                </span>
                <span className={`mt-0.5 block ${WRAP_FULL} font-mono text-[9px] leading-[12px] text-[color:var(--fg-3,#5C647A)]`}>
                  {chip ? chip.label : founder.company || founder.campus || "Signal"}
                </span>
              </span>
              {href ? (
                <Link
                  href={href}
                  className="relative inline-flex shrink-0 items-center px-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]"
                  data-founder-peek-open=""
                  onClick={(e) => e.stopPropagation()}
                >
                  Open
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Sticky campus segments for the mobile sheet — also carries rank markers for density. */
export function MobileCampusSegments({
  campuses,
  selectedId,
  onSelect,
  onClear,
  kicker = "Campuses",
}: {
  campuses: { id: string; name: string; founders: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  kicker?: string;
}) {
  const top = campuses.slice(0, 5);
  if (top.length === 0) return null;
  return (
    <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2" data-fold-campus-segments="">
      <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]" data-fold-campus-segments-kicker="">
        {kicker}
      </p>
      <div className="relative" data-fold-campus-fade="">
      <ol
        className="flex gap-1.5 overflow-x-auto scroll-smooth pr-14 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-snap-type:x_proximity]"
        data-fold-peak-campus-rank-mobile=""
        role="listbox"
        aria-label="Filter campus"
      >
        <li className="shrink-0 [scroll-snap-align:start]">
          <button
            type="button"
            role="option"
            aria-selected={!selectedId || selectedId === "missing"}
            onClick={onClear}
            data-fold-campus-chip=""
            className={`relative inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[10px] font-semibold active:scale-[0.97] transition-transform duration-150 ease-out ${
              !selectedId || selectedId === "missing"
                ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] text-white"
                : "border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg-2,#3F465C)]"
            }`}
          >
            All
          </button>
        </li>
        {top.map((campus, i) => {
          const active = selectedId === campus.id;
          const short = (() => {
            const base = campus.name.replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
            // Fit whole chips at 390: abbreviate the longest open-lane labels.
            if (/northwestern/i.test(base)) return "NW";
            if (/boston/i.test(base)) return "BU";
            if (/columbia/i.test(base)) return "Columbia";
            return base;
          })();
          return (
            <li key={campus.id} className="shrink-0 [scroll-snap-align:start]" data-fold-peak-campus-item="">
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(campus.id)}
                data-fold-campus-chip=""
                className={`relative inline-flex h-7 items-center gap-1 rounded-full border px-2 active:scale-[0.97] transition-transform duration-150 ease-out ${
                  active
                    ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] text-white"
                    : "border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg,#0B0E17)]"
                }`}
              >
                <span className={`font-mono text-[9px] tabular-nums ${active ? "text-white/80" : "text-[color:var(--fg-3,#5C647A)]"}`}>{String(i + 1).padStart(2, "0")}</span>
                <CampusSeal label={campus.name} size="sm" />
                <span className="whitespace-nowrap text-[11px] font-semibold tracking-tight" data-fold-peak-campus-label="">
                  {short}
                </span>
                <span className={`font-mono text-[11px] font-bold tabular-nums ${active ? "text-white" : "text-[color:var(--cobalt,#2F4FD8)]"}`}>
                  {campus.founders.toLocaleString("en-US")}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
        <div
          aria-hidden
          data-fold-campus-fade-edge=""
          className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[color:var(--bg,#FFFFFF)] from-35% via-[color:var(--bg,#FFFFFF)]/85 to-transparent"
        />
      </div>
    </div>
  );
}
