// Build-time founder-networks graph + page payload.
// Writes public/data/founder-networks-graph.json and founder-networks-page.json.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { applyForceLayout, buildFounderNetworksGraph, buildFounderNetworksPage } from "../lib/domain/founder-networks";
import type { FounderNetworksPage } from "../lib/domain/founder-networks-model";

const dir = path.join(process.cwd(), "public", "data");
fs.mkdirSync(dir, { recursive: true });

const started = performance.now();
const page = buildFounderNetworksPage();

// Client payload: keep members, drop founderIds from matrix cells (counts only).
const clientPage: FounderNetworksPage = {
  ...page,
  matrix: {
    ...page.matrix,
    rows: page.matrix.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ count: cell.count, founderIds: [] })),
      all: { count: row.all.count, founderIds: [] },
    })),
  },
};

const graph = applyForceLayout(buildFounderNetworksGraph());
const graphFile = path.join(dir, "founder-networks-graph.json");
const pageFile = path.join(dir, "founder-networks-page.json");
const graphJson = JSON.stringify(graph);
const pageJson = JSON.stringify(clientPage);
fs.writeFileSync(graphFile, graphJson);
fs.writeFileSync(pageFile, pageJson);

const summary = {
  networks: page.totals.networks,
  founderLinks: page.totals.founderLinks,
  companiesLinked: page.totals.companiesLinked,
  foundersLinked: page.totals.foundersLinked,
  byKind: page.totals.byKind,
  bySourceKey: page.totals.bySourceKey,
  omitted: page.totals.omitted,
  graphNodes: graph.nodes.length,
  graphEdges: graph.edges.length,
  edgeCounts: graph.edgeCounts,
  pageKiB: Math.round(pageJson.length / 1024),
  graphKiB: Math.round(graphJson.length / 1024),
};
fs.writeFileSync(path.join(dir, "founder-networks-summary.json"), JSON.stringify(summary, null, 2));
console.log(
  `founder-networks-graph.json ${summary.graphKiB} KiB · ${graph.nodes.length} nodes · ${graph.edges.length} edges`
);
console.log(
  `founder-networks-page.json ${summary.pageKiB} KiB · ${page.totals.networks} networks · ${page.totals.founderLinks} links in ${(performance.now() - started).toFixed(0)} ms`
);
console.log(JSON.stringify(summary));
