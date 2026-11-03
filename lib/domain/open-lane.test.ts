import assert from "node:assert/strict";
import { buildOpenLaneShell, founderIsOpenLane, founderHasTopFund } from "./open-lane";
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

console.log("open-lane.test.ts ok");
