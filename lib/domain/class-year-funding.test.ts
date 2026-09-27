// Class-year phrases and funding display. No database, no network.

import assert from "node:assert/strict";
import { decideEnrollment } from "./founder-status";
import { assembleCompanyProfile, displayedFunding, type CompanyFactRecord } from "./company-profile";

function snippet(excerpt: string) {
  return { excerpt, sourceUrl: "https://example.edu/source", sourceId: null };
}

function yearOf(excerpt: string, personName?: string) {
  return decideEnrollment([snippet(excerpt)], { personName: personName ?? null });
}

const anushka =
  "Penn Engineering's 2025-2026 Student Ventures Committee lists Anushka Levaku: Bachelors in Computer Science, 2026.";
const lindsay =
  "Penn Engineering's 2025-2026 Student Ventures Committee lists Lindsay Park: Masters in Integrated Product Design, 2026.";
const zora = "University of Pennsylvania Theta Tau lists Zora Mardjoko, Major: CIS, May 2026.";
const aden =
  "Bachelor's degree Computer Science at University of California, Berkeley 2018 - 2027. Working to complete my final 30 units.";
const zihao = "Bachelor of Science - BS Computer Science at University of Pennsylvania 2022 - 2026.";
const sanjith =
  "Massachusetts Institute of Technology — BS, Electrical Engineering and Computer Science MAY 2028 (EXPECTED).";
const jathin =
  "UC Berkeley Management, Entrepreneurship, & Technology Program: Jathin Pranav Singaraju (M.E.T. '27) received first place in the Snap Inc. Challenge at CalHacks.";
const hannah =
  "The Stanford Daily (Feb. 15, 2026) names sponsorships director Hannah Gao '28 among the TreeHacks organizers who interviewed Sam Altman.";
const aaryan =
  "Building the Future: Meet STVP's 2026 Graduating Fellows. Aaryan Shah (BS in Biomedical Data Science; BS in Computer Science) is joining Canvas Medical as an applied AI engineer.";

assert.equal(yearOf(anushka, "Anushka Levaku").gradYear, 2026);
assert.equal(yearOf(anushka, "Anushka Levaku").status, "recent_grad");
assert.equal(yearOf(lindsay, "Lindsay Park").gradYear, 2026);
assert.equal(yearOf(zora, "Zora Mardjoko").gradYear, 2026);
assert.equal(yearOf(aden, "Abdullahi Aden").gradYear, 2027);
assert.equal(yearOf(aden, "Abdullahi Aden").status, "current_student");
assert.equal(yearOf(zihao, "Zihao Zhou").gradYear, 2026);
assert.equal(yearOf(sanjith, "Sanjith Udupa").gradYear, 2028);
assert.equal(yearOf(sanjith, "Sanjith Udupa").status, "current_student");
assert.equal(yearOf(jathin, "Jathin Singaraju").gradYear, 2027);
assert.equal(yearOf(hannah, "Hannah Gao").gradYear, 2028);
assert.equal(yearOf(aaryan, "Aaryan Shah").gradYear, 2026);
assert.equal(yearOf(aaryan, "Aaryan Shah").status, "recent_grad");
assert.equal(yearOf("Alejandra Soria Andrade. Class Year: 2025. The Huntsman Program.", "Alejandra Soria Andrade").gradYear, 2025);
assert.equal(yearOf("Alejandra Soria Andrade. Class Year: 2025. The Huntsman Program.", "Alejandra Soria Andrade").status, "recent_grad");
assert.equal(yearOf("Ignacio Hounie, GrE'26 is a third-year doctoral candidate at the University of Pennsylvania.", "Ignacio Hounie").gradYear, 2026);
assert.equal(yearOf("Ignacio Hounie, GrE'26 is a third-year doctoral candidate at the University of Pennsylvania.", "Ignacio Hounie").status, "recent_grad");

assert.equal(yearOf("Penn Engineering's 2025-2026 Student Ventures Committee.").gradYear, null);
assert.equal(yearOf("Penn Engineering's 2025-2026 Student Ventures Committee.").status, "unknown");
assert.equal(yearOf("A business May 2026 launch at the University of Pennsylvania.").gradYear, null);

const roundOnly = assembleCompanyProfile([
  {
    factKey: "funding_round",
    valueText: "Seed|$5M",
    amountUsd: 5_000_000,
    amountStatus: "announced",
    detailJson: JSON.stringify({ stage: "Seed", amountText: "$5M", date: "July 29, 2025", leads: ["Sorenson Capital"] }),
    sourceUrl: "https://www.keye.co/post/keye-we-built-the-diligence-platform-we-wish-we-had",
    excerpt: "We're thrilled to announce our $5 million seed round.",
    origin: "press",
  } satisfies CompanyFactRecord,
]);
assert.equal(displayedFunding(roundOnly)?.text, "Seed · $5M");
assert.equal(roundOnly.funding, null);

const withTotal = assembleCompanyProfile([
  ...roundOnly.rounds.map(
    (round): CompanyFactRecord => ({
      factKey: "funding_round",
      valueText: "Series B|$50M",
      amountUsd: 50_000_000,
      amountStatus: "announced",
      detailJson: JSON.stringify({ stage: round.stage, amountText: round.amountText, date: round.date, leads: round.leads }),
      sourceUrl: round.sourceUrl,
      excerpt: round.excerpt,
      origin: round.origin,
    })
  ),
  {
    factKey: "funding_total",
    valueText: "$63M announced",
    amountUsd: 63_000_000,
    amountStatus: "announced",
    detailJson: "{}",
    sourceUrl: "https://www.flaglerhealth.io/",
    excerpt: "bringing total funding raised to $63 million",
    origin: "press",
  },
]);
assert.equal(displayedFunding(withTotal)?.text, "$63M announced");

const unknown = assembleCompanyProfile([]);
assert.equal(displayedFunding(unknown), null);

console.log("class-year and funding display tests passed");
