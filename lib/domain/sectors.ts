// Finer startup verticals. A tag is applied only when the company's own
// description text matches. Boilerplate directory sentences are ignored.
// Several tags can match; one is primary.

export interface SectorDef {
  id: string;
  label: string;
  /** Higher wins when several tags match and none is a combined "vertical AI" case. */
  specificity: number;
  patterns: RegExp[];
}

export const SECTORS: SectorDef[] = [
  { id: "ai_infra", label: "AI Infra", specificity: 8, patterns: [/\b(ai infrastructure|foundation model|model inference|gpu cluster|vector database|llm infrastructure|training cluster)\b/i] },
  { id: "ai_agents", label: "AI Agents/Apps", specificity: 7, patterns: [/\b(ai agent|ai agents|copilot|generative ai|large language model|\bllms?\b|chatgpt|ai assistant|ai[- ]powered|ai[- ]native|ai[- ]based|ai tool|ai platform|ai for\b|machine learning|\bml model)\b/i, /\bcon ia\b/i] },
  { id: "vertical_ai", label: "Vertical AI", specificity: 9, patterns: [] },
  { id: "dev_tools", label: "Dev Tools", specificity: 6, patterns: [/\b(developer tool|devtool|devtools|software development kit|\bsdk\b|ci\/cd|ide\b|code review|debugging tool|api platform|developer platform)\b/i] },
  { id: "data_infra", label: "Data/Infra", specificity: 6, patterns: [/\b(data infrastructure|data platform|data pipeline|etl\b|analytics platform|cloud infrastructure)\b/i] },
  { id: "cybersecurity", label: "Cybersecurity", specificity: 7, patterns: [/\b(cybersecurity|cyber security|zero-trust|authentication|infosec|threat detection)\b/i] },
  { id: "fintech", label: "Fintech", specificity: 6, patterns: [/\b(fintech|payments?|banking|lending|insurtech|neobank|financial services|financial compan(?:y|ies)|affiliate network for financial)\b/i] },
  { id: "crypto_web3", label: "Crypto/Web3", specificity: 7, patterns: [/\b(crypto|web3|blockchain|defi|nft)\b/i] },
  { id: "healthtech", label: "Healthtech", specificity: 6, patterns: [/\b(healthtech|health tech|healthcare|medical|clinical|patient|hospital|veterinary|diagnosis|therapeutic|digital health)\b/i] },
  { id: "biotech", label: "Biotech", specificity: 7, patterns: [/\b(biotech|biotechnology|genomics|gene therapy|crispr|drug discovery|protein characterization|flow cytometry|cytometry)\b/i] },
  { id: "medtech", label: "Medtech/Devices", specificity: 7, patterns: [/\b(medical device|medtech|implant|spirometer|diagnostic device|wearable health)\b/i] },
  { id: "climate_energy", label: "Climate/Energy", specificity: 6, patterns: [/\b(climate|clean energy|renewable|carbon|solar|battery storage|decarbon)\b/i] },
  { id: "robotics_hardware", label: "Robotics/Hardware", specificity: 7, patterns: [/\b(robot|robotics|hardware|sensor|drone|autonomous vehicle|manufacturing automation)\b/i] },
  { id: "defense_gov", label: "Defense/Gov", specificity: 7, patterns: [/\b(defense|defence|national security|government contract|dual-use|police communication)\b/i] },
  { id: "aerospace", label: "Aerospace", specificity: 7, patterns: [/\b(aerospace|satellite|space launch|orbital)\b/i] },
  { id: "edtech", label: "Edtech", specificity: 6, patterns: [/\b(edtech|education|classroom|tutoring|university students|learning platform|training platform|student)\b/i] },
  { id: "consumer", label: "Consumer", specificity: 3, patterns: [/\b(consumer brand|direct to consumer|d2c|skincare|sneaker|apparel|lifestyle brand|consumer app)\b/i] },
  { id: "marketplaces", label: "Marketplaces", specificity: 5, patterns: [/\b(marketplace|two-sided|buyers and sellers)\b/i] },
  { id: "ecommerce", label: "E-commerce", specificity: 5, patterns: [/\b(e-?commerce|online store|retail platform|shopify)\b/i] },
  { id: "enterprise_saas", label: "Enterprise SaaS", specificity: 4, patterns: [/\b(enterprise software|b2b saas|saas platform|workflow software|business productivity|customer support|onboarding)\b/i, /\bB2B\b/] },
  { id: "proptech", label: "Proptech", specificity: 6, patterns: [/\b(proptech|real estate|property management|housing)\b/i] },
  { id: "mobility", label: "Mobility", specificity: 6, patterns: [/\b(mobility|rideshare|logistics|fleet|last-mile|transportation)\b/i] },
  { id: "food_ag", label: "Food/Ag", specificity: 6, patterns: [/\b(food|restaurant|agriculture|agtech|farming|grocery|boba)\b/i] },
  { id: "media_creator", label: "Media/Creator", specificity: 5, patterns: [/\b(creator|content creator|media company|newsletter|podcast|virtual advertising|sports broadcast|live sports)\b/i] },
  { id: "social", label: "Social", specificity: 5, patterns: [/\b(social network|social app|community platform|dating)\b/i] },
  { id: "gaming", label: "Gaming", specificity: 6, patterns: [/\b(gaming|video game|esports|game studio)\b/i] },
  { id: "legal", label: "Legal", specificity: 6, patterns: [/\b(legaltech|legal tech|law firm|contract review|attorney|contract process)\b/i] },
  { id: "hr_work", label: "HR/Work", specificity: 6, patterns: [/\b(human resources|recruiting|hiring platform|workforce|hr tech|employee engagement)\b/i] },
];

const DOMAIN_IDS = new Set([
  "healthtech",
  "biotech",
  "medtech",
  "fintech",
  "edtech",
  "legal",
  "climate_energy",
  "food_ag",
  "proptech",
  "defense_gov",
  "hr_work",
]);

const BOILERPLATE = [
  /listed on berkeley skydeck/i,
  /skydeck['’]s public companies directory/i,
  /no founder name is on the card/i,
  /^mit delta v/i,
  /product\/sector not yet researched/i,
  /sector\/product description not yet researched/i,
  /^sector\/product description not yet/i,
  /startup challenge press release/i,
  /prize \(\$/i,
  /award \(\$/i,
];

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s.label]));
const SECTOR_BY_LABEL = new Map(
  SECTORS.flatMap((s) => {
    // Accept current and common legacy casings so stored label strings canonicalize.
    const keys = new Set([s.label.toLowerCase(), s.id.replace(/_/g, " "), s.id.replace(/_/g, "/")]);
    return [...keys].map((k) => [k, s.label] as const);
  }),
);

/** Canonical display label for a sector id or previously stored label string. */
export function sectorLabel(idOrLabel: string): string {
  const raw = idOrLabel.trim();
  if (!raw) return raw;
  return SECTOR_BY_ID.get(raw) ?? SECTOR_BY_LABEL.get(raw.toLowerCase()) ?? raw;
}

export function isBoilerplateDescription(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (t.length < 25) return true;
  if (BOILERPLATE.some((re) => re.test(t))) return true;
  // A press blurb that names several "founded by" teams is a shared list,
  // not one company's product description.
  const founded = t.match(/founded by/gi);
  return (founded?.length ?? 0) >= 2;
}

export interface SectorHit {
  tag: string;
  label: string;
  score: number;
  excerpt: string;
}

function windowAround(text: string, index: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + 120);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + slice + (end < text.length ? "…" : "");
}

export function classifyDescription(text: string | null | undefined, companyName?: string): SectorHit[] {
  let raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (isBoilerplateDescription(raw)) return [];
  if (companyName && companyName.trim().length > 2) {
    const escaped = companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    raw = raw.replace(new RegExp(escaped, "ig"), " ");
  }
  const hits: SectorHit[] = [];
  for (const sector of SECTORS) {
    if (sector.id === "vertical_ai") continue;
    let best: { score: number; index: number } | null = null;
    for (const pattern of sector.patterns) {
      const m = pattern.exec(raw);
      if (!m) continue;
      const score = sector.specificity + (m[0].length > 3 ? 1 : 0);
      if (!best || score > best.score) best = { score, index: m.index };
    }
    if (best) {
      hits.push({ tag: sector.id, label: sector.label, score: best.score, excerpt: windowAround(raw, best.index) });
    }
  }
  const hasAi = hits.some((h) => h.tag === "ai_infra" || h.tag === "ai_agents");
  const domain = hits.find((h) => DOMAIN_IDS.has(h.tag));
  if (hasAi && domain) {
    hits.push({
      tag: "vertical_ai",
      label: "Vertical AI",
      score: 12,
      excerpt: domain.excerpt,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return hits;
}

export function primaryTag(hits: SectorHit[]): SectorHit | null {
  return hits[0] ?? null;
}
