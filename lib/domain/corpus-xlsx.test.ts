import assert from "node:assert/strict";
import { corpusToXlsx, guardFormula } from "./corpus-xlsx";
import type { CorpusRow } from "./corpus-explorer";

function row(partial: Partial<CorpusRow>): CorpusRow {
  return {
    id: "proj_x",
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

assert.equal(guardFormula("=1+1"), "'=1+1");
assert.equal(guardFormula("Acme"), "Acme");

async function main() {
const bytes = await corpusToXlsx([
  row({
    id: "proj_a",
    name: "=cmd",
    campus: null,
    foundedYear: 2026,
    latestSignalAt: "2026-05",
    fundingText: "Accelerator",
    website: "https://example.com",
    sourceUrls: ["https://source.example/a", "https://source.example/b"],
    signals: 2,
    founderCount: 1,
    founders: ["Ada"],
  }),
  row({
    id: "proj_b",
    name: "Year only",
    latestSignalAt: "2024",
    foundedYear: null,
  }),
]);

assert.ok(bytes.subarray(0, 2).equals(Buffer.from([0x50, 0x4b])), "xlsx is a zip workbook");
interface LoadedSheet {
  views: { state?: string }[];
  rowCount: number;
  getRow(index: number): { getCell(index: number): { value: unknown } };
}
interface LoadedBook {
  xlsx: { load(data: unknown): Promise<void> };
  getWorksheet(name: string): LoadedSheet | undefined;
}
const imported = (await import("exceljs")) as unknown as {
  Workbook?: new () => LoadedBook;
  default?: { Workbook?: new () => LoadedBook };
};
const Ctor = imported.Workbook ?? imported.default?.Workbook;
if (!Ctor) throw new Error("exceljs Workbook missing");
const book = new Ctor();
await book.xlsx.load(bytes);
const sheet = book.getWorksheet("Corpus");
assert.ok(sheet);
assert.equal(sheet.views[0]?.state, "frozen");
assert.equal(sheet.rowCount, 3);
assert.equal(String(sheet.getRow(2).getCell(2).value).replace(/^'/, ""), "=cmd");
assert.equal(sheet.getRow(2).getCell(3).value ?? "", "");
assert.equal(String(sheet.getRow(2).getCell(6).value), "2026");
assert.equal(String(sheet.getRow(2).getCell(10).value), "2026-05");
assert.equal(String(sheet.getRow(3).getCell(10).value), "2024");
assert.equal(sheet.getRow(2).getCell(17).value, "Accelerator");
const website = sheet.getRow(2).getCell(16).value as { text?: string; hyperlink?: string };
assert.equal(website.hyperlink, "https://example.com");
const sources = String(sheet.getRow(2).getCell(21).value);
assert.match(sources, /source\.example\/a/);
assert.match(sources, /source\.example\/b/);

console.log("corpus xlsx tests ok", bytes.length);
}
main();
