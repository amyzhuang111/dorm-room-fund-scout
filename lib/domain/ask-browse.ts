import { CAMPUSES } from "@/lib/domain/campuses";
import { browseHref, emptyFacets, type FacetState } from "@/lib/domain/facet-url";
import type { AskIntent, AskStage } from "@/lib/domain/ask-intent";
import { SECTORS } from "@/lib/domain/sectors";

const STAGE_LABEL: Record<AskStage, string> = {
  "pre-seed": "Pre-seed",
  angel: "Angel",
  seed: "Seed",
  "series a": "Series A",
  "series b": "Series B",
  "series c": "Series C",
  "series d": "Series D",
  "series e": "Series E",
  bootstrapped: "Bootstrapped",
  unfunded: "Unfunded",
};

/** Hand aliases → real facet ids from SECTORS (ids use underscores). */
const SECTOR_ALIASES: Record<string, string> = {
  ai: "ai_agents",
  "ai agent": "ai_agents",
  "ai agents": "ai_agents",
  "ai app": "ai_agents",
  "ai apps": "ai_agents",
  "ai-agents": "ai_agents",
  "ai_agents": "ai_agents",
  robotics: "robotics_hardware",
  robot: "robotics_hardware",
  robots: "robotics_hardware",
  hardware: "robotics_hardware",
  "robotics hardware": "robotics_hardware",
  "robotics/hardware": "robotics_hardware",
  "robotics-hardware": "robotics_hardware",
  climate: "climate_energy",
  energy: "climate_energy",
  "climate energy": "climate_energy",
  crypto: "crypto_web3",
  web3: "crypto_web3",
  blockchain: "crypto_web3",
  healthcare: "healthtech",
  health: "healthtech",
  "health tech": "healthtech",
  "dev tools": "dev_tools",
  devtools: "dev_tools",
  "dev-tools": "dev_tools",
  saas: "enterprise_saas",
  enterprise: "enterprise_saas",
  "enterprise saas": "enterprise_saas",
};

function normKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build alias → id map from the live SECTORS list, then layer hand aliases. */
export function buildSectorFacetAliasMap(
  sectors: { id: string; label: string }[] = SECTORS,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const sector of sectors) {
    map.set(normKey(sector.id), sector.id);
    map.set(sector.id.toLowerCase(), sector.id);
    map.set(normKey(sector.label), sector.id);
    // "AI agents/apps" → "ai agents", "ai agents apps"
    const labelBits = sector.label.toLowerCase().split(/[\/,]/).map((b) => b.trim()).filter(Boolean);
    for (const bit of labelBits) map.set(normKey(bit), sector.id);
    // id tokens: robotics_hardware → robotics, hardware
    const idBits = sector.id.split("_").filter(Boolean);
    if (idBits.length > 1) {
      // Prefer first token only when unique enough (≥5 chars) — filled below after pass
      map.set(normKey(idBits.join(" ")), sector.id);
    }
  }
  for (const [alias, id] of Object.entries(SECTOR_ALIASES)) {
    if (sectors.some((s) => s.id === id)) map.set(normKey(alias), id);
  }
  // First-token shortcuts when unambiguous among SECTORS
  const firstTokenOwners = new Map<string, string[]>();
  for (const sector of sectors) {
    const first = sector.id.split("_")[0]!;
    if (first.length < 4) continue;
    const list = firstTokenOwners.get(first) ?? [];
    list.push(sector.id);
    firstTokenOwners.set(first, list);
  }
  for (const [token, ids] of firstTokenOwners) {
    if (ids.length === 1 && !map.has(token)) map.set(token, ids[0]!);
  }
  return map;
}

const SECTOR_FACET_ALIASES = buildSectorFacetAliasMap();

/** Map NL / Ask sector tokens onto real FacetRail sector ids (e.g. ai_agents). */
export function resolveSectorFacetId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normKey(raw);
  if (!key) return null;
  const hit = SECTOR_FACET_ALIASES.get(key);
  if (hit) return hit;
  // Underscore form of the raw string
  const asId = raw.toLowerCase().replace(/[-\s]+/g, "_");
  if (SECTORS.some((s) => s.id === asId)) return asId;
  return null;
}

function campusIdFromLabel(label: string | null): string | null {
  if (!label) return null;
  const needle = label.toLowerCase();
  const hit = CAMPUSES.find(
    (c) =>
      c.shortLabel.toLowerCase() === needle ||
      c.name.toLowerCase() === needle ||
      c.aliases.some((a) => a.toLowerCase() === needle),
  );
  return hit?.id ?? null;
}

/**
 * Text residual for the Companies q= param.
 * Named company/founder wins. Structural filters (campus/stage/sector/year)
 * must not also dump the raw NL string into q (that AND-zeros the desk).
 */
export function browseQueryFromAskIntent(intent: AskIntent, queryFallback = ""): string {
  // Explicit company/founder names only — residual intent.name is leftover NL after
  // facet tokens (e.g. "agents" from "Stanford AI agents") and must not become q=.
  const named = (intent.companyName || intent.founderName || "").trim();
  if (named) return named;
  const structural = Boolean(intent.campus || intent.stage || intent.sector || intent.year);
  if (structural) return "";
  const residual = (intent.name || "").trim();
  if (residual) return residual;
  return queryFallback.trim();
}

/**
 * Year in NL often over-constrains Open filtered (Berkeley Seed 2024 → 0).
 * Keep year only when it is the main structural filter (no stage).
 */
export function browseYearFromAskIntent(intent: AskIntent): number | null {
  if (intent.year == null) return null;
  if (intent.stage) return null;
  return intent.year;
}

/** Build a shareable Companies URL from a parsed Ask intent. */
export function browseHrefFromAskIntent(intent: AskIntent, queryFallback = ""): string {
  const facets: FacetState = {
    ...emptyFacets(),
    campus: campusIdFromLabel(intent.campus),
    stage: intent.stage ? STAGE_LABEL[intent.stage] ?? null : null,
    sector: resolveSectorFacetId(intent.sector),
    foundedYear: browseYearFromAskIntent(intent),
    query: browseQueryFromAskIntent(intent, queryFallback),
  };
  return browseHref({ facets });
}

export function askIntentHasBrowseFilters(intent: AskIntent): boolean {
  return Boolean(
    intent.campus ||
      intent.stage ||
      intent.sector ||
      intent.year ||
      intent.companyName ||
      intent.founderName ||
      intent.name,
  );
}
