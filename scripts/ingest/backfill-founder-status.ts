// Recompute people.enrollment_* from claims already in the database.
// Class-year tokens, "Class of", "graduated in", current-student wording,
// and confirmed LinkedIn education claims. No network calls.
//
// Run: npx tsx scripts/ingest/backfill-founder-status.ts

import { getDb } from "../../lib/db/client";
import { decideEnrollment, ENROLLMENT_AS_OF_YEAR, RECENT_GRAD_WINDOW_YEARS, type EvidenceSnippet } from "../../lib/domain/founder-status";
import { recomputeAllEnrollment } from "../../lib/domain/enrollment-store";

function assertCase(name: string, snippets: EvidenceSnippet[], status: string, label: string | null, personName?: string) {
  const decision = decideEnrollment(snippets, { personName });
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
  assertCase(
    "Columbia year-first token",
    [{ excerpt: "Open Track 1st: Robert Schulte '27CBS — Founder of PollenPal", ...src }],
    "current_student",
    "'27CBS"
  );
  assertCase(
    "Columbia MBAxMS token",
    [{ excerpt: "Technology Track 2nd: Yuta Morimoto MBAxMS '27 — Founder of MariStarboard", ...src }],
    "current_student",
    "MBAxMS '27"
  );
  assertCase(
    "curly apostrophe is the same token",
    [{ excerpt: "Listed as Corina Chen, ENG’28, W’28.", ...src }],
    "current_student",
    "ENG'28"
  );
  assertCase(
    "hackathon edition year is not a class year",
    [{ excerpt: "HackPrinceton Spring '26 Winner. No class year is printed.", ...src }],
    "unknown",
    null
  );
  assertCase(
    "SP2 school code",
    [{ excerpt: "Musmo HealthTech: Mohammed Soumaoro, SP2'25", ...src }],
    "recent_grad",
    "SP2'25"
  );
  assertCase(
    "mixed-case GEng token",
    [{ excerpt: "The team included Dhairya Ameria (GEng’27).", ...src }],
    "current_student",
    "GEng'27"
  );
  assertCase(
    "CHI conference is not a class year",
    [{ excerpt: "published in CHI '26 for work at MIT's Media Lab", ...src }],
    "unknown",
    null
  );
  assertCase(
    "WACV conference is not a class year",
    [{ excerpt: "Published at NeurIPS 2022, WACV '23 (in collaboration with Meta).", ...src }],
    "unknown",
    null
  );
  assertCase(
    "IMO contest year is not a class year",
    [{ excerpt: "MIT Math + CS student. IMO '24 Gold Medallist.", ...src }],
    "current_student",
    null
  );
  assertCase(
    "a real school code still wins beside a conference",
    [{ excerpt: "Ada Lovelace, W'27, published at CHI '26.", ...src }],
    "current_student",
    "W'27"
  );
  assertCase(
    "lowercase mit class year",
    [{ excerpt: "Anna Sun is an mit '23 computer science graduate.", ...src }],
    "recent_grad",
    "MIT'23"
  );
  assertCase(
    "currently a student",
    [{ excerpt: "Shannon Dooley is currently a student at the University of Pennsylvania.", ...src }],
    "current_student",
    null
  );
  assertCase(
    "engineering students",
    [{ excerpt: "founded by five CMU engineering students: Rohan Ganesh, Troy McBride.", ...src }],
    "current_student",
    null
  );
  assertCase(
    "master's student",
    [{ excerpt: "Rohan Nagabhirava, a master's student in electrical and computer engineering", ...src }],
    "current_student",
    null
  );
  assertCase(
    "formerly a PhD student stays unknown",
    [{ excerpt: "Lex Johnson, formerly a Penn PhD student", ...src }],
    "unknown",
    null
  );
  assertCase(
    "engineering senior",
    [{ excerpt: "Wharton and Engineering senior Brianna Lin before taking leave", ...src }],
    "current_student",
    null
  );
  assertCase(
    "first year",
    [{ excerpt: "Wharton first year Patrick Sippel", ...src }],
    "current_student",
    null
  );
  assertCase(
    "university student",
    [{ excerpt: "developed alongside Princeton University student Athan Zhang", ...src }],
    "current_student",
    null
  );
  assertCase(
    "expected degree year",
    [{ excerpt: "student at the University of Pennsylvania, pursuing a degree expected in May 2029", ...src }],
    "current_student",
    "'29"
  );
  assertCase(
    "a major step is not a degree",
    [{ excerpt: "Finally got it working which was a major step for our team.", ...src }],
    "unknown",
    null
  );
  assertCase(
    "across major media is not a degree",
    [{ excerpt: "workflows used by 2,600+ editors across major media brands.", ...src }],
    "unknown",
    null
  );
  assertCase(
    "no major on an officer list is not a degree",
    [{ excerpt: "The officer list itself has no major/class-year text.", ...src }],
    "unknown",
    null
  );
  assertCase(
    "information systems major",
    [{ excerpt: "For information systems major Poom Eamsobhana and computer science major Parin Pengpun", ...src }],
    "current_student",
    null
  );
  assertCase(
    "course term is not a class year",
    [{ excerpt: "Team member on Handled (EAS 5490 Spring 2026 venture project).", ...src }],
    "unknown",
    null
  );
  assertCase(
    "2022 stays with the named graduate",
    [{ excerpt: "Founders 2022 Wharton graduate Nick Fleisher and 2023 College graduate Liam Germain", ...src }],
    "older_alumni",
    "'22",
    "Nick Fleisher"
  );
  assertCase(
    "2023 stays with the other named graduate",
    [{ excerpt: "Founders 2022 Wharton graduate Nick Fleisher and 2023 College graduate Liam Germain", ...src }],
    "recent_grad",
    "'23",
    "Liam Germain"
  );
  assertCase(
    "one graduation year covers both named cofounders",
    [
      {
        excerpt:
          "Two 2025 School of Engineering and Applied Science graduates. The cofounders, Sophie Ishiwari and Gabby Daltoso, built the device.",
        ...src,
      },
    ],
    "recent_grad",
    "'25",
    "Gabby Daltoso"
  );
  assertCase(
    "2026 graduating fellows",
    [
      {
        excerpt:
          "Meet STVP's 2026 Graduating Fellows. Congratulations to the 2026 graduates. Alex Georgiou (MS in Mechanical Engineering) is scaling Printess Technologies.",
        ...src,
      },
    ],
    "recent_grad",
    "'26",
    "Alex Georgiou"
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
