import { buildScoutNetwork } from "@/lib/domain/network";
import { domainKey, isHidden, type FeedbackRecord } from "@/lib/domain/feedback";
import { NetworkCanvas } from "./network-canvas";
import type { UniversitySummary } from "@/lib/domain/queries";

export function NetworkView({
  universityId,
  basePath,
  current,
  universities,
  feedback = [],
}: {
  universityId: string | undefined;
  basePath: string;
  current: Record<string, string | undefined>;
  universities: UniversitySummary[];
  feedback?: FeedbackRecord[];
}) {
  const graph = buildScoutNetwork(universityId, { sector: current.sector });
  const hiddenMode = current.feedback === "hidden";
  const nodes = graph.nodes.filter((n) => {
    if (n.type === "university") return true;
    const entityType = n.type === "person" ? "person" : "project";
    const hidden = isHidden(feedback, { entityType, entityId: n.id, name: n.label, domain: domainKey(n.linkUrl) });
    return hiddenMode ? hidden : !hidden;
  });
  const keep = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  const view = { ...graph, nodes, edges };
  const campusName = universityId
    ? (universities.find((u) => u.id === universityId)?.name ?? "campus")
    : "Penn and Berkeley";

  if (view.nodes.length === 0) {
    return <p className="p-6 text-sm text-muted">No evidence-backed connections on record for this campus yet.</p>;
  }

  return <NetworkCanvas graph={view} basePath={basePath} current={current} campusName={campusName} />;
}
