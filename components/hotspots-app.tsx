"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignalTierBadge } from "./badges";
import type { HotspotEvent } from "@/lib/domain/hotspot-dates";
import {
  SECTION_LABEL,
  SECTION_ORDER,
  campusFilterLabels,
  compareCampuses,
  type HotspotCard,
  type HotspotSectionId,
  type HotspotTier,
} from "@/lib/domain/hotspot-model";

const TIERS: HotspotTier[] = ["S", "A", "B", "C", "D"];

export function HotspotsApp({
  cards,
  events,
  initial,
  universities,
}: {
  cards: HotspotCard[];
  events: HotspotEvent[];
  initial: Record<string, string | undefined>;
  universities: { id: string; name: string }[];
}) {
  const [tier, setTier] = useState<string>(initial.tier ?? "");
  const [section, setSection] = useState<string>(initial.section ?? "");
  const [type, setType] = useState<string>(initial.type ?? "");
  const [campus, setCampus] = useState<string>(initial.campus ?? "");
  const [city, setCity] = useState<string>(initial.city ?? "");
  const [q, setQ] = useState<string>(initial.q ?? "");

  const filters = useMemo(() => campusFilterLabels(cards, universities), [cards, universities]);
  const campuses = useMemo(() => [...filters.campuses, ...filters.programmes], [filters]);
  const cities = filters.cities;
  const types = useMemo(() => [...new Set(cards.map((card) => card.type).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [cards]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cards.filter((card) => {
      if (tier && card.tier !== tier) return false;
      if (section && card.section !== section) return false;
      if (type && card.type !== type) return false;
      if (campus && card.campus !== campus) return false;
      if (city && card.campus !== city) return false;
      if (!query) return true;
      const blob = `${card.place} ${card.campus} ${card.type} ${card.whatYoullFind} ${card.howToGetIn} ${card.when}`.toLowerCase();
      return blob.includes(query);
    });
  }, [cards, tier, section, type, campus, city, q]);

  const groups = useMemo(() => {
    const ordered = [...visible].sort(compareCampuses);
    const out: { campus: string; cards: HotspotCard[] }[] = [];
    for (const card of ordered) {
      const last = out[out.length - 1];
      if (!last || last.campus !== card.campus) out.push({ campus: card.campus, cards: [card] });
      else last.cards.push(card);
    }
    return out;
  }, [visible]);

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
          {visible.length.toLocaleString()} of {cards.length.toLocaleString()} places
        </p>
      </div>

      {events.length > 0 && (
        <section className="mt-4 rounded-md border border-border-c bg-surface p-3">
          <h2 className="text-sm font-medium text-foreground">Upcoming events</h2>
          <ul className="mt-2 divide-y divide-border-c">
            {events.map((event) => (
              <li key={`${event.date}-${event.event}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="shrink-0 text-xs font-medium text-muted sm:w-56">{event.date}</span>
                <span className="min-w-0 text-sm text-foreground">
                  {event.url ? (
                    <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                      {event.event}
                    </a>
                  ) : (
                    event.event
                  )}
                  {event.where && <span className="text-muted"> · {event.where}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky top-14 z-10 mt-4 space-y-2 border-b border-border-c bg-background py-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search places"
            aria-label="Search hotspots"
            className="w-48 rounded-md border border-border-c bg-white px-2.5 py-1 text-sm"
          />
          <Select label="Campus" value={campus} onChange={setCampus} options={campuses} />
          <Select label="City" value={city} onChange={setCity} options={cities} />
          <Select label="Type" value={type} onChange={setType} options={types} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Chip on={tier === ""} label="All tiers" onClick={() => setTier("")} />
          {TIERS.map((item) => (
            <Chip key={item} on={tier === item} label={item} onClick={() => setTier(tier === item ? "" : item)} />
          ))}
          <span className="mx-1 h-4 w-px bg-border-c" />
          <Chip on={section === ""} label="All sections" onClick={() => setSection("")} />
          {SECTION_ORDER.map((item) => (
            <Chip key={item} on={section === item} label={shortSection(item)} onClick={() => setSection(section === item ? "" : item)} />
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="mt-6 text-sm text-muted">No places match these filters.</p>}

      <div className="mt-4 space-y-8">
        {groups.map((group) => (
          <section key={group.campus}>
            <h2 className="text-lg text-foreground">
              {group.campus}
              <span className="ml-2 text-xs font-medium text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                {group.cards.length}
              </span>
            </h2>
            {SECTION_ORDER.map((sectionId) => {
              const rows = group.cards.filter((card) => card.section === sectionId);
              if (rows.length === 0) return null;
              return (
                <div key={sectionId} className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{SECTION_LABEL[sectionId]}</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {rows.map((card) => (
                      <li key={card.id}>
                        <article id={card.id} className="h-full scroll-mt-36 rounded-md border border-border-c bg-surface p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-medium text-foreground">{card.place}</h4>
                              <p className="mt-0.5 text-xs text-muted">{card.type}</p>
                              {card.tierRationale && <p className="mt-1 text-xs text-muted">{card.tierRationale}</p>}
                            </div>
                            <SignalTierBadge tier={card.tier} />
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
                              {card.when}
                            </p>
                          )}
                          {card.url && (
                            <a href={card.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-link hover:underline">
                              {card.linkLabel || "Link"}
                            </a>
                          )}
                        </article>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted">
        <Link href="/founder/network?from=founder" className="text-link hover:underline">
          Network map
        </Link>
      </p>
    </div>
  );
}

function shortSection(section: HotspotSectionId): string {
  if (section === "existing_founders") return "Existing founders";
  if (section === "startups") return "Startups";
  return "Potential founders";
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="max-w-[11rem] rounded-md border border-border-c bg-white px-2 py-1 text-sm text-foreground">
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
      className={`rounded-full px-2.5 py-0.5 text-xs ${on ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}
