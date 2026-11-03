"use client";

import { plainText } from "@/lib/display/plain-text";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SignalTierBadge } from "./badges";
import { FounderSignalsTable } from "./founder-signals-table";
import type { HotspotEvent } from "@/lib/domain/hotspot-dates";
import type { FounderSignalRow } from "@/lib/domain/founder-signals";
import {
  SECTION_LABEL,
  SECTION_ORDER,
  compareCampuses,
  hotspotCampusSlug,
  hotspotPages,
  resolveCampusParam,
  type HotspotCard,
  type HotspotSectionId,
  type HotspotTier,
} from "@/lib/domain/hotspot-model";

const TIERS: HotspotTier[] = ["S+", "S", "A", "B", "C", "D"];
const PREVIEW = 3;

export function HotspotsApp({
  cards,
  events,
  signals,
  initial,
}: {
  cards: HotspotCard[];
  events: HotspotEvent[];
  signals: FounderSignalRow[];
  initial: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tier, setTier] = useState<string>(initial.tier ?? "");
  const [section, setSection] = useState<string>(initial.section ?? "");
  const [type, setType] = useState<string>(initial.type ?? "");
  const [q, setQ] = useState<string>(initial.q ?? "");
  const [hash, setHash] = useState("");
  const seenCampus = useRef<string | null>(null);

  const pages = useMemo(() => hotspotPages(cards), [cards]);
  const labels = useMemo(() => pages.map((page) => page.campus), [pages]);
  const campusQuery = searchParams.get("campus") || searchParams.get("city") || "";
  const selected = resolveCampusParam(campusQuery, labels) ?? pages[0]?.campus ?? "";
  const index = Math.max(0, pages.findIndex((page) => page.campus === selected));
  const page = pages[index];

  const campusCards = useMemo(
    () => cards.filter((card) => card.campus === selected).sort(compareCampuses),
    [cards, selected],
  );
  const types = useMemo(() => {
    const values = new Set(campusCards.map((card) => card.type).filter(Boolean));
    if (type) values.add(type);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [campusCards, type]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return campusCards.filter((card) => {
      if (tier && card.tier !== tier) return false;
      if (section && card.section !== section) return false;
      if (type && card.type !== type) return false;
      if (!query) return true;
      const blob = `${card.place} ${card.campus} ${card.type} ${card.whatYoullFind} ${card.howToGetIn} ${card.when}`.toLowerCase();
      return blob.includes(query);
    });
  }, [campusCards, tier, section, type, q]);

  const signalRows = useMemo(
    () => (selected ? signals.filter((row) => resolveCampusParam(row.campus, [selected]) === selected) : []),
    [signals, selected],
  );

  function campusHref(campus: string): string {
    const next = new URLSearchParams(searchParams.toString());
    next.set("campus", hotspotCampusSlug(campus));
    next.delete("city");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  useEffect(() => {
    const read = () => {
      const raw = window.location.hash.replace(/^#/, "");
      try {
        setHash(decodeURIComponent(raw));
      } catch {
        setHash(raw);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [searchParams]);

  useEffect(() => {
    if (!selected) return;
    const slug = hotspotCampusSlug(selected);
    if (searchParams.get("campus") === slug && !searchParams.get("city")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("campus", slug);
    next.delete("city");
    const qs = next.toString();
    const hashPart = window.location.hash;
    router.replace(`${qs ? `${pathname}?${qs}` : pathname}${hashPart}`, { scroll: false });
  }, [pathname, router, searchParams, selected]);

  useEffect(() => {
    if (seenCampus.current === null || seenCampus.current === selected) {
      seenCampus.current = selected;
      return;
    }
    seenCampus.current = selected;
    document.getElementById("hotspot-campus")?.scrollIntoView({ block: "start" });
  }, [selected]);

  const jumpGroups = [
    { label: "Universities", items: pages.filter((item) => item.placeKind === "campus") },
    { label: "Cities", items: pages.filter((item) => item.placeKind === "city") },
    { label: "Programmes", items: pages.filter((item) => item.placeKind === "other") },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-foreground">Hotspots</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Rooms where you can meet founders and startups. Tiers are scouting notes for where to spend time. They do not change Founder Signal.
          </p>
        </div>
        <p className="text-xs text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          {visible.length.toLocaleString("en-US")} of {campusCards.length.toLocaleString("en-US")} places
        </p>
      </div>

      {events.length > 0 && (
        <details className="mt-4 rounded-md border border-border-c bg-surface p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-foreground">
            Upcoming events
            <span className="ml-2 text-xs font-medium text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              {events.length}
            </span>
          </summary>
          <ul className="mt-2 divide-y divide-border-c">
            {events.map((event) => (
              <li key={`${event.date}-${event.event}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="shrink-0 text-xs font-medium text-muted sm:w-56">{plainText(event.date)}</span>
                <span className="min-w-0 text-sm text-foreground">
                  {event.url ? (
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                      {plainText(event.event)}
                    </a>
                  ) : (
                    plainText(event.event)
                  )}
                  {event.where && <span className="text-muted"> · {plainText(event.where)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 space-y-3 border-b border-border-c pb-3">
        <nav aria-label="Campuses" className="sticky top-14 z-10 flex flex-col gap-2 bg-background py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <PagerLink href={index > 0 ? campusHref(pages[index - 1].campus) : null}>Previous</PagerLink>
            <p className="min-w-[5.5rem] text-center text-sm font-medium text-foreground" style={{ fontVariantNumeric: "tabular-nums" }} aria-live="polite">
              {pages.length === 0 ? "0 of 0" : `${index + 1} of ${pages.length}`}
            </p>
            <PagerLink href={index < pages.length - 1 ? campusHref(pages[index + 1].campus) : null}>Next</PagerLink>
          </div>
          <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <span className="shrink-0 text-xs font-medium text-muted">School</span>
            <select
              aria-label="Jump to a school"
              value={selected}
              onChange={(event) => {
                if (event.target.value === selected) return;
                router.push(campusHref(event.target.value), { scroll: false });
              }}
              className="min-h-11 w-full min-w-0 rounded-md border border-border-c bg-white px-2 text-base text-foreground sm:w-64 sm:text-sm"
            >
              {jumpGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.campus} value={item.campus}>
                      {item.campus}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search places"
            aria-label="Search hotspots"
            className="min-h-11 w-full rounded-md border border-border-c bg-white px-2.5 text-base text-foreground sm:w-48 sm:min-h-0 sm:py-1 sm:text-sm"
          />
          <Select label="Type" value={type} onChange={setType} options={types} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Chip on={tier === ""} label="All tiers" onClick={() => setTier("")} />
          {TIERS.map((item) => (
            <Chip key={item} on={tier === item} label={item} onClick={() => setTier(tier === item ? "" : item)} />
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border-c sm:inline" />
          <Chip on={section === ""} label="All sections" onClick={() => setSection("")} />
          {SECTION_ORDER.map((item) => (
            <Chip key={item} on={section === item} label={shortSection(item)} onClick={() => setSection(section === item ? "" : item)} />
          ))}
        </div>
      </div>

      {page && (
        <section className="mt-4" aria-label={page.campus}>
          <h2 id="hotspot-campus" tabIndex={-1} className="scroll-mt-32 text-lg text-foreground outline-none">
            {page.campus}
            <span className="ml-2 text-xs font-medium text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
              {visible.length}
            </span>
          </h2>
          {visible.length === 0 && <p className="mt-3 text-sm text-muted">No places match these filters.</p>}
          {SECTION_ORDER.map((sectionId) => {
            const rows = visible.filter((card) => card.section === sectionId);
            if (rows.length === 0) return null;
            return <CategorySection key={`${selected}:${sectionId}`} sectionId={sectionId} cards={rows} highlightId={hash} />;
          })}
          <FounderSignalsTable rows={signalRows} />
        </section>
      )}

      <p className="mt-8 text-xs text-muted">
        <Link href="/founder/network?from=founder" className="text-link hover:underline">
          Network map
        </Link>
      </p>
    </div>
  );
}

function CategorySection({ sectionId, cards, highlightId }: { sectionId: HotspotSectionId; cards: HotspotCard[]; highlightId: string }) {
  const highlightIndex = highlightId ? cards.findIndex((card) => card.id === highlightId) : -1;
  const [open, setOpen] = useState(true);
  const [showAllOverride, setShowAllOverride] = useState<boolean | null>(null);
  const showAll = showAllOverride ?? highlightIndex >= PREVIEW;
  const shown = showAll ? cards : cards.slice(0, PREVIEW);

  useEffect(() => {
    if (highlightIndex < 0 || !open) return;
    document.getElementById(highlightId)?.scrollIntoView({ block: "start" });
  }, [highlightId, highlightIndex, open]);

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-border-c py-1 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {SECTION_LABEL[sectionId]}
          <span className="ml-2 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
            {cards.length}
          </span>
        </span>
        <span aria-hidden="true" className="text-sm text-foreground">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {shown.map((card) => (
              <li key={card.id}>
                <HotspotCardView card={card} />
              </li>
            ))}
          </ul>
          {cards.length > PREVIEW && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAllOverride(!showAll)}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
            >
              {showAll ? "Show less" : "Show all"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function HotspotCardView({ card }: { card: HotspotCard }) {
  return (
    <article id={card.id} className="h-full scroll-mt-32 rounded-md border border-border-c bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-foreground">{card.place}</h4>
          <p className="mt-0.5 text-xs text-muted">{card.type}</p>
          {card.tierRationale && <p className="mt-1 text-xs text-muted">{card.tierRationale}</p>}
        </div>
        <SignalTierBadge tier={card.tier} basis={card.tierRationale || null} />
      </div>
      {card.whatYoullFind && <p className="mt-2 text-sm text-foreground">{card.whatYoullFind}</p>}
      {card.howToGetIn && (
        <p className="mt-2 text-xs text-foreground">
          <span className="font-semibold uppercase tracking-wide text-muted">How to get in </span>
          {card.howToGetIn}
        </p>
      )}
      {card.when && (
        <p className="mt-1 text-xs text-foreground">
          <span className="font-semibold uppercase tracking-wide text-muted">When </span>
          {plainText(card.when)}
        </p>
      )}
      {card.url && (
        <a href={card.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-link hover:underline">
          {card.linkLabel || "Link"}
        </a>
      )}
    </article>
  );
}

function shortSection(section: HotspotSectionId): string {
  if (section === "existing_founders") return "Existing founders";
  if (section === "startups") return "Startups";
  return "Potential founders";
}

function PagerLink({ href, children }: { href: string | null; children: string }) {
  const className = "inline-flex min-h-11 items-center justify-center rounded-md border border-border-c bg-white px-3 text-sm font-medium text-foreground hover:bg-surface";
  if (!href) {
    return (
      <button type="button" disabled className={`${className} cursor-not-allowed text-muted hover:bg-white`}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="min-h-11 max-w-full rounded-md border border-border-c bg-white px-2 text-base text-foreground sm:min-h-0 sm:max-w-[11rem] sm:py-1 sm:text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-2.5 py-1.5 text-xs sm:py-0.5 ${on ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}
