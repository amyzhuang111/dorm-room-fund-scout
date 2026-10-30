// Build-time copies of the map payloads. The homepage and network views fetch
// these static files instead of waiting on a serverless SQLite pass.
// Reads the database. Writes JSON snapshots only.
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
// Always rebuild from SQLite — never read a stale public/data JSON.
process.env.CAMPUS_SCOUT_IGNORE_PRECOMPUTE = "1";

import { listCampusArcs, listCandidateProjects, listUniversities } from "../lib/domain/queries";
import { buildNetworkMap } from "../lib/domain/network-map";
import { buildDirectoryFromDb } from "../lib/domain/directory";
import { buildHeroStatsFromDb } from "../lib/domain/hero-stats";
import { feedbackRedirects } from "../lib/domain/entity-redirects";

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

const directoryStarted = performance.now();
write("sample-directory.json", buildDirectoryFromDb(), directoryStarted);

const heroStarted = performance.now();
const hero = buildHeroStatsFromDb();
write("hero-stats.json", hero, heroStarted);

const shellStarted = performance.now();
write("shell.json", { updatedAt: hero.updatedAt, redirects: feedbackRedirects() }, shellStarted);
