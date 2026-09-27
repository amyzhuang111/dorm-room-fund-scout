import assert from "node:assert/strict";
import { buildNetworkAnalysis } from "./network-analysis";
import { metroOf, perThousand, programsInText } from "./network-analysis-model";

assert.equal(metroOf("San Francisco, California")?.id, "sf");
assert.equal(metroOf("San Fransisco, California")?.id, "sf");
assert.equal(metroOf("Lafayette, California")?.id, "sf");
assert.equal(metroOf("Stanford, California")?.id, "sf");
assert.equal(metroOf("Bay Area, California")?.id, "sf");
assert.equal(metroOf("New York City, NY")?.id, "nyc");
assert.equal(metroOf("NYC, New York")?.id, "nyc");
assert.equal(metroOf("Brooklyn")?.id, "nyc");
assert.equal(metroOf("Boston, Massachusetts")?.id, "boston");
assert.equal(metroOf("Los Angeles, CA")?.id, "la");
assert.equal(metroOf("Seattle, WA")?.id, "seattle");
assert.equal(metroOf("Bellevue, Washington")?.id, "seattle");
assert.equal(metroOf("Austin, Texas")?.id, "austin");
assert.equal(metroOf("Philadelphia, PA")?.id, "philadelphia");
assert.equal(metroOf("Irvine, CA"), null);
assert.equal(metroOf("Cambridge"), null);
assert.equal(metroOf(""), null);

const both = programsInText("Free Ventures S2026; YC X2026").map((program) => program.id);
assert.ok(both.includes("free_ventures"), both.join(","));
assert.ok(both.includes("yc"), both.join(","));
assert.equal(programsInText("Pearson Labs").some((program) => program.id === "pear"), false);
assert.equal(programsInText("Neon").some((program) => program.id === "neo"), false);
assert.deepEqual(
  programsInText("Delta Fellowship cohort 2").map((program) => program.id),
  ["delta_fellowship"]
);
assert.deepEqual(
  programsInText("MIT delta v 2026").map((program) => program.id),
  ["deltav"]
);
assert.ok(programsInText("Neo Scholars 2024 cohort").some((program) => program.id === "neo"));
assert.ok(programsInText("Thiel Fellowship 2026").some((program) => program.id === "thiel"));
assert.ok(programsInText("VIP-X Spring 2022 cohort").some((program) => program.id === "vipx"));
assert.ok(programsInText("a16z speedrun SR007").some((program) => program.id === "speedrun"));
assert.equal(perThousand(10, 1000), 10);
assert.equal(perThousand(373, 10650), 35);

const analysis = buildNetworkAnalysis();
assert.ok(analysis.metros.rows.length >= 10 && analysis.metros.rows.length <= 15);
assert.ok(analysis.metros.columns.some((column) => column.id === "sf"));
assert.ok(analysis.metros.columns.some((column) => column.id === "unknown"));
assert.equal(analysis.metros.allLabel, "All metros");

for (const row of analysis.metros.rows) {
  assert.equal(row.cells.length, analysis.metros.columns.length);
  const shaded = row.cells.reduce((sum, cell, index) => (analysis.metros.columns[index]?.shade ? sum + cell.count : sum), 0);
  const unknown = row.cells.find((_, index) => analysis.metros.columns[index]?.id === "unknown")?.count ?? 0;
  assert.ok(row.all.count >= shaded, `${row.label} all ${row.all.count} < shaded ${shaded}`);
  assert.ok(row.all.count + unknown >= shaded);
  for (const cell of row.cells) {
    if (cell.count === 0) assert.equal(cell.ids.length, 0);
    else assert.ok(cell.ids.includes(row.id), `${row.label} cell missing campus id`);
  }
}

assert.ok(analysis.programs.rows.length >= 5);
assert.ok(analysis.programs.rows.some((row) => row.id === "yc"));
assert.equal(analysis.programs.columns.length, 8);
for (const row of analysis.programs.rows) {
  assert.ok(row.cells.some((cell) => cell.count > 0), `${row.label} has no campus cell`);
  assert.ok(row.all.count >= Math.max(...row.cells.map((cell) => cell.count)));
  assert.ok(row.all.count > 0);
}

assert.ok(analysis.density.rows.length >= 5);
let previous = Number.POSITIVE_INFINITY;
for (const row of analysis.density.rows) {
  assert.ok(row.perThousand <= previous + 0.05, `${row.label} out of rank order`);
  previous = row.perThousand;
  assert.equal(row.perThousand, perThousand(row.founders, row.undergrads));
  assert.ok(row.founders > 0);
  assert.ok(row.undergrads > 100);
  assert.ok(row.sourceUrl.startsWith("https://"));
  assert.ok(row.ids.includes(row.id));
}

const penn = analysis.metros.rows.find((row) => row.label === "Penn");
assert.ok(penn && penn.all.count > 0, "Penn should have headquartered startups");
console.log(`network-analysis tests ok (${analysis.metros.rows.length} campuses, ${analysis.programs.rows.length} programs, ${analysis.density.rows.length} density rows)`);
