// Assembled company-profile facts. Each value is absent until a row with a
// source URL and excerpt exists. Callers show "Unknown" for nulls.

export interface SourcedValue {
  text: string;
  sourceUrl: string;
  excerpt: string;
  origin: string;
}

export interface FundingRound {
  stage: string | null;
  amountText: string | null;
  amountStatus: "announced" | "undisclosed" | null;
  date: string | null;
  leads: string[];
  sourceUrl: string;
  excerpt: string;
  origin: string;
}

export interface InvestorFact {
  name: string;
  batch: string | null;
  round: string | null;
  kind: string | null;
  sourceUrl: string;
  excerpt: string;
  origin: string;
}

export interface CompanyProfile {
  description: SourcedValue | null;
  foundedYear: SourcedValue | null;
  funding: SourcedValue | null;
  rounds: FundingRound[];
  investors: InvestorFact[];
  hq: SourcedValue | null;
  teamSize: SourcedValue | null;
  website: SourcedValue | null;
  companyLinkedin: SourcedValue | null;
}

export interface CompanyFactRecord {
  factKey: string;
  valueText: string;
  amountUsd: number | null;
  amountStatus: string | null;
  detailJson: string;
  sourceUrl: string;
  excerpt: string;
  origin: string;
}

export function emptyCompanyProfile(): CompanyProfile {
  return {
    description: null,
    foundedYear: null,
    funding: null,
    rounds: [],
    investors: [],
    hq: null,
    teamSize: null,
    website: null,
    companyLinkedin: null,
  };
}

function sourced(row: CompanyFactRecord): SourcedValue {
  return { text: row.valueText, sourceUrl: row.sourceUrl, excerpt: row.excerpt, origin: row.origin };
}

function detail(row: CompanyFactRecord): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.detailJson || "{}") as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

const STAGE_RANK: Record<string, number> = {
  "pre-seed": 1,
  seed: 2,
  "series a": 3,
  "series b": 4,
  "series c": 5,
  "series d": 6,
};

export function assembleCompanyProfile(rows: CompanyFactRecord[]): CompanyProfile {
  const profile = emptyCompanyProfile();
  for (const row of rows) {
    if (row.factKey === "description" && !profile.description) profile.description = sourced(row);
    else if (row.factKey === "founded_year" && !profile.foundedYear) profile.foundedYear = sourced(row);
    else if (row.factKey === "funding_total" && !profile.funding) profile.funding = sourced(row);
    else if (row.factKey === "hq" && !profile.hq) profile.hq = sourced(row);
    else if (row.factKey === "team_size" && !profile.teamSize) profile.teamSize = sourced(row);
    else if (row.factKey === "website" && !profile.website) profile.website = sourced(row);
    else if (row.factKey === "company_linkedin" && !profile.companyLinkedin) profile.companyLinkedin = sourced(row);
    else if (row.factKey === "funding_round") {
      const extra = detail(row);
      const status = row.amountStatus === "announced" || row.amountStatus === "undisclosed" ? row.amountStatus : null;
      profile.rounds.push({
        stage: asString(extra.stage),
        amountText: asString(extra.amountText) ?? (status === "undisclosed" ? "Undisclosed" : null),
        amountStatus: status,
        date: asString(extra.date),
        leads: asStrings(extra.leads),
        sourceUrl: row.sourceUrl,
        excerpt: row.excerpt,
        origin: row.origin,
      });
    } else if (row.factKey === "investor") {
      const extra = detail(row);
      profile.investors.push({
        name: row.valueText,
        batch: asString(extra.batch),
        round: asString(extra.round),
        kind: asString(extra.kind),
        sourceUrl: row.sourceUrl,
        excerpt: row.excerpt,
        origin: row.origin,
      });
    }
  }
  profile.rounds.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ar = STAGE_RANK[(a.stage ?? "").toLowerCase()] ?? 0;
    const br = STAGE_RANK[(b.stage ?? "").toLowerCase()] ?? 0;
    return br - ar;
  });
  return profile;
}

export function latestRound(profile: CompanyProfile): FundingRound | null {
  return profile.rounds[0] ?? null;
}

// The Funding line uses a stated total when one exists. Otherwise it shows the
// latest announced round amount. Undisclosed rounds stay Unknown.
export function displayedFunding(profile: CompanyProfile): SourcedValue | null {
  if (profile.funding) return profile.funding;
  const round = latestRound(profile);
  if (!round || round.amountStatus === "undisclosed" || !round.amountText || round.amountText === "Undisclosed") return null;
  const text = [round.stage, round.amountText].filter((part): part is string => !!part).join(" · ");
  if (!text) return null;
  return { text, sourceUrl: round.sourceUrl, excerpt: round.excerpt, origin: round.origin };
}

export function formatRound(round: FundingRound): string {
  const parts = [round.stage, round.amountText, round.date].filter((part): part is string => !!part);
  if (round.leads.length) parts.push(`led by ${round.leads.join(", ")}`);
  return parts.join(" · ");
}
