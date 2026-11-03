// Which orgs sit in which half of a single-campus Discover network, and on
// which tier band. Tiers are scouting labels for source priority. They are
// not Founder Signal, eligibility, or an investment score.
//
// Internal: student clubs, campus accelerators and incubators, hackathons,
// entrepreneurship centers, and labs at that university.
// External: accelerators, fellowships, national programs, and funds that
// are not run by the campus. A campus row that is really one of those
// (Techstars, Pear, Prod, UC LAUNCH, a provincial program) is external
// even though the hotspot directory filed it under the school.

import fs from "node:fs";
import path from "node:path";
import { cardsFromRows, parseCsv, placeKeyOf, samePlace, type HotspotCard, type HotspotTier } from "./hotspot-model";

export type OrgZone = "internal" | "external";

export interface CampusOrg {
  key: string;
  label: string;
  zone: OrgZone;
  tier: HotspotTier;
  url?: string;
  aliases: string[];
}

const CSV_PATH = path.join(process.cwd(), "data", "imports", "campus_hotspots.csv");

const TIER_ORDER: HotspotTier[] = ["S+", "S", "A", "B", "C", "D"];

let cardCache: { stamp: string; cards: HotspotCard[] } | null = null;

export function campusOrgStamp(): string {
  try {
    const st = fs.statSync(CSV_PATH);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

export function campusOrgCards(): HotspotCard[] {
  const stamp = campusOrgStamp();
  if (cardCache?.stamp === stamp) return cardCache.cards;
  let cards: HotspotCard[] = [];
  try {
    cards = cardsFromRows(parseCsv(fs.readFileSync(CSV_PATH, "utf8")));
  } catch {
    cards = [];
  }
  cardCache = { stamp, cards };
  return cards;
}

/** Founder-side letter. Potential-founders section wins, then existing founders, then startups. */
export function founderTier(cards: HotspotCard[]): HotspotTier {
  const preferred = ["potential_founders", "existing_founders", "startups"] as const;
  for (const section of preferred) {
    const hit = cards.find((card) => card.section === section);
    if (hit) return hit.tier;
  }
  return cards[0]?.tier ?? "C";
}

function lockedTier(campusId: string, key: string): HotspotTier | null {
  if (campusId === "univ_berkeley") {
    if (key.startsWith("free ventures")) return "A";
    if (key.includes("cal hacks")) return "B";
    if (key === "entrepreneurs berkeley" || key === "entrepreneurs at berkeley") return "B";
    if (key.includes("web development at berkeley") || key === "web development") return "A";
    if (key.includes("skydeck")) return "C";
    if (key.includes("ai entrepreneurs")) return "A";
    if (key.includes("berkeley ai research") || key === "bair" || key.includes("bair")) return "A";
  }
  if (campusId === "univ_stanford" && key.includes("mayfield")) return "S";
  if (key.includes("stanford ai lab") || key.includes("sail incl")) return "A";
  if (key.includes("csail")) return "A";
  if (key.includes("robotics institute")) return "A";
  if (key.includes("machine learning department")) return "A";
  if (key.includes("grasp")) return "A";
  return null;
}

/** One node per family. Pear Garage and Pear Fellows are the same external program. */
export function groupKey(placeKey: string): string {
  if (placeKey.includes("skydeck")) return "berkeley skydeck";
  if (/(^| )pear( |$)/.test(placeKey)) return "pear";
  if (placeKey.includes("prod fellowship")) return "prod fellowship";
  if (placeKey.includes("gc venture") || placeKey.includes("rough draft")) return "gc venture fellows";
  if (placeKey === "y combinator" || placeKey.startsWith("y combinator ")) return "y combinator";
  if (placeKey.includes("a16z speedrun") || placeKey === "speedrun") return "a16z speedrun";
  return placeKey;
}

const CANONICAL: Record<string, { label: string; tier?: HotspotTier }> = {
  pear: { label: "Pear Fellows / Pear Garage", tier: "A" },
  "berkeley skydeck": { label: "Berkeley SkyDeck", tier: "C" },
  "y combinator": { label: "Y Combinator" },
  "a16z speedrun": { label: "a16z Speedrun" },
  "gc venture fellows": { label: "GC Venture Fellows" },
};

function namedExternal(key: string): boolean {
  const group = groupKey(key);
  if (group === "pear" || group === "prod fellowship" || group === "gc venture fellows") return true;
  if (key.includes("techstars")) return true;
  if (key.includes("uc launch")) return true;
  if (key.includes("lab2market")) return true;
  if (key.includes("summer company")) return true;
  if (key.includes("norcat")) return true;
  return false;
}

export function cardIsExternal(card: HotspotCard): boolean {
  if (card.placeKind === "other" || card.placeKind === "city") return true;
  return namedExternal(card.placeKey);
}

function campusCards(campusId: string, cards: HotspotCard[]): HotspotCard[] {
  if (campusId === "univ_cornell_tech") {
    return cards.filter((card) => card.campusId === "univ_cornell" && /cornell tech/i.test(card.place));
  }
  if (campusId === "univ_cornell") {
    return cards.filter((card) => card.campusId === "univ_cornell" && !/cornell tech/i.test(card.place));
  }
  return cards.filter((card) => card.campusId === campusId);
}

const SIGNAL_NEEDLE: Record<string, string> = {
  z_fellows: "z fellow",
  south_park_commons: "south park commons",
  emergent_ventures: "emergent ventures",
  contrary_venture_partners: "contrary venture",
  kleiner_perkins_fellows: "kleiner perkins",
  founders_inc: "founders inc",
  hf0: "hf0",
  the_residency: "the residency",
  agi_house: "agi house",
  frontier_tower: "frontier tower",
  yale_hacker_house: "yale hacker house",
  farmhouse: "farmhouse",
  gatech_hacker_house: "georgia tech hacker house",
  rice_residency: "rice residency",
  foundher_house: "foundher",
  playa_house: "playa house",
  harvard_st_commons: "harvard st",
  medici_1517: "1517",
  pioneer: "pioneer",
  afore_fir_u: "afore",
  buildspace: "buildspace",
};

function campusLabel(campusId: string): string {
  const campus = campusId.replace(/^univ_/, "").replace(/_/g, " ");
  if (campus === "berkeley") return "berkeley";
  if (campus === "penn") return "penn";
  if (campus === "cmu") return "cmu";
  return campus;
}

function cityNamesCampus(card: HotspotCard, campusId: string): boolean {
  if (card.placeKind !== "city") return false;
  const label = campusLabel(campusId);
  if (label.length < 4) return false;
  return placeKeyOf(card.place).includes(label);
}

function shortestLabel(cards: HotspotCard[]): string {
  return [...cards].sort((a, b) => coreLen(a.place) - coreLen(b.place) || a.place.localeCompare(b.place))[0]?.place ?? "";
}

function coreLen(place: string): number {
  return place.replace(/\s*\([^)]*\)\s*/g, " ").trim().length;
}

function pickUrl(cards: HotspotCard[]): string | undefined {
  const http = cards.map((card) => card.url).filter((url) => url.startsWith("http"));
  return http[0];
}

export function orgsForCampus(campusId: string, allCards: HotspotCard[], evidenceSignals: string[] = []): CampusOrg[] {
  const local = campusCards(campusId, allCards);
  const national = allCards.filter((card) => card.placeKind === "other");
  const city = allCards.filter((card) => cityNamesCampus(card, campusId));
  const evidence: HotspotCard[] = [];
  for (const signal of evidenceSignals) {
    const needle = SIGNAL_NEEDLE[signal];
    if (!needle) continue;
    const hits = allCards.filter((card) => card.placeKey.includes(needle));
    if (hits.length === 0) continue;
    evidence.push(hits[0]);
  }

  const groups = new Map<string, HotspotCard[]>();
  const add = (card: HotspotCard) => {
    const key = groupKey(card.placeKey);
    const list = groups.get(key) ?? [];
    list.push(card);
    groups.set(key, list);
  };
  for (const card of [...local, ...city, ...evidence, ...national]) add(card);

  const orgs: CampusOrg[] = [];
  for (const [key, list] of groups) {
    const unique = dedupeCards(list);
    const onCampus = unique.filter((card) => card.placeKind === "campus" && !namedExternal(card.placeKey));
    const zone: OrgZone = onCampus.length > 0 ? "internal" : "external";
    const tierCards = onCampus.length > 0 ? onCampus : unique;
    const canonical = CANONICAL[key];
    const tier = canonical?.tier ?? lockedTier(campusId, key) ?? lockedTier(campusId, unique[0]?.placeKey ?? key) ?? founderTier(tierCards);
    const label = canonical?.label || shortestLabel(tierCards.length ? tierCards : unique);
    if (!label) continue;
    const aliases = [...new Set([label, ...unique.map((card) => card.place)])];
    orgs.push({
      key,
      label,
      zone,
      tier,
      url: pickUrl(tierCards.length ? tierCards : unique),
      aliases,
    });
  }
  return orgs.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function dedupeCards(cards: HotspotCard[]): HotspotCard[] {
  const seen = new Set<string>();
  const out: HotspotCard[] = [];
  for (const card of cards) {
    const id = `${card.placeKey}|${card.section}|${card.campus}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(card);
  }
  return out;
}

export function orgMatchesLabel(org: CampusOrg, label: string): boolean {
  return org.aliases.some((alias) => samePlace(alias, label));
}

export function zoneWord(zone: OrgZone): string {
  return zone === "external" ? "Outside" : "On campus";
}
