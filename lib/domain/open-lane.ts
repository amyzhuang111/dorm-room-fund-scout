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

/** Strong signal, no top fund or top accelerator on the founder record. */
export function founderIsOpenLane(founder: FounderLead): boolean {
  return founderIsStrong(founder) && !founderHasTopFund(founder);
}

export type OpenLaneCampus = { id: string; name: string; founders: number };

export type OpenLaneShell = {
  count: number;
  strong: number;
  campuses: OpenLaneCampus[];
};

export function buildOpenLaneShell(founders: FounderLead[], campusLimit = 5): OpenLaneShell {
  let strong = 0;
  let count = 0;
  const byCampus = new Map<string, OpenLaneCampus>();
  for (const founder of founders) {
    if (!founderIsStrong(founder)) continue;
    strong += 1;
    if (!founderIsOpenLane(founder)) continue;
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

/** Full hero / methodology definition block (two sentences). */
export function openLaneDefinitionText(): string {
  return `${openLaneStrongDefinition()} ${openLaneTopFundDefinition()}`;
}
