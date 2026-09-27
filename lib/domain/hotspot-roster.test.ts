import assert from "node:assert/strict";
import { parseDeltaV2026, parseMayfieldAlumni, parseStartXCommunity, schoolHitsIn } from "./hotspot-roster";

const mayfield = `
<h2>2025 Cohort</h2>
<div class="paragraph-item"><p>ignored</p></div>
<div class="paragraph-item">
  <p>Aaryan Shah<br>Ahmed Muhammad<br>&nbsp;</p>
  <p>Mia Bhuta<br>William Li</p>
</div>
<div class="paragraph-item"><h2>2024 Cohort</h2></div>
<div class="paragraph-item"><p>Ali Hindy<br>Elena Recaldini</p></div>
`;
const cohorts = parseMayfieldAlumni(mayfield);
assert.equal(cohorts.length, 2);
assert.deepEqual(cohorts[0], { year: 2025, names: ["Aaryan Shah", "Ahmed Muhammad", "Mia Bhuta", "William Li"] });
assert.deepEqual(cohorts[1].names, ["Ali Hindy", "Elena Recaldini"]);

const delta = `
<h1>2026 delta v</h1>
<h1>Alpaca</h1>
<h3>imagine if</h3>
<p>Self-hosted inference.</p>
<p><a href="https://alpa.ca/">alpa.ca</a></p>
<h1>Watch the full Demo Day program</h1>
`;
const teams = parseDeltaV2026(delta);
assert.equal(teams.length, 1);
assert.equal(teams[0].name, "Alpaca");
assert.equal(teams[0].website, "https://alpa.ca/");
assert.equal(teams[0].year, 2026);

const startxCard = `
<div class="comn-list-info-rgt">
  <a href="https://www.zaisland.com/" class="comn-list-info-title-link"><div fs-list-field="title">Zaisland</div></a>
  <p fs-list-field="description">A social platform.</p>
  <div fs-list-field="session">Spring 2026</div>
  <div fs-list-field="year">2026</div>
</div>`;
const sx = parseStartXCommunity(startxCard);
assert.equal(sx.length, 1);
assert.equal(sx[0].website, "https://www.zaisland.com/");
assert.equal(sx[0].year, 2026);
assert.equal(sx[0].session, "Spring 2026");

const penn = schoolHitsIn("She studied at the University of Pennsylvania and is a founder.");
assert.equal(penn[0]?.universityId, "univ_penn");
const customer = schoolHitsIn("Researchers at UC Berkeley use our product in hospitals.");
assert.equal(customer.length, 0);
const stanfordBare = schoolHitsIn("StartX is home to Stanford-affiliated founders building companies.");
assert.equal(stanfordBare.length, 0);

console.log("hotspot-roster tests passed");
