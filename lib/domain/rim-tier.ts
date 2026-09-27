// Which structural nodes sit on the outer rim of the network map.
//
// Directory tiers (S/A/B/C/D) come from the hotspot cards in
// data/imports/campus_hotspots.csv. S is tier 1. These are scouting notes
// for source priority. They decide rim placement, node size, and which
// labels are on by default. They are not Founder Signal and they do not
// change scores.
//
// South Park Commons, Emergent Ventures, and HF0 are not rows in that file.
// STATIC_RIM_TIERS records them so a node with one of those names is treated
// as a top program. Every other name uses the directory card.

import { hotspotCards } from "./hotspots";
import { bestCard, placeKeyOf, type HotspotCard, type HotspotPlaceKind, type HotspotTier } from "./hotspot-model";

export type RimBand = "outer" | "inward";

/**
 * Programs the hotspot directory does not list. Tiers match the directory
 * scale: S is tier 1, A is tier 2. Placement and labels only.
 * South Park Commons, Emergent Ventures, and HF0 sit with Thiel and Y
 * Combinator on the tier-1 ring. Z Fellows is a directory A and is not listed
 * here.
 */
export const STATIC_RIM_TIERS: readonly { name: string; tier: HotspotTier }[] = [
  { name: "South Park Commons", tier: "S" },
  { name: "Emergent Ventures", tier: "S" },
  { name: "HF0", tier: "S" },
];

/** An S/A program needs only a couple of links before it takes an outer slot. */
export const OUTER_MIN_LINKS = 2;
/** Low-tier and local programs are pulled in once they are large enough to crowd the rim. */
export const INWARD_MIN_LINKS = 22;

const CAMPUS_PREFIXES = new Set([
  "mit",
  "stanford",
  "harvard",
  "penn",
  "berkeley",
  "uc berkeley",
  "ucla",
  "cmu",
  "caltech",
  "yale",
  "princeton",
  "columbia",
  "nyu",
  "waterloo",
]);

interface Profile {
  tier: HotspotTier;
  type: string;
  placeKind: HotspotPlaceKind;
  place: string;
}

let cached: Map<string, Profile> | null = null;

function profiles(): Map<string, Profile> {
  if (cached) return cached;
  const grouped = new Map<string, HotspotCard[]>();
  for (const card of hotspotCards()) {
    const list = grouped.get(card.placeKey) ?? [];
    list.push(card);
    grouped.set(card.placeKey, list);
  }
  const index = new Map<string, Profile>();
  for (const [key, cards] of grouped) {
    const card = bestCard(cards);
    index.set(key, { tier: card.tier, type: card.type, placeKind: card.placeKind, place: card.place });
  }
  cached = index;
  return index;
}

function aligned(label: string, place: string): boolean {
  const left = placeKeyOf(label);
  const right = placeKeyOf(place);
  if (!left || !right) return false;
  if (left === right) return true;
  const longer = left.length >= right.length ? left : right;
  const shorter = left.length >= right.length ? right : left;
  if (!longer.endsWith(` ${shorter}`)) return false;
  const prefix = longer.slice(0, longer.length - shorter.length - 1);
  return CAMPUS_PREFIXES.has(prefix);
}

function lookup(label: string): Profile | null {
  const index = profiles();
  const exact = index.get(placeKeyOf(label));
  if (exact) return exact;
  let found: Profile | null = null;
  for (const profile of index.values()) {
    if (!aligned(label, profile.place)) continue;
    if (!found || profile.place.length > found.place.length) found = profile;
  }
  return found;
}

function staticTier(label: string): HotspotTier | null {
  const key = placeKeyOf(label);
  for (const row of STATIC_RIM_TIERS) {
    const phrase = placeKeyOf(row.name);
    if (key === phrase || key.startsWith(`${phrase} `) || key.endsWith(` ${phrase}`)) return row.tier;
  }
  return null;
}

function isHackathon(label: string, type: string): boolean {
  return /\bhackathon\b/i.test(type) || /\bhackathon\b/i.test(label) || /organi[sz]ing team/i.test(label);
}

function isClub(type: string): boolean {
  return /\bclub\b/i.test(type);
}

/** Campus accelerators stay inside the cloud. Cross-campus S/A accelerators do not. */
function isLocalAccelerator(type: string, placeKind: HotspotPlaceKind | null): boolean {
  return /accelerator/i.test(type) && placeKind !== "other";
}

function isFellowship(type: string): boolean {
  return /fellowship/i.test(type);
}

function isNationalAccelerator(type: string, placeKind: HotspotPlaceKind | null): boolean {
  return /accelerator/i.test(type) && placeKind === "other";
}

/** Investors share names with the fund and with campus chapters. Only program-shaped cards apply. */
function investorUsesProfile(type: string): boolean {
  return /fellowship|accelerator|hackathon|demo day|\bclub\b/i.test(type);
}

export interface RimInput {
  label: string;
  nodeType: string;
  degree: number;
}

export interface RimPlacement {
  band: RimBand;
  /** S is the far outer ring. A stays on the outer rim, smaller and a step closer in. */
  tier: HotspotTier;
}

/**
 * `outer` — S/A fellowships and cross-campus S/A accelerators, plus the static
 * top programs. Labeled and on the outer rim. Tier S is larger and further out
 * than tier A. Z Fellows is directory A, so it stays outside the cloud and
 * behind Thiel, Y Combinator, South Park Commons, Emergent Ventures, and HF0.
 * `inward` — B/C/D programs, hackathon organising teams, clubs, and campus
 * accelerators such as SkyDeck, UC LAUNCH, and delta v. Smaller, muted, unlabeled.
 * `null` — no rim treatment (people, startups, campuses, and small low-tier nodes).
 */
export function rimPlacementFor(input: RimInput): RimPlacement | null {
  if (input.nodeType !== "organization" && input.nodeType !== "program" && input.nodeType !== "investor") return null;
  const listed = staticTier(input.label);
  const profile = lookup(input.label);
  if (input.nodeType === "investor" && profile && !investorUsesProfile(profile.type)) {
    if ((listed === "S" || listed === "A") && input.degree >= OUTER_MIN_LINKS) return { band: "outer", tier: listed };
    return null;
  }
  const tier = profile?.tier ?? listed;
  const type = profile?.type ?? "";
  const placeKind = profile?.placeKind ?? null;
  const low =
    isHackathon(input.label, type) ||
    isClub(type) ||
    isLocalAccelerator(type, placeKind) ||
    /\bskydeck\b/i.test(input.label) ||
    placeKeyOf(input.label) === "uc launch" ||
    placeKeyOf(input.label).startsWith("uc launch ");
  if (low) return input.degree >= INWARD_MIN_LINKS ? { band: "inward", tier: tier ?? "C" } : null;
  const top =
    listed === "S" ||
    listed === "A" ||
    ((tier === "S" || tier === "A") && (isFellowship(type) || isNationalAccelerator(type, placeKind)));
  if (top && tier && (tier === "S" || tier === "A") && input.degree >= OUTER_MIN_LINKS) return { band: "outer", tier };
  if ((tier === "B" || tier === "C" || tier === "D") && input.degree >= INWARD_MIN_LINKS) return { band: "inward", tier };
  return null;
}

export function rimBandFor(input: RimInput): RimBand | null {
  return rimPlacementFor(input)?.band ?? null;
}

interface RimNode {
  id: string;
  type: string;
  label?: string;
  rimBand?: RimBand | null;
  rimTier?: HotspotTier | null;
}

/** One outer node per program name. The copy with more links keeps the rim. */
export function demoteDuplicateOuter<T extends RimNode>(nodes: T[], degree: Map<string, number>): void {
  const groups = new Map<string, T[]>();
  for (const node of nodes) {
    if (node.rimBand !== "outer" || !node.label) continue;
    const key = placeKeyOf(node.label);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => {
      const links = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
      if (links !== 0) return links;
      return typeRank(b.type) - typeRank(a.type) || a.id.localeCompare(b.id);
    });
    for (const extra of group.slice(1)) {
      extra.rimBand = "inward";
      extra.rimTier = null;
    }
  }
}

function typeRank(type: string): number {
  if (type === "organization") return 3;
  if (type === "program") return 2;
  return 1;
}
