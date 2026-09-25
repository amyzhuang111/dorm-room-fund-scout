// Write the LinkedIn search queue for the machine that has the Apify token.
//
//   npx tsx scripts/ingest/export-linkedin-queue.ts
//
// Writes:
//   data/exports/linkedin-queue.csv
//   data/exports/linkedin-search-actor.json
//
// The CSV is every person with no confirmed linkedin.com/in URL.
// Priority 1: founder role and current student or recent grad (2023–2026).
// Priority 2: any other founder role.
// Priority 3: other current students and recent grads.
// Priority 4: everyone else.
// Within a priority, Penn comes first, then Berkeley.

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../../lib/db/client";

const SEARCH_PAGE_USD = 0.1;
const FULL_PROFILE_USD = 0.004;
const MAX_FULL_PROFILES = 3;
const PER_PERSON_USD = SEARCH_PAGE_USD + MAX_FULL_PROFILES * FULL_PROFILE_USD;

const CAMPUS_RANK: Record<string, number> = {
  univ_penn: 0,
  univ_berkeley: 1,
  univ_stanford: 2,
  univ_mit: 3,
  univ_harvard: 4,
  univ_waterloo: 5,
};

interface Row {
  person_id: string;
  full_name: string;
  campus_id: string;
  school_name: string;
  company_names: string;
  enrollment_status: string;
  class_year: string;
  is_founder_role: number;
  campus_rank: number;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT pe.id as person_id, pe.name as full_name,
              COALESCE(pe.enrollment_status, 'unknown') as enrollment_status,
              COALESCE(pe.enrollment_label, CASE WHEN pe.enrollment_grad_year IS NULL THEN '' ELSE CAST(pe.enrollment_grad_year AS TEXT) END) as class_year,
              CASE WHEN EXISTS (
                SELECT 1 FROM person_project_roles ppr
                JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                WHERE ppr.person_id = pe.id
              ) THEN 1 ELSE 0 END as is_founder_role,
              COALESCE((
                SELECT a.university_id FROM affiliations a
                WHERE a.person_id = pe.id
                ORDER BY CASE a.university_id
                  WHEN 'univ_penn' THEN 0
                  WHEN 'univ_berkeley' THEN 1
                  WHEN 'univ_stanford' THEN 2
                  WHEN 'univ_mit' THEN 3
                  WHEN 'univ_harvard' THEN 4
                  WHEN 'univ_waterloo' THEN 5
                  ELSE 9 END, a.university_id
                LIMIT 1
              ), '') as campus_id,
              COALESCE((
                SELECT u.name FROM affiliations a
                JOIN universities u ON u.id = a.university_id
                WHERE a.person_id = pe.id
                ORDER BY CASE a.university_id
                  WHEN 'univ_penn' THEN 0
                  WHEN 'univ_berkeley' THEN 1
                  WHEN 'univ_stanford' THEN 2
                  WHEN 'univ_mit' THEN 3
                  WHEN 'univ_harvard' THEN 4
                  WHEN 'univ_waterloo' THEN 5
                  ELSE 9 END, a.university_id
                LIMIT 1
              ), '') as school_name,
              COALESCE((
                SELECT group_concat(name, ' | ') FROM (
                  SELECT DISTINCT p.name as name
                  FROM person_project_roles ppr
                  JOIN projects p ON p.id = ppr.project_id AND p.kind = 'company'
                  WHERE ppr.person_id = pe.id
                  ORDER BY p.name
                )
              ), '') as company_names
       FROM people pe
       WHERE pe.aliases_json NOT LIKE '%linkedin.com/in/%'`
    )
    .all() as Row[];

  const ranked = rows.map((row) => {
    const focus = row.enrollment_status === "current_student" || row.enrollment_status === "recent_grad";
    const priority = row.is_founder_role && focus ? 1 : row.is_founder_role ? 2 : focus ? 3 : 4;
    return { ...row, priority, campus_rank: CAMPUS_RANK[row.campus_id] ?? 9 };
  });
  ranked.sort((a, b) => a.priority - b.priority || a.campus_rank - b.campus_rank || a.campus_id.localeCompare(b.campus_id) || a.full_name.localeCompare(b.full_name));

  const header = [
    "person_id",
    "full_name",
    "first_name",
    "last_name",
    "campus_id",
    "school_name",
    "company_names",
    "enrollment_status",
    "class_year",
    "is_founder_role",
    "priority",
  ];
  const lines = [header.join(",")];
  for (const row of ranked) {
    const { first, last } = splitName(row.full_name);
    lines.push(
      [
        row.person_id,
        row.full_name,
        first,
        last,
        row.campus_id,
        row.school_name,
        row.company_names,
        row.enrollment_status,
        row.class_year,
        row.is_founder_role ? "true" : "false",
        String(row.priority),
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const outDir = path.resolve(process.cwd(), "data/exports");
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, "linkedin-queue.csv");
  fs.writeFileSync(csvPath, lines.join("\n") + "\n");

  const actor = {
    actorId: "harvestapi~linkedin-profile-search",
    runEndpoint: "https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/runs",
    script: "scripts/ingest/search-linkedin-apify.ts",
    input: {
      searchQuery: '"Full Name" "School Name" "First company"',
      profileScraperMode: "Full",
      takePages: 1,
      maxItems: MAX_FULL_PROFILES,
    },
    searchQueryShape:
      'The live script sends searchQuery = `"${name}" "${schoolName}"` plus ` "${companies[0]}"` when the person has a company. School names are University of Pennsylvania, UC Berkeley, University of Waterloo, Stanford University, MIT, Harvard University.',
    cost: {
      plan: "Free/Starter",
      searchPageUsd: SEARCH_PAGE_USD,
      fullProfileUsd: FULL_PROFILE_USD,
      maxFullProfiles: MAX_FULL_PROFILES,
      upperBoundPerPersonUsd: PER_PERSON_USD,
      formula: "people * (0.10 + 3 * 0.004)",
      pricePage: "https://apify.com/harvestapi/linkedin-profile-search",
      note: "A search page is charged even when nobody is returned. Scale plan search pages are $0.08; Business and above are $0.05.",
    },
  };
  const jsonPath = path.join(outDir, "linkedin-search-actor.json");
  fs.writeFileSync(jsonPath, JSON.stringify(actor, null, 2) + "\n");

  const tiers = [1, 2, 3, 4];
  console.log(`Wrote ${ranked.length} people to ${csvPath}`);
  for (const tier of tiers) {
    const inTier = ranked.filter((r) => r.priority === tier);
    const byCampus = new Map<string, number>();
    for (const row of inTier) byCampus.set(row.campus_id || "(no campus)", (byCampus.get(row.campus_id || "(no campus)") ?? 0) + 1);
    const detail = [...byCampus.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(", ");
    console.log(`priority ${tier}: ${inTier.length} people, upper bound $${(inTier.length * PER_PERSON_USD).toFixed(2)} (${detail})`);
  }
  console.log(`All missing LinkedIn: ${ranked.length} people, upper bound $${(ranked.length * PER_PERSON_USD).toFixed(2)}`);
}

main();
