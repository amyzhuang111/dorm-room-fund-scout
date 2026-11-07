import assert from "node:assert/strict";
import { corpusLabeledFields } from "./corpus-fields";
import type { CorpusRow } from "./corpus-explorer";

function row(partial: Partial<CorpusRow>): CorpusRow {
  return {
    id: "proj_1",
    name: "Example",
    campus: null,
    sector: null,
    stage: null,
    foundedYear: null,
    hq: null,
    status: null,
    signals: 0,
    latestSignalAt: null,
    signalLabel: null,
    primaryProgram: null,
    ycBatch: null,
    founders: [],
    founderCount: 0,
    website: null,
    fundingText: null,
    logoUrl: null,
    kind: "company",
    scoutingStatus: "Needs review",
    verification: "unverified",
    sourceUrls: [],
    campusIds: [],
    ...partial,
  };
}

const fields = corpusLabeledFields(
  row({
    campus: "Penn",
    stage: "Seed",
    signalLabel: "Seed",
    sector: "Fintech",
    signals: 2,
    primaryProgram: "Y Combinator",
  }),
);
assert.ok(fields.every((field) => field.label && field.value));
assert.equal(fields.filter((field) => field.value === "Seed").length, 1);
assert.equal(fields.find((field) => field.label === "Campus")?.value, "Penn");
assert.equal(fields.find((field) => field.label === "Signals")?.value, "2");
assert.equal(corpusLabeledFields(row({})).some((field) => field.label === "Team"), false);

console.log("corpus field tests ok");
