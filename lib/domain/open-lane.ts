import type { FounderLead } from "./founder-index";
import { investorFactIsTopVc } from "./national-programs";

/** Signal types that count as strong. Order is the public definition order. */
export const OPEN_LANE_STRONG_SIGNAL_TYPES = ["funding", "launch", "accelerator", "award"] as const;

const STRONG = new Set<string>(OPEN_LANE_STRONG_SIGNAL_TYPES);

/**
 * Named peer funds / accelerators that close the open lane alongside top VCs.
 * Labels are the public wording; the matcher below must stay aligned with them.
 */
export const OPEN_LANE_TOP_ACCELERATOR_LABELS = ["YC", "Thiel", "a16z Speedrun", "Neo"] as const;

/** YC and peer national funds that are not TOP_VC phrases but close the open lane. */
function isTopAcceleratorFund(raw: string): boolean {
  return /y\s*combinator|\bthiel\b|a16z\s*speedrun|\bspeedrun\b|\bneo\b/i.test(raw);
}

export function founderHasTopFund(founder: FounderLead): boolean {
  for (const program of founder.programs) {
    if (investorFactIsTopVc(program) || isTopAcceleratorFund(program)) return true;
  }
  return false;
}

export function founderIsStrong(founder: FounderLead): boolean {
  return founder.signalTypes.some((type) => STRONG.has(type));
}

/** Linked company id is one of the investable Scout desk companies (the shared investable desk). */
export function founderCompanyOnInvestableDesk(
  founder: FounderLead,
  investableCompanyIds: ReadonlySet<string>,
): boolean {
  const id = founder.companyId?.trim();
  return Boolean(id && investableCompanyIds.has(id));
}

/**
 * Strong signal, no top fund or top accelerator, and company on the investable desk.
 * Callers must pass the live investable id set so hero, deck, segments, and checks stay aligned.
 */
export function founderIsOpenLane(
  founder: FounderLead,
  investableCompanyIds: ReadonlySet<string>,
): boolean {
  return (
    founderIsStrong(founder) &&
    !founderHasTopFund(founder) &&
    founderCompanyOnInvestableDesk(founder, investableCompanyIds)
  );
}

export type OpenLaneCampus = { id: string; name: string; founders: number };

export type OpenLaneShell = {
  count: number;
  strong: number;
  campuses: OpenLaneCampus[];
};

/**
 * Open-lane count and campus ranks. Strong is still the full strong-signal tally;
 * open-lane membership requires an investable company id.
 */
export function buildOpenLaneShell(
  founders: FounderLead[],
  investableCompanyIds: ReadonlySet<string>,
  campusLimit = 5,
): OpenLaneShell {
  let strong = 0;
  let count = 0;
  const byCampus = new Map<string, OpenLaneCampus>();
  for (const founder of founders) {
    if (!founderIsStrong(founder)) continue;
    strong += 1;
    if (!founderIsOpenLane(founder, investableCompanyIds)) continue;
    count += 1;
    const id = founder.campusId?.trim() || "missing";
    if (id === "missing") continue;
    const name = founder.campus?.trim() || "Campus missing";
    const row = byCampus.get(id) ?? { id, name, founders: 0 };
    row.founders += 1;
    byCampus.set(id, row);
  }
  const campuses = [...byCampus.values()]
    .sort((a, b) => b.founders - a.founders || a.name.localeCompare(b.name))
    .slice(0, campusLimit);
  return { count, strong, campuses };
}

function joinPlainList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  // No Oxford comma: "a, b, c or d" (plain words, no dashes).
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** Plain words. No dashes. Generated from OPEN_LANE_STRONG_SIGNAL_TYPES. */
export function openLaneStrongDefinition(): string {
  return `Strong means a ${joinPlainList(OPEN_LANE_STRONG_SIGNAL_TYPES)} signal.`;
}

/**
 * Plain words. No dashes. Top VC via investorFactIsTopVc; peers from OPEN_LANE_TOP_ACCELERATOR_LABELS.
 */
export function openLaneTopFundDefinition(): string {
  return `Top fund means a top VC, ${joinPlainList(OPEN_LANE_TOP_ACCELERATOR_LABELS)}.`;
}

/** Plain words. Open lane only counts founders linked to the investable Scout desk. */
export function openLaneDeskDefinition(): string {
  return "The company must sit on the investable desk.";
}

/** Full hero / methodology definition block. */
export function openLaneDefinitionText(): string {
  return `${openLaneStrongDefinition()} ${openLaneTopFundDefinition()} ${openLaneDeskDefinition()}`;
}
