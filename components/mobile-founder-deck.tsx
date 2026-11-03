"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CampusSeal } from "@/components/campus-seal";
import { LogoMark } from "@/components/sample-instrument";
import {
  founderMatches,
  assignWhyWorthALook,
  type FounderLead,
} from "@/lib/domain/founder-index";

const DECK_PAGE = 12;

/**
 * r53 mobile: horizontal snap founder deck for investors scanning on a phone.
 * Desktop never mounts this. Cards keep data-founder-card for density/fold gates.
 */
export function MobileFounderDeck({
  founders,
  status,
  query,
  campusId,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(DECK_PAGE);

  const matches = useMemo(
    () => founders.filter((f) => founderMatches(f, { text: query, campusId: campusId || null })),
    [founders, query, campusId],
  );
  const list = matches.slice(0, shown);
  const whyById = useMemo(() => assignWhyWorthALook(list), [list]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 120) {
      setShown((n) => Math.min(matches.length, n + DECK_PAGE));
    }
  };

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
    <section data-founder-results="" data-founder-deck="1" data-founder-peek={String(Math.min(list.length, 3))}>
      <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--cobalt,#2F4FD8)]">
          Founders
          <span className="ml-2 tabular-nums text-[color:var(--fg-3,#5C647A)]">{matches.length.toLocaleString("en-US")}</span>
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--fg-3,#5C647A)]">Swipe</p>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-founder-deck-scroller=""
      >
        {list.map((founder) => {
          const why = whyById.get(founder.id) ?? null;
          const href = founder.companyId
            ? `/startup/${founder.companyId}?from=map${campusId && campusId !== "missing" ? `&campus=${encodeURIComponent(campusId)}` : ""}`
            : null;
          return (
            <div
              key={founder.id}
              className="w-[min(292px,78vw)] shrink-0 snap-start"
              data-founder-card=""
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
                className="flex h-full flex-col rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                data-founder-card-body=""
              >
                <div className="flex items-start gap-2">
                  <span data-founder-seal="" className="mt-0.5 inline-flex shrink-0">
                    <CampusSeal label={founder.campus} size="lg" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-semibold leading-5 tracking-tight text-[color:var(--fg,#0B0E17)]" data-founder-name="">
                      {founder.name}
                    </h3>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[color:var(--fg-2,#3F465C)]" data-founder-campus-company="">
                      {founder.companyId ? (
                        <LogoMark name={founder.company || "Company"} logoUrl={`/company-logos/${founder.companyId}.webp`} size={14} />
                      ) : null}
                      <span className="truncate font-semibold text-[color:var(--fg,#0B0E17)]">{founder.company || "Company missing"}</span>
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
                      {founder.campus}
                      {founder.gradYear != null ? ` · ${founder.gradYear}` : ""}
                      {founder.sector ? ` · ${founder.sector}` : ""}
                    </p>
                  </div>
                </div>
                {why ? (
                  <p className="mt-2 overflow-visible border-l-2 border-[color:var(--cobalt,#2F4FD8)]/40 pl-2 text-[12px] leading-4 text-[color:var(--fg,#0B0E17)]" data-why-worth="">
                    <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Why worth a look</span>
                    <span
                      className="mt-0.5 block overflow-visible whitespace-normal break-words [text-overflow:clip]"
                      data-why-text=""
                    >
                      {why}
                    </span>
                  </p>
                ) : (
                  <p className="sr-only" data-why-worth="" data-why-blank="1">
                    Why worth a look blank
                  </p>
                )}
                {href ? (
                  <Link
                    href={href}
                    className="mt-auto pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] hover:underline"
                  >
                    Open record
                  </Link>
                ) : (
                  <p className="mt-auto pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--fg-3,#5C647A)]">
                    No company page
                  </p>
                )}
              </article>
            </div>
          );
        })}
        {shown < matches.length ? (
          <button
            type="button"
            className="flex w-28 shrink-0 snap-start flex-col items-center justify-center rounded-md border border-dashed border-[color:var(--cobalt,#2F4FD8)]/40 bg-[color:var(--cobalt-haze,#E8ECFA)]/40 px-2 font-mono text-[11px] font-semibold text-[color:var(--cobalt,#2F4FD8)]"
            onClick={() => setShown((n) => Math.min(matches.length, n + DECK_PAGE))}
          >
            More
            <span className="mt-1 tabular-nums text-[10px] text-[color:var(--fg-3,#5C647A)]">
              {(matches.length - shown).toLocaleString("en-US")} left
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}


/** Compact one-line founder chips for the map-peek rest state (~132px sheet). */
export function MobileFounderPeek({
  founders,
  status,
  query,
  campusId,
  onExpand,
}: {
  founders: FounderLead[];
  status: "loading" | "ready" | "error";
  query: string;
  campusId: string | null;
  onExpand?: () => void;
}) {
  const matches = useMemo(
    () => founders.filter((f) => founderMatches(f, { text: query, campusId: campusId || null })),
    [founders, query, campusId],
  );
  const list = matches.slice(0, 16);

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
    <section data-founder-results="" data-founder-peek-strip="1" data-founder-peek={String(Math.min(list.length, 3))}>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
          Founders
          <span className="ml-1.5 tabular-nums text-[color:var(--fg-3,#5C647A)]">{matches.length.toLocaleString("en-US")}</span>
        </p>
        <button
          type="button"
          className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]"
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
          return (
            <div
              key={founder.id}
              className="inline-flex h-9 max-w-[13rem] shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-2"
              data-founder-card=""
              data-founder-peek-chip=""
            >
              <CampusSeal label={founder.campus} size="sm" />
              <span className="min-w-0 truncate leading-none">
                <span className="block truncate text-[11px] font-semibold text-[color:var(--fg,#0B0E17)]" data-founder-name="">
                  {founder.name}
                </span>
                {founder.company ? (
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-[color:var(--fg-3,#5C647A)]" data-founder-company="">
                    {founder.company}
                  </span>
                ) : null}
              </span>
              {href ? (
                <Link
                  href={href}
                  className="shrink-0 font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-[color:var(--cobalt,#2F4FD8)]"
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
}: {
  campuses: { id: string; name: string; founders: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const top = campuses.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <div className="border-b border-[color:var(--line,#E1E5EF)] pb-2" data-fold-campus-segments="">
      <ol
        className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-fold-peak-campus-rank-mobile=""
        role="listbox"
        aria-label="Filter campus"
      >
        <li className="shrink-0">
          <button
            type="button"
            role="option"
            aria-selected={!selectedId || selectedId === "missing"}
            onClick={onClear}
            className={`inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[10px] font-semibold ${
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
          const short = campus.name.replace(/^University of (?:California, )?/, "").replace(/ University$/, "");
          return (
            <li key={campus.id} className="shrink-0" data-fold-peak-campus-item="">
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(campus.id)}
                className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 ${
                  active
                    ? "border-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--cobalt,#2F4FD8)] text-white"
                    : "border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] text-[color:var(--fg,#0B0E17)]"
                }`}
              >
                <span className={`font-mono text-[9px] tabular-nums ${active ? "text-white/80" : "text-[color:var(--fg-3,#5C647A)]"}`}>{String(i + 1).padStart(2, "0")}</span>
                <CampusSeal label={campus.name} size="sm" />
                <span className="max-w-[4.5rem] truncate text-[11px] font-semibold tracking-tight" data-fold-peak-campus-label="">
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
    </div>
  );
}
