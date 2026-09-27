// Records Ask AI is allowed to show. Every hit is a row the query layer
// loaded from SQLite. The model never supplies these objects.

export type AskKind = "person" | "startup" | "organization" | "investor";

export interface AskSource {
  label: string;
  url: string;
}

export interface AskHit {
  id: string;
  kind: AskKind;
  name: string;
  /** In-app record page. */
  href: string;
  detail: string;
  /** University ids used to mark campuses on the globe. */
  campuses: string[];
  /** Other graph nodes to keep visible with this hit (startups, orgs, investors, campuses). */
  relatedIds: string[];
  sources: AskSource[];
}

export interface AskToolResult {
  count: number;
  matches: AskHit[];
}
