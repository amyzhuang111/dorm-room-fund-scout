// Types for the /networks desk. Counts are directed founder links from a
// real program, accelerator, lab, or investor into an investable company.

export type NetworkKind = "accelerator" | "program" | "lab" | "investor";

export type ConcentrationBand = "Concentrated" | "Moderate" | "Broad";

/** Share of founder links held by the top 3 networks in a sector. */
export const CONCENTRATION_THRESHOLDS = {
  concentratedMin: 0.5,
  moderateMin: 0.35,
} as const;

export interface NetworkSummary {
  id: string;
  label: string;
  kind: NetworkKind;
  founderCount: number;
  companyCount: number;
  campusCount: number;
}

export interface NetworkMember {
  founderId: string;
  founderName: string;
  companyId: string;
  companyName: string;
  campusId: string | null;
  campusLabel: string | null;
  /** Funding stage when known (for roster sort). */
  stage: string | null;
}

export interface MatrixColumn {
  id: string;
  label: string;
}

export interface MatrixCell {
  count: number;
  founderIds: string[];
}

export interface MatrixRow {
  id: string;
  label: string;
  kind: NetworkKind;
  cells: MatrixCell[];
  all: MatrixCell;
}

export interface SectorConcentration {
  sectorId: string;
  label: string;
  founderLinks: number;
  top3Share: number;
  band: ConcentrationBand;
  top3: { id: string; label: string; count: number }[];
  sourceCount: number;
}

export interface GraphNode {
  id: string;
  type: "network" | "company" | "founder";
  label: string;
  kind: NetworkKind | null;
  size: number;
  x: number;
  y: number;
  companyId: string | null;
  founderId: string | null;
  networkId: string | null;
  /** Primary network for a company or founder node (layout parent). */
  parentNetworkId: string | null;
  /** Soft hull / glow radius for network nodes. */
  clusterR: number;
  /** Palette index 0..n for tinted glows and dots. */
  hue: number;
  /** Rank among networks by founder count (1 = largest). */
  rank: number;
  /** Home campus for founder (or company primary) coloring. */
  campusId: string | null;
  campusLabel: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "network_tie" | "cofounder" | "founder_company" | "network_founder";
  /** Provenance key, e.g. claims.program_membership */
  sourceKey: string;
  /** Winning claim or fact URL when available. */
  sourceUrl: string | null;
}

export interface GraphCluster {
  id: string;
  label: string;
  kind: NetworkKind;
  cx: number;
  cy: number;
  r: number;
  /** Screen-facing cloud radius from actual member hull (for local labels). */
  labelR: number;
  hue: number;
  rank: number;
  companyCount: number;
  founderCount: number;
  shownFounders: number;
  totalFounders: number;
  /** Short editorial callout for the largest few clusters. */
  callout: string | null;
}


/** Investor-facing founder hover card built from stored company and network ties. */
export interface GraphFounderDeal {
  founderId: string;
  founderName: string;
  companyId: string | null;
  companyName: string | null;
  /** Parsed funding stage when known; otherwise null (UI shows unknown). */
  stage: string | null;
  /** Program / accelerator / lab network labels already tied to this founder. */
  networks: string[];
  /** Investor labels from company_facts.investor (may be empty). */
  investors: string[];
  /** True when a curated top fund or crowded pathway already appears on the company. */
  hasTopFund: boolean;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  edgeCounts: Record<string, number>;
  generatedAt: string;
  layout: "packed-glow";
  sample: { topNetworks: number; maxCompaniesPerNetwork: number; maxFoundersPerNetwork: number };
  /** Founder id → deal-flow hover facts. */
  founderDeals: Record<string, GraphFounderDeal>;
  /** Company id → true when not yet backed by a curated top fund. */
  uncrowdedCompanyIds: string[];
}

export interface FounderNetworksPage {
  generatedAt: string;
  corpusCompanies: number;
  founderRule: string;
  totals: {
    networks: number;
    founderLinks: number;
    /** Shared company total for hero + stats strip (same value as companiesLinked). */
    companyTotal: number;
    companiesLinked: number;
    /** Full investable corpus size; companyTotal is a share of this. */
    corpusCompanies: number;
    foundersLinked: number;
    byKind: Record<NetworkKind, number>;
    bySourceKey: Record<string, number>;
    omitted: { kind: string; reason: string }[];
  };
  topNetworks: NetworkSummary[];
  membersByNetwork: Record<string, NetworkMember[]>;
  matrix: {
    columns: MatrixColumn[];
    rows: MatrixRow[];
    caption: string;
  };
  concentration: {
    rows: SectorConcentration[];
    thresholdsNote: string;
    excludedNote: string;
  };
  howItWorks: string[];
  graphPath: string;
  /** Investor-kind networks ranked by campus founders reached. */
  investorHubs: NetworkSummary[];
  /** Definition of the top-fund highlight used on the graph. */
  topFundNote: string;
}
