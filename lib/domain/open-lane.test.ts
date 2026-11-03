import assert from "node:assert/strict";
import {
  buildOpenLaneShell,
  founderIsOpenLane,
  founderHasTopFund,
  openLaneDefinitionText,
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

const open = lead({
  id: "a",
  name: "Ada",
  campusId: "univ_penn",
  campus: "Penn",
  signalTypes: ["launch"],
  programs: ["Penn Venture Lab"],
});
assert.equal(founderIsOpenLane(open), true);

const yc = lead({
  id: "b",
  name: "Bea",
  signalTypes: ["funding"],
  programs: ["Y Combinator"],
});
assert.equal(founderHasTopFund(yc), true);
assert.equal(founderIsOpenLane(yc), false);

const seq = lead({
  id: "c",
  name: "Cora",
  signalTypes: ["funding"],
  programs: ["Sequoia Capital"],
});
assert.equal(founderHasTopFund(seq), true);

const shell = buildOpenLaneShell([open, yc, seq, lead({ id: "d", name: "Dee", signalTypes: ["demo"] })]);
assert.equal(shell.count, 1);
assert.equal(shell.strong, 3);
assert.equal(shell.campuses[0]?.id, "univ_penn");
assert.equal(shell.campuses[0]?.founders, 1);

const strongDef = openLaneStrongDefinition();
const topDef = openLaneTopFundDefinition();
const full = openLaneDefinitionText();
assert.equal(strongDef, "Strong means a funding, launch, accelerator or award signal.");
assert.equal(topDef, "Top fund means a top VC, YC, Thiel, a16z Speedrun or Neo.");
assert.equal(full, `${strongDef} ${topDef}`);
assert.ok(!/[—–]/.test(full), "definition must not use dashes");
for (const type of OPEN_LANE_STRONG_SIGNAL_TYPES) {
  assert.ok(strongDef.includes(type), type);
}
for (const label of OPEN_LANE_TOP_ACCELERATOR_LABELS) {
  assert.ok(topDef.includes(label), label);
}

console.log("open-lane.test.ts ok");
