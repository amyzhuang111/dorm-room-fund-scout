import assert from "node:assert/strict";
import {
  isCommonName,
  judgeHits,
  nameTokens,
  nearbyLinkedIn,
  normalizeLinkedInUrl,
  schoolPhrases,
  slugLooksLikeName,
  usableOrgName,
} from "./linkedin-free-match";

assert.deepEqual(nameTokens("Devin Abraham Sc.M '27"), ["Devin", "Abraham"]);
assert.deepEqual(nameTokens("Saajan Patel '29"), ["Saajan", "Patel"]);
assert.deepEqual(nameTokens("李婷婷 Lee Ting Ting"), ["Lee", "Ting", "Ting"]);
assert.equal(nameTokens("Milidu J.").length < 2, true);

assert.equal(normalizeLinkedInUrl("https://ca.linkedin.com/in/zaais-van-zyl?trk=public"), "https://www.linkedin.com/in/zaais-van-zyl");
assert.equal(normalizeLinkedInUrl("https://www.linkedin.com/pub/dir/Milidu"), null);
assert.equal(normalizeLinkedInUrl("https://www.linkedin.com/company/devpost"), null);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/james-wright6", "James Wright"), true);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/allan-guo", "Allan Guo"), true);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/sachchitnis", "Eden Growney"), false);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/jason-li", "Jason Li"), true);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/skylerji", "Skyler Ji"), true);
assert.equal(slugLooksLikeName("https://www.linkedin.com/in/zipingye", "Ziping Ye"), true);
assert.equal(isCommonName(["Nam", "Nguyen"], 1), true);
assert.equal(isCommonName(["Allan", "Guo"], 1), false);

assert.equal(usableOrgName("Labs"), null);
assert.equal(usableOrgName("Nematex"), "Nematex");
const pennSchools = schoolPhrases("univ_penn", "University of Pennsylvania");
assert.ok(pennSchools.includes("Wharton"));
assert.equal(pennSchools.includes("Pennsylvania"), false);
assert.equal(
  judgeHits({
    name: "Joshua Weiner",
    schools: pennSchools,
    startups: ["Infra"],
    programs: [],
    commonName: false,
    hits: [
      {
        url: "https://www.linkedin.com/in/joshua-weiner-infra",
        title: "Joshua Weiner",
        snippet: "Joshua Weiner. Philadelphia, Pennsylvania. Cybersecurity at [Penn State University](https://www.linkedin.com/school/penn-state-university).",
      },
    ],
  }).outcome,
  "reject"
);

const schools = ["Brown University", "Brown"];
const startups = ["Nematex"];

const christopher = judgeHits({
  name: "Christopher Williams",
  schools,
  startups,
  programs: [],
  commonName: isCommonName(["Christopher", "Williams"], 1),
  hits: [
    {
      url: "https://www.linkedin.com/in/christopher-williams-nematex",
      title: "Christopher Williams - Arakatu, Nematex, Brown Alum.",
      snippet: "Christopher Williams. Arakatu, Nematex, Brown Alum. Nematex Brown University.",
      query: '"Christopher Williams" Nematex linkedin',
    },
  ],
});
assert.equal(christopher.outcome, "accept");
if (christopher.outcome === "accept") {
  assert.equal(christopher.confidence, "confirmed");
  assert.ok(christopher.signals.includes("school"));
  assert.ok(christopher.signals.includes("startup"));
}

const zaais = judgeHits({
  name: "Zaais van Zyl",
  schools: ["University of Waterloo", "Waterloo"],
  startups: ["Applied Intelligence"],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/zaais-van-zyl",
      title: "Zaais van Zyl - Forward Deployed Engineer @ Edison",
      snippet: "Zaais van Zyl. Forward Deployed Engineer @ Edison. Edison Scientific Queen's University.",
      query: '"Zaais van Zyl" Waterloo linkedin',
    },
  ],
});
assert.equal(zaais.outcome, "reject");

const common = judgeHits({
  name: "Jason Li",
  schools: ["University of Pennsylvania", "Penn"],
  startups: ["Serpent Robotics"],
  programs: [],
  commonName: true,
  hits: [
    {
      url: "https://www.linkedin.com/in/jason-li-penn",
      title: "Jason Li - University of Pennsylvania",
      snippet: "Jason Li. Student at the University of Pennsylvania.",
      query: '"Jason Li" Penn site:linkedin.com/in',
    },
  ],
});
assert.equal(common.outcome, "ambiguous");

const commonConfirmed = judgeHits({
  name: "Jason Li",
  schools: ["University of Pennsylvania", "Penn"],
  startups: ["Serpent Robotics"],
  programs: [],
  commonName: true,
  hits: [
    {
      url: "https://www.linkedin.com/in/jason-li-penn",
      title: "Jason Li - Serpent Robotics",
      snippet: "Jason Li. Founder at Serpent Robotics. University of Pennsylvania.",
      query: '"Jason Li" "Serpent Robotics" linkedin',
    },
  ],
});
assert.equal(commonConfirmed.outcome, "accept");
if (commonConfirmed.outcome === "accept") assert.equal(commonConfirmed.confidence, "confirmed");

const combined = judgeHits({
  name: "Jason Li",
  schools: ["University of Pennsylvania", "Penn"],
  startups: ["Serpent Robotics"],
  programs: [],
  commonName: true,
  hits: [
    {
      url: "https://www.linkedin.com/in/jason-li-penn",
      title: "Jason Li - University of Pennsylvania",
      snippet: "Jason Li studies at the University of Pennsylvania.",
    },
    {
      url: "https://www.linkedin.com/in/jason-li-penn",
      title: "Jason Li - Serpent Robotics",
      snippet: "Jason Li, founder of Serpent Robotics.",
    },
  ],
});
assert.equal(combined.outcome, "accept");
if (combined.outcome === "accept") assert.equal(combined.confidence, "confirmed");

const schoolOnlyCommon = judgeHits({
  name: "Adam Towner",
  schools: ["Rice University", "Rice"],
  startups: ["Claude"],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/adam-the-towner",
      title: "Adam Towner",
      snippet: "Adam Towner. First Year Representative at Rice University.",
    },
  ],
});
assert.equal(schoolOnlyCommon.outcome, "ambiguous");

const likely = judgeHits({
  name: "Milidu Jayaweera",
  schools: ["Brown University", "Brown"],
  startups: ["EndoSwim Solutions"],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/milidu-jayaweera",
      title: "Milidu Jayaweera - M.D. Candidate at Brown University",
      snippet: "Milidu Jayaweera. Biomedical Engineering student at Brown University.",
      query: '"Milidu Jayaweera" Brown site:linkedin.com/in',
    },
  ],
});
assert.equal(likely.outcome, "accept");
if (likely.outcome === "accept") assert.equal(likely.confidence, "likely");

const tied = judgeHits({
  name: "Milidu Jayaweera",
  schools: ["Brown University", "Brown"],
  startups: [],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/milidu-jayaweera",
      title: "Milidu Jayaweera",
      snippet: "Milidu Jayaweera at Brown University",
    },
    {
      url: "https://www.linkedin.com/in/milidu-jayaweera-2",
      title: "Milidu Jayaweera",
      snippet: "Milidu Jayaweera, Brown University",
    },
  ],
});
assert.equal(tied.outcome, "ambiguous");

const schoolProgram = judgeHits({
  name: "Milidu Jayaweera",
  schools: ["Brown University", "Brown"],
  startups: ["EndoSwim Solutions"],
  programs: ["Brown Venture Prize"],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/milidu-jayaweera",
      title: "Milidu Jayaweera - Brown Venture Prize",
      snippet: "Milidu Jayaweera. Brown University. Brown Venture Prize.",
      query: '"Milidu Jayaweera" Brown linkedin',
    },
  ],
});
assert.equal(schoolProgram.outcome, "accept");
if (schoolProgram.outcome === "accept") assert.equal(schoolProgram.confidence, "likely");

const ownSite = judgeHits({
  name: "Skyler Ji",
  schools: ["UC Berkeley", "Berkeley"],
  startups: [],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/skylerji",
      title: "Skyler Ji",
      snippet: "Skyler Ji founder",
      fromSite: true,
      query: "https://humanbehavior.co",
    },
  ],
});
assert.equal(ownSite.outcome, "accept");
if (ownSite.outcome === "accept") assert.equal(ownSite.confidence, "confirmed");

const page = `<div>Team</div><a href="https://www.linkedin.com/in/riddhima-kapoor">Riddhima Kapoor</a><p>Riddhima Kapoor built VeggieVice at Penn.</p>`;
const near = nearbyLinkedIn(page, "Riddhima Kapoor");
assert.equal(near.length, 1);
assert.equal(near[0].url, "https://www.linkedin.com/in/riddhima-kapoor");
assert.equal(nearbyLinkedIn(page, "Someone Else").length, 0);

const distant = `<p>Eden Growney, McCormick '26</p>${" word".repeat(80)}<a href="https://www.linkedin.com/in/sachchitnis">Sach Chitnis</a>`;
assert.equal(nearbyLinkedIn(distant, "Eden Growney").length, 0);

const icon = `<h2>Shana Wang</h2><p>Chief Executive Officer</p><a href="https://www.linkedin.com/in/shanahwang" aria-label="LinkedIn"><svg></svg></a>`;
const iconHit = nearbyLinkedIn(icon, "Shana Wang");
assert.equal(iconHit.length, 1);
assert.equal(iconHit[0].url, "https://www.linkedin.com/in/shanahwang");

const farName = `<p>Shana Wang</p>${" word".repeat(120)}<a href="https://www.linkedin.com/in/shanahwang">LinkedIn</a>`;
assert.equal(nearbyLinkedIn(farName, "Shana Wang").length, 0);

const wrongSlug = judgeHits({
  name: "Eden Growney",
  schools: ["Northwestern"],
  startups: ["Xpnse AI"],
  programs: [],
  commonName: false,
  hits: [
    {
      url: "https://www.linkedin.com/in/sachchitnis",
      title: "Eden Growney",
      snippet: "Eden Growney, McCormick '26",
      fromSite: true,
      query: "https://www.thegarage.northwestern.edu/news/venturecat-2026-the-results",
    },
  ],
});
assert.equal(wrongSlug.outcome, "reject");

console.log("linkedin-free-match.test.ts ok");
