// Recompute people.enrollment_* from claims already in the database.
// Class-year tokens, "Class of", "graduated in", current-student wording,
// and confirmed LinkedIn education claims. No network calls.
//
// Run: npx tsx scripts/ingest/backfill-founder-status.ts

import { getDb } from "../../lib/db/client";
import { decideEnrollment, ENROLLMENT_AS_OF_YEAR, RECENT_GRAD_WINDOW_YEARS, type EvidenceSnippet } from "../../lib/domain/founder-status";
import { recomputeAllEnrollment } from "../../lib/domain/enrollment-store";

function assertCase(name: string, snippets: EvidenceSnippet[], status: string, label: string | null) {
  const decision = decideEnrollment(snippets);
  if (decision.status !== status || decision.label !== label) {
    throw new Error(`${name}: expected ${status} / ${label}, got ${decision.status} / ${decision.label}`);
  }
}

function checkParser() {
  const src = { sourceUrl: "https://example.test/source", sourceId: "src_test" };
  assertCase(
    "W'27",
    [{ excerpt: `Listed as "Ada Lovelace, W'27" on the 2026 Startup Challenge.`, ...src }],
    "current_student",
    "W'27"
  );
  assertCase(
    "SEAS '25",
    [{ excerpt: "Penn Venture Lab lists Ada (SEAS '25) on Lucy.", ...src }],
    "recent_grad",
    "SEAS'25"
  );
  assertCase(
    "graduated in 2026",
    [{ excerpt: "Kunwoo Kim graduated in 2026 with a degree in Mechanical Engineering.", ...src }],
    "recent_grad",
    "'26"
  );
  assertCase(
    "class of 2029",
    [{ excerpt: "Omar Staniczai is a Mechanical Engineering Major in the class of 2029.", ...src }],
    "current_student",
    "'29"
  );
  assertCase(
    "latest degree still open",
    [{ excerpt: `Listed as "Andrew Mao, EE'26, W'26, G'EE27".`, ...src }],
    "current_student",
    "G'EE27"
  );
  assertCase(
    "2023 is inside the three-year window",
    [{ excerpt: `Listed as "Nastassja Kuznetsova, ENG'23, GEN'24".`, ...src }],
    "recent_grad",
    "GEN'24"
  );
  assertCase(
    "M&T alumni year",
    [{ excerpt: `M&T's public Alumni Profiles page lists "Reed Ginsberg" (M&T'18).`, ...src }],
    "older_alumni",
    "M&T'18"
  );
  assertCase(
    "directory current member",
    [{ excerpt: `Penn Labs team directory lists "Jesse Zong"; alumnus=false.`, ...src }],
    "current_student",
    null
  );
  assertCase(
    "alumnus flag without a year stays unknown",
    [{ excerpt: `Penn Labs team directory lists "Andrew Antenberg"; alumnus=true. joined 2021C.`, ...src }],
    "unknown",
    null
  );
  assertCase(
    "senior design is not a class standing",
    [{ excerpt: "Listed on the 2025 Senior Design showcase. No class year is printed.", ...src }],
    "unknown",
    null
  );
  assertCase(
    "confirmed LinkedIn end date",
    [
      {
        excerpt: "Confirmed LinkedIn education at University of Pennsylvania, ended 2024.",
        claimType: "linkedin_education",
        valueJson: JSON.stringify({ school: "University of Pennsylvania", startYear: 2020, endYear: 2024 }),
        verificationState: "corroborated",
        ...src,
      },
    ],
    "recent_grad",
    "'24"
  );
  assertCase(
    "event year alone is not a class year",
    [{ excerpt: "PennApps 2024 team member. No class year is printed.", ...src }],
    "unknown",
    null
  );
  console.log(
    `Parser checks passed. Window is ${RECENT_GRAD_WINDOW_YEARS} years through ${ENROLLMENT_AS_OF_YEAR} (${ENROLLMENT_AS_OF_YEAR - RECENT_GRAD_WINDOW_YEARS}–${ENROLLMENT_AS_OF_YEAR}).`
  );
}

function main() {
  checkParser();
  const db = getDb();
  const counts = recomputeAllEnrollment(db);
  console.log("People by enrollment status:", counts);
  const byCampus = db
    .prepare(
      `SELECT a.university_id as campus, pe.enrollment_status as status, COUNT(DISTINCT pe.id) as c
       FROM people pe
       JOIN affiliations a ON a.person_id = pe.id
       GROUP BY 1, 2
       ORDER BY 1, 2`
    )
    .all();
  console.log("By campus:");
  for (const row of byCampus as { campus: string; status: string; c: number }[]) {
    console.log(`  ${row.campus} ${row.status} ${row.c}`);
  }
}

main();
