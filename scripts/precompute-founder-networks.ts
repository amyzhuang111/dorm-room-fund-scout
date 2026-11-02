// Build-time founder-networks graph. Writes public/data/founder-networks-graph.json.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { applyForceLayout, buildFounderNetworksGraph, buildFounderNetworksPage } from "../lib/domain/founder-networks";

const dir = path.join(process.cwd(), "public", "data");
fs.mkdirSync(dir, { recursive: true });

const started = performance.now();
const page = buildFounderNetworksPage();
const graph = applyForceLayout(buildFounderNetworksGraph());
const file = path.join(dir, "founder-networks-graph.json");
const json = JSON.stringify(graph);
fs.writeFileSync(file, json);

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
};
fs.writeFileSync(path.join(dir, "founder-networks-summary.json"), JSON.stringify(summary, null, 2));
console.log(
  `founder-networks-graph.json ${(json.length / 1024).toFixed(0)} KiB · ${graph.nodes.length} nodes · ${graph.edges.length} edges in ${(performance.now() - started).toFixed(0)} ms`
);
console.log(JSON.stringify(summary));
