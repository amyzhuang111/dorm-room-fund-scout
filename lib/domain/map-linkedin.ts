// LinkedIn target for a person node already on the map. Confirmed and
// unverified URLs are stored on the node. Everyone else gets a people search
// built from the name plus the campus and company already drawn on the map.

import type { MapGraph, MapNode } from "./network-map";
import { linkedinActionFromStored, type LinkedInAction } from "./person-link";

export function buildPersonLinkedInLookup(graph: MapGraph): (node: MapNode) => LinkedInAction {
  const label = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const company = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.type !== "founded" || company.has(edge.source)) continue;
    const name = label.get(edge.target);
    if (name) company.set(edge.source, name);
  }
  return (node: MapNode) => {
    const ids = node.campuses?.length ? node.campuses : node.campus ? [node.campus] : [];
    const school = ids
      .map((id) => label.get(id))
      .filter((item): item is string => !!item)
      .join(" · ");
    return linkedinActionFromStored({
      name: node.label,
      linkedinUrl: node.linkedinUrl,
      linkedinStatus: node.linkedinStatus ?? null,
      school: school || null,
      company: company.get(node.id) ?? null,
    });
  };
}
