// Rebuild the hotspot directory from the v3 workbook export.
// Appendix rows (named founders already linked from the previous directory)
// stay as they are. Re-running writes the same file.
//
//   npx tsx scripts/ingest/import-v3-hotspots.ts
//
// PennApps organising team is left out on purpose.
// Pear Garage, Pear Fellows, Human Capital Fellowship, and Prod fellowship
// stay as they are in the current directory. The v3 export's thinner Pear
// Garage row does not replace them.

import fs from "node:fs";
import path from "node:path";
import { campusIdForLabel } from "../../lib/domain/hotspot-model";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "data/imports/v3-all-hotspots.csv");
const TARGET = path.join(ROOT, "data/imports/campus_hotspots.csv");

const FIND = "What you’ll find";
const HOW = "How to get in the room";
const HEADER = ["region", "campus", "section", "#", "Place", "Type", "Tier", "Tier rationale", FIND, HOW, "When", "Link", "urls", "Name", "Kind", "Evidence"];

const CITIES = new Set(["Philadelphia", "San Francisco", "New York", "Boston"]);

function parseCsv(text: string): Record<string, string>[] {
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((cells) => cells.some((value) => value.trim())).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? "";
    });
    return record;
  });
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function isPennAppsOrganisingTeam(place: string): boolean {
  const key = norm(place);
  return key.includes("pennapps") && (key.includes("organising") || key.includes("organizing"));
}

function isKeptDirectoryPlace(place: string): boolean {
  const key = norm(place);
  return key === "pear garage" || key === "pear fellows" || key === "human capital fellowship" || key.startsWith("prod fellowship");
}

function mappedCampus(campus: string): boolean {
  if (CITIES.has(campus) || campus === "Cross-campus programmes") return true;
  return campusIdForLabel(campus) !== null;
}

function main() {
  const previous = parseCsv(fs.readFileSync(TARGET, "utf8"));
  const incoming = parseCsv(fs.readFileSync(SOURCE, "utf8"));
  const previousSections = previous.filter((row) => (row.section ?? "").trim());
  const appendix = previous.filter((row) => !(row.section ?? "").trim());

  const previousKeys = new Set(previousSections.map((row) => `${row.campus}|${norm(row.Place ?? "")}`));
  const previousTier = new Map<string, string>();
  for (const row of previousSections) {
    const key = `${row.campus}|${row.section}|${norm(row.Place ?? "")}`;
    if (!previousTier.has(key)) previousTier.set(key, (row.Tier ?? "").trim());
  }

  const counters = new Map<string, number>();
  const written: Record<string, string>[] = [];
  const seenIncoming = new Set<string>();
  const tierMoves: { campus: string; place: string; section: string; from: string; to: string }[] = [];
  const newOrgs: { campus: string; place: string; tier: string }[] = [];
  const excluded: string[] = [];
  const unknownCampus = new Set<string>();

  for (const row of incoming) {
    const campus = (row.School ?? "").trim();
    const place = (row.Place ?? "").trim();
    const section = (row.Section ?? "").trim();
    if (!campus || !place || !section) continue;
    if (isPennAppsOrganisingTeam(place)) {
      if (!excluded.includes(place)) excluded.push(place);
      continue;
    }
    if (isKeptDirectoryPlace(place)) {
      seenIncoming.add(`${campus}|${norm(place)}`);
      continue;
    }
    if (!mappedCampus(campus)) unknownCampus.add(campus);
    const orgKey = `${campus}|${norm(place)}`;
    seenIncoming.add(orgKey);
    if (!previousKeys.has(orgKey) && !newOrgs.some((item) => item.campus === campus && norm(item.place) === norm(place))) {
      newOrgs.push({ campus, place, tier: (row.Tier ?? "").trim() });
    }
    const tier = (row.Tier ?? "").trim();
    const from = previousTier.get(`${campus}|${section}|${norm(place)}`);
    if (from && from !== tier) tierMoves.push({ campus, place, section, from, to: tier });
    const bucket = `${campus}|${section}`;
    const number = (counters.get(bucket) ?? 0) + 1;
    counters.set(bucket, number);
    const url = (row.Link ?? "").trim();
    written.push({
      region: (row.Region ?? "").trim(),
      campus,
      section,
      "#": String(number),
      Place: place,
      Type: (row.Type ?? "").trim(),
      Tier: tier,
      "Tier rationale": (row["Tier rationale"] ?? "").trim(),
      [FIND]: (row["What you'll find"] ?? row["What you’ll find"] ?? "").trim(),
      [HOW]: (row["How to get in"] ?? row["How to get in the room"] ?? "").trim(),
      When: (row.When ?? "").trim(),
      Link: url ? "link" : "",
      urls: url,
      Name: "",
      Kind: "",
      Evidence: "",
    });
  }

  const kept: { campus: string; place: string }[] = [];
  for (const row of previousSections) {
    const place = (row.Place ?? "").trim();
    const campus = (row.campus ?? "").trim();
    const section = (row.section ?? "").trim();
    if (!place || !campus || !section || !isKeptDirectoryPlace(place)) continue;
    seenIncoming.add(`${campus}|${norm(place)}`);
    const bucket = `${campus}|${section}`;
    const number = (counters.get(bucket) ?? 0) + 1;
    counters.set(bucket, number);
    written.push({
      region: (row.region ?? "").trim(),
      campus,
      section,
      "#": String(number),
      Place: place,
      Type: (row.Type ?? "").trim(),
      Tier: (row.Tier ?? "").trim(),
      "Tier rationale": (row["Tier rationale"] ?? "").trim(),
      [FIND]: (row[FIND] ?? row["What you'll find"] ?? "").trim(),
      [HOW]: (row[HOW] ?? row["How to get in"] ?? "").trim(),
      When: (row.When ?? "").trim(),
      Link: (row.Link ?? "").trim() || ((row.urls ?? "").trim() ? "link" : ""),
      urls: (row.urls ?? "").trim(),
      Name: "",
      Kind: "",
      Evidence: "",
    });
    if (!kept.some((item) => item.campus === campus && item.place === place)) kept.push({ campus, place });
  }

  const unmatched = [...previousKeys]
    .filter((key) => !seenIncoming.has(key))
    .map((key) => {
      const split = key.indexOf("|");
      return { campus: key.slice(0, split), place: key.slice(split + 1) };
    });

  const lines = [HEADER.map(csvCell).join(",")];
  for (const row of written) lines.push(HEADER.map((key) => csvCell(row[key] ?? "")).join(","));
  for (const row of appendix) lines.push(HEADER.map((key) => csvCell(row[key] ?? "")).join(","));
  const body = `${lines.join("\n")}\n`;
  fs.writeFileSync(TARGET, body);

  const report = {
    directoryRows: written.length,
    appendixRows: appendix.length,
    tierMoves,
    newOrgs,
    unmatched,
    kept,
    excluded,
    unknownCampus: [...unknownCampus],
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
