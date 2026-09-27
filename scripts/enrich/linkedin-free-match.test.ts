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

assert.equal(usableOrgName("Labs"), null);
assert.equal(usableOrgName("Nematex"), "Nematex");
assert.ok(schoolPhrases("univ_penn", "University of Pennsylvania").includes("Wharton"));

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
