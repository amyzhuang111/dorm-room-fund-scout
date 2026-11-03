import type { NetworkKind, NetworkMember, NetworkSummary } from "./founder-networks-model";

export type NetworkSearchResult = {
  network: NetworkSummary;
  /** Name match shows the full roster; member match shows the matching people. */
  nameMatch: boolean;
  matchingMembers: NetworkMember[];
  /** 0 exact, 1 starts-with, 2 label contains, 3 roster member. */
  rank: number;
};

function normalized(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").trim();
}

/**
 * Match real, stored member links, not just network labels. Searching for
 * a founder, company, campus, or stage should return the relevant program.
 * An empty query preserves the pre-ranked network order.
 */
export function searchFounderNetworks(
  networks: NetworkSummary[],
  rosters: Record<string, NetworkMember[]>,
  query: string,
  kind: NetworkKind | "all" = "all",
): NetworkSearchResult[] {
  const term = normalized(query);
  const matches: NetworkSearchResult[] = [];
  for (const network of networks) {
    if (kind !== "all" && network.kind !== kind) continue;
    const roster = rosters[network.id] ?? [];
    const label = normalized(network.label);
    const nameMatch = !term || label.includes(term);
    const matchingMembers = !term || nameMatch
      ? roster
      : roster.filter((member) =>
        [member.founderName, member.companyName, member.campusLabel ?? "", member.stage ?? ""]
          .some((value) => normalized(value).includes(term))
      );
    if (!nameMatch && matchingMembers.length === 0) continue;
    const rank = !term ? 0 : label === term ? 0 : label.startsWith(term) ? 1 : nameMatch ? 2 : 3;
    matches.push({ network, nameMatch, matchingMembers, rank });
  }
  if (term) matches.sort((a, b) => a.rank - b.rank || b.matchingMembers.length - a.matchingMembers.length || b.network.founderCount - a.network.founderCount || a.network.label.localeCompare(b.network.label));
  return matches;
}

export function selectedNetworkMembers(
  selectedId: string | null,
  search: NetworkSearchResult[],
  rosters: Record<string, NetworkMember[]>,
): NetworkMember[] {
  if (!selectedId) return [];
  const match = search.find((item) => item.network.id === selectedId);
  return match ? match.matchingMembers : rosters[selectedId] ?? [];
}
