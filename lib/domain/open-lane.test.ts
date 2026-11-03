import assert from "node:assert/strict";
import {
  buildOpenLaneShell,
  founderIsOpenLane,
  founderHasTopFund,
  founderCompanyOnInvestableDesk,
  openLaneDefinitionText,
  openLaneDeskDefinition,
  openLaneStrongDefinition,
  openLaneTopFundDefinition,
  OPEN_LANE_STRONG_SIGNAL_TYPES,
  OPEN_LANE_TOP_ACCELERATOR_LABELS,
} from "./open-lane";
import type { FounderLead } from "./founder-index";

function lead(partial: Partial<FounderLead> & Pick<FounderLead, "id" | "name">): FounderLead {
  return {
    campusId: null,
    campus: null,
    programs: [],
    sector: null,
    gradYear: null,
    signalTypes: [],
    company: null,
    companyId: null,
    role: null,
    signalSourceByType: {},
    programSourceByLabel: {},
    ...partial,
  };
}

const DESK = new Set(["proj_ada", "proj_bea", "proj_cora"]);

const open = lead({
  id: "a",
  name: "Ada",
  campusId: "univ_penn",
  campus: "Penn",
  signalTypes: ["launch"],
  programs: ["Penn Venture Lab"],
  companyId: "proj_ada",
  company: "Ada Co",
});
assert.equal(founderCompanyOnInvestableDesk(open, DESK), true);
assert.equal(founderIsOpenLane(open, DESK), true);
assert.equal(founderIsOpenLane(open, new Set()), false);

const outside = lead({
  id: "out",
  name: "Out",
  campusId: "univ_penn",
  campus: "Penn",
  signalTypes: ["award"],
  companyId: "proj_outside",
  company: "Outside Co",
});
assert.equal(founderCompanyOnInvestableDesk(outside, DESK), false);
assert.equal(founderIsOpenLane(outside, DESK), false);

const yc = lead({
  id: "b",
  name: "Bea",
  signalTypes: ["funding"],
  programs: ["Y Combinator"],
  companyId: "proj_bea",
});
assert.equal(founderHasTopFund(yc), true);
assert.equal(founderIsOpenLane(yc, DESK), false);

const seq = lead({
  id: "c",
  name: "Cora",
  signalTypes: ["funding"],
  programs: ["Sequoia Capital"],
  companyId: "proj_cora",
});
assert.equal(founderHasTopFund(seq), true);

const shell = buildOpenLaneShell([open, yc, seq, outside, lead({ id: "d", name: "Dee", signalTypes: ["demo"] })], DESK);
assert.equal(shell.count, 1);
assert.equal(shell.strong, 4); // open, yc, seq, outside
assert.equal(shell.campuses[0]?.id, "univ_penn");
assert.equal(shell.campuses[0]?.founders, 1);

const strongDef = openLaneStrongDefinition();
const topDef = openLaneTopFundDefinition();
const deskDef = openLaneDeskDefinition();
const full = openLaneDefinitionText();
assert.equal(strongDef, "Strong means a funding, launch, accelerator or award signal.");
assert.equal(topDef, "Top fund means a top VC, YC, Thiel, a16z Speedrun or Neo.");
assert.equal(deskDef, "The company must sit on the investable desk.");
assert.equal(full, `${strongDef} ${topDef} ${deskDef}`);
assert.ok(!/[—–]/.test(full), "definition must not use dashes");
for (const type of OPEN_LANE_STRONG_SIGNAL_TYPES) {
  assert.ok(strongDef.includes(type), type);
}
for (const label of OPEN_LANE_TOP_ACCELERATOR_LABELS) {
  assert.ok(topDef.includes(label), label);
}

console.log("open-lane.test.ts ok");
