// Build-time copies of the map payloads. The homepage and network views fetch
// these static files instead of waiting on a serverless SQLite pass.
// Reads the database. Does not write it.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { listCampusArcs, listCandidateProjects, listUniversities } from "../lib/domain/queries";
import { buildNetworkMap } from "../lib/domain/network-map";

const dir = path.join(process.cwd(), "public", "data");
fs.mkdirSync(dir, { recursive: true });

function write(name: string, value: unknown, started: number) {
  const file = path.join(dir, name);
  const json = JSON.stringify(value);
  fs.writeFileSync(file, json);
  console.log(`${name} ${(json.length / 1024).toFixed(0)} KiB in ${(performance.now() - started).toFixed(0)} ms`);
}

const universitiesStarted = performance.now();
const universities = listUniversities();
const arcs = listCampusArcs();
const candidates = listCandidateProjects();
write("globe-map.json", { universities, arcs, candidateCount: candidates.length }, universitiesStarted);
write("candidates.json", candidates, universitiesStarted);

const networkStarted = performance.now();
write("network-map.json", buildNetworkMap(), networkStarted);
