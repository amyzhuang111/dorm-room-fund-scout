import { CAMPUSES } from "@/lib/domain/campuses";
import { browseHref, emptyFacets, type FacetState } from "@/lib/domain/facet-url";
import type { AskIntent, AskStage } from "@/lib/domain/ask-intent";

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

const SECTOR_ID: Record<string, string> = {
  fintech: "fintech",
  healthcare: "healthtech",
  healthtech: "healthtech",
  AI: "ai-agents",
  ai: "ai-agents",
  climate: "climate",
  edtech: "edtech",
  robotics: "robotics",
  crypto: "crypto",
  cybersecurity: "cybersecurity",
  "dev tools": "devtools",
};

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

/** Build a shareable Companies URL from a parsed Ask intent. */
export function browseHrefFromAskIntent(intent: AskIntent, queryFallback = ""): string {
  const facets: FacetState = {
    ...emptyFacets(),
    campus: campusIdFromLabel(intent.campus),
    stage: intent.stage ? STAGE_LABEL[intent.stage] ?? null : null,
    sector: intent.sector ? SECTOR_ID[intent.sector] ?? intent.sector.toLowerCase().replace(/\s+/g, "-") : null,
    foundedYear: intent.year,
    query: (intent.companyName || intent.founderName || intent.name || queryFallback || "").trim(),
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
