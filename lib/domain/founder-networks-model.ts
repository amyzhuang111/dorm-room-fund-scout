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
  type: "network" | "company";
  label: string;
  kind: NetworkKind | null;
  size: number;
  x: number;
  y: number;
  companyId: string | null;
  networkId: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "network_tie" | "cofounder";
  /** Provenance key, e.g. claims.program_membership */
  sourceKey: string;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  edgeCounts: Record<string, number>;
  generatedAt: string;
}

export interface FounderNetworksPage {
  generatedAt: string;
  corpusCompanies: number;
  founderRule: string;
  totals: {
    networks: number;
    founderLinks: number;
    companiesLinked: number;
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
}
