import assert from "node:assert/strict";
import { cleanCsvDate, cleanCsvName, cleanCsvText, cleanCsvUrl, cleanCsvUrls, encodeCsv } from "./csv";

assert.equal(cleanCsvText("WDB — Fall 2022 technical project — backend"), "WDB. Fall 2022 technical project, backend");
assert.equal(cleanCsvText("<b>Ada</b><br>Lovelace"), "Ada Lovelace");
assert.equal(cleanCsvText("Aadi  Jariwala"), "Aadi Jariwala");
assert.equal(cleanCsvText("line\n\nbreak"), "line break");
assert.equal(cleanCsvText("AI documentation engineer –\u00a0test"), "AI documentation engineer, test");
assert.equal(cleanCsvText("-"), "");
assert.equal(cleanCsvText("Not available"), "");
assert.equal(cleanCsvText("unknown"), "unknown");
assert.equal(cleanCsvDate("2026-09-00"), "2026-09");
assert.equal(cleanCsvDate("2026-00-00"), "2026");
assert.equal(cleanCsvDate(2025), "2025");
assert.equal(cleanCsvUrl(" https://medimintllc.com/ "), "https://medimintllc.com/");
assert.equal(cleanCsvUrl("javascript:alert(1)"), "");
assert.equal(cleanCsvUrl("https://html.duckduckgo.com/html/"), "");
assert.equal(cleanCsvName("D&#39;Rozario"), "D'Rozario");
assert.equal(cleanCsvName(".Ryan Ni"), "Ryan Ni");
assert.equal(cleanCsvName("19 Matthew John Prueksakij"), "Matthew John Prueksakij");
assert.equal(cleanCsvName("@ishanthewizard (GitHub)"), "ishanthewizard");
assert.equal(cleanCsvName("Adrianne Corseri '25"), "Adrianne Corseri");
assert.equal(cleanCsvName("Jack Zhou (Cornell University '28)"), "Jack Zhou");
assert.equal(cleanCsvName("A.J. Steigman"), "A.J. Steigman");
assert.equal(cleanCsvName("李婷婷 Lee Ting Ting"), "李婷婷 Lee Ting Ting");
assert.equal(cleanCsvUrls(["https://a.example", " https://a.example ", "not a url"]), "https://a.example");

const csv = encodeCsv([
  ["name", "note"],
  ['=HYPERLINK("bad")', "ok, fine"],
  ["@ishanthewizard", ""],
]);
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv, /'=HYPERLINK\(""bad""\)/);
assert.match(csv, /"ok, fine"/);
assert.match(csv, /'@ishanthewizard/);
assert.ok(csv.includes("\r\n"));
assert.equal(csv.split("\r\n").filter(Boolean).length, 3);
console.log("csv export tests ok");
