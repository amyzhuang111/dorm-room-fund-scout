import assert from "node:assert/strict";
import { assignWhyWorthALook, filterFounders, whyWorthALook, type FounderLead } from "./founder-index";

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

assert.equal(whyWorthALook(rows[2]!), "Y Combinator · funding");
assert.equal(whyWorthALook(rows[1]!), null);
assert.equal(whyWorthALook(rows[0]!), "Award on record");
assert.equal(
  whyWorthALook(lead({ id: "yc", name: "Only YC", programs: ["Penn Venture Lab", "Y Combinator", "a16z Speedrun"] })),
  "Y Combinator",
);
assert.equal(
  whyWorthALook(lead({ id: "weak", name: "Weak+YC", programs: ["Y Combinator"], signalTypes: ["demo"] })),
  "Y Combinator · shown project",
); // program + weak signal beats bare "Shown project on record"

const byProgram = filterFounders(rows, { text: "combinator 2026" });
assert.deepEqual(byProgram.map((row) => row.name), ["Emir Karabeg"]);
const bySignal = filterFounders(rows, { text: "funding" });
assert.deepEqual(bySignal.map((row) => row.name), ["Emir Karabeg"]);

console.log("founder index tests ok");

{
  const sameYc = [
    lead({ id: "a", name: "A", company: "Keye", companyId: "k1", programs: ["Y Combinator"] }),
    lead({ id: "b", name: "B", company: "Keye", companyId: "k1", programs: ["Y Combinator", "Penn Venture Lab"] }),
    lead({ id: "c", name: "C", company: "Other", companyId: "o1", programs: ["Y Combinator"] }),
  ];
  const why = assignWhyWorthALook(sameYc);
  assert.ok(why.get("a")?.includes("Y Combinator"));
  assert.equal(why.get("b"), "Penn Venture Lab");
  assert.ok(!why.get("c") || !/y\s*combinator/i.test(why.get("c")!));
  const ycCount = [...why.values()].filter((v) => v && /y\s*combinator/i.test(v)).length;
  assert.ok(ycCount <= 1, "YC reason at most once on a page");
}
