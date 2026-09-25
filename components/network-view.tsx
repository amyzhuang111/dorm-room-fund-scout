import { buildScoutNetwork } from "@/lib/domain/network";
import { NetworkCanvas } from "./network-canvas";
import type { UniversitySummary } from "@/lib/domain/queries";

export function NetworkView({
  universityId,
  basePath,
  current,
  universities,
}: {
  universityId: string | undefined;
  basePath: string;
  current: Record<string, string | undefined>;
  universities: UniversitySummary[];
}) {
  const graph = buildScoutNetwork(universityId);
  const campusName = universityId
    ? (universities.find((u) => u.id === universityId)?.name ?? "campus")
    : "Penn and Berkeley";

  if (graph.nodes.length === 0) {
    return <p className="p-6 text-sm text-muted">No evidence-backed connections on record for this campus yet.</p>;
  }

  return <NetworkCanvas graph={graph} basePath={basePath} current={current} campusName={campusName} />;
}
