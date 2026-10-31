import assert from "node:assert/strict";
import { filterFounders, whyWorthALook, type FounderLead } from "./founder-index";

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
    ...partial,
  };
}

const rows = [
  lead({ id: "thin", name: "Ada Thin", campusId: "univ_penn", campus: "Penn", signalTypes: ["award"] }),
  lead({ id: "none", name: "Bea None" }),
  lead({
    id: "sim",
    name: "Emir Karabeg",
    campusId: "univ_berkeley",
    campus: "Berkeley",
    programs: ["Y Combinator"],
    sector: "AI agents/apps",
    gradYear: 2026,
    signalTypes: ["funding"],
    company: "Sim",
    companyId: "proj_sim",
  }),
];

const ranked = filterFounders(rows, {});
assert.equal(ranked[0]?.name, "Emir Karabeg");
assert.ok(ranked.findIndex((row) => row.name === "Emir Karabeg") < ranked.findIndex((row) => row.name === "Ada Thin"));
assert.ok(ranked.findIndex((row) => row.name === "Ada Thin") < ranked.findIndex((row) => row.name === "Bea None"));

const penn = filterFounders(rows, { campusId: "univ_penn" });
assert.deepEqual(penn.map((row) => row.name), ["Ada Thin"]);

const missingCampus = filterFounders(rows, { campusId: "missing" });
assert.deepEqual(missingCampus.map((row) => row.name), ["Bea None"]);

assert.equal(whyWorthALook(rows[2]!), "Funding");
assert.equal(whyWorthALook(rows[1]!), null);
assert.equal(whyWorthALook(rows[0]!), "Award");
assert.equal(
  whyWorthALook(lead({ id: "yc", name: "Only YC", programs: ["Penn Venture Lab", "Y Combinator", "a16z Speedrun"] })),
  "Y Combinator",
);

const byProgram = filterFounders(rows, { text: "combinator 2026" });
assert.deepEqual(byProgram.map((row) => row.name), ["Emir Karabeg"]);
const bySignal = filterFounders(rows, { text: "funding" });
assert.deepEqual(bySignal.map((row) => row.name), ["Emir Karabeg"]);

console.log("founder index tests ok");
