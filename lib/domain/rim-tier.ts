// Which structural nodes sit on the outer rim of the network map.
//
// Tiers come from PROGRAM_DIRECTORY when the node name is one of those
// programs. Every other name, including the Thiel Fellowship, uses the
// hotspot card in data/imports/campus_hotspots.csv. Thiel's card is S+.
// These are scouting notes for source priority. They decide rim placement,
// node size, and which labels are on by default. They are not Founder
// Signal and they do not change scores.

import { hotspotCards } from "./hotspots";
import { bestCard, placeKeyOf, type HotspotCard, type HotspotPlaceKind, type HotspotTier } from "./hotspot-model";
import { PROGRAM_DIRECTORY, PROGRAM_SIGNAL_LABEL, PROGRAM_SIGNAL_TYPES } from "./program-signals";

export type RimBand = "outer" | "inward";
/** Same letters as the hotspot directory, including S+. Not Founder Signal. */
export type RimTier = HotspotTier;

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

function namesMatch(key: string, phrase: string): boolean {
  if (!key || !phrase) return false;
  if (key === phrase || key.startsWith(`${phrase} `) || key.endsWith(` ${phrase}`)) return true;
  if (key === `${phrase}s` || phrase === `${key}s`) return true;
  if (key.startsWith(`${phrase}s `) || key.endsWith(` ${phrase}s`)) return true;
  return false;
}

/** Tier from PROGRAM_DIRECTORY. The longest matching program name wins. */
function directoryTier(label: string): HotspotTier | null {
  const key = placeKeyOf(label);
  let best: { tier: HotspotTier; length: number } | null = null;
  for (const program of PROGRAM_SIGNAL_TYPES) {
    const phrase = placeKeyOf(PROGRAM_SIGNAL_LABEL[program]);
    if (!namesMatch(key, phrase)) continue;
    if (!best || phrase.length > best.length) best = { tier: PROGRAM_DIRECTORY[program].tier, length: phrase.length };
  }
  return best?.tier ?? null;
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
  /**
   * S+ is the lead program on the far rim. S is the tier-1 ring.
   * A stays on the outer rim, smaller and a step closer in.
   */
  tier: RimTier;
}

function isOuterTier(tier: HotspotTier | null): tier is "S+" | "S" | "A" {
  return tier === "S+" || tier === "S" || tier === "A";
}

/**
 * `outer` — S+/S/A fellowships and cross-campus S+/S/A accelerators, plus
 * directory programs at those tiers. Labeled and on the outer rim. Thiel
 * Fellowship is S+ because its hotspot card is S+. Z Fellows is directory A,
 * so it stays outside the cloud and behind the tier-1 ring.
 * `inward` — B/C/D programs, hackathon organising teams, clubs, and campus
 * accelerators such as SkyDeck, UC LAUNCH, and delta v. Smaller, muted, unlabeled.
 * `null` — no rim treatment (people, startups, campuses, and small low-tier nodes).
 */
export function rimPlacementFor(input: RimInput): RimPlacement | null {
  if (input.nodeType !== "organization" && input.nodeType !== "program" && input.nodeType !== "investor") return null;
  const listed = directoryTier(input.label);
  const profile = lookup(input.label);
  if (input.nodeType === "investor" && profile && !investorUsesProfile(profile.type)) {
    if (isOuterTier(listed) && input.degree >= OUTER_MIN_LINKS) return { band: "outer", tier: listed };
    return null;
  }
  const tier = listed ?? profile?.tier ?? null;
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
  const top = isOuterTier(listed) || (isOuterTier(tier) && (isFellowship(type) || isNationalAccelerator(type, placeKind)));
  if (top && isOuterTier(tier) && input.degree >= OUTER_MIN_LINKS) return { band: "outer", tier };
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
  rimTier?: RimTier | null;
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
