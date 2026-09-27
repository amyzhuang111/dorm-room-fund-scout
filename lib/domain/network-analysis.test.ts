import assert from "node:assert/strict";
import { buildNetworkAnalysis } from "./network-analysis";
import { metroOf, perThousand } from "./network-analysis-model";
import {
  NATIONAL_PROGRAMS,
  TOP_VC_ID,
  investorFactIsTopVc,
  nationalProgramTierRank,
  programsInText,
} from "./national-programs";
import { PROGRAM_DIRECTORY, type ProgramSignalType } from "./program-signals";

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
assert.deepEqual(both, ["yc"]);
assert.equal(programsInText("Pearson Labs").some((program) => program.id === "pear"), false);
assert.equal(programsInText("Neon").some((program) => program.id === "neo"), false);
assert.equal(programsInText("VIP-X Spring 2022 cohort").length, 0);
assert.equal(programsInText("MIT delta v 2026").length, 0);
assert.equal(programsInText("Entrepreneurs @ Berkeley").length, 0);
assert.deepEqual(programsInText("Delta Fellowship cohort 2").map((program) => program.id), ["human_capital"]);
assert.equal(programsInText("Human Capital").length, 0);
assert.equal(programsInText("Human Capital Fellowship Prize ($50k)").length, 0);
assert.ok(programsInText("Human Capital Fellowship").some((program) => program.id === "human_capital"));
assert.ok(programsInText("HC Fellowship").some((program) => program.id === "human_capital"));
assert.ok(programsInText("Neo Scholars 2024 cohort").some((program) => program.id === "neo"));
assert.ok(programsInText("Thiel Fellowship 2026").some((program) => program.id === "thiel"));
assert.ok(programsInText("a16z speedrun SR007").some((program) => program.id === "speedrun"));
assert.equal(programsInText("a16z speedrun SR007").some((program) => program.id === "top_vc"), false);
assert.ok(programsInText("Accel Leaders").some((program) => program.id === "accel_scholars"));
assert.ok(programsInText("Accel Leadership Program fellow").some((program) => program.id === "accel_scholars"));
assert.equal(programsInText("Claremont Accelerator").length, 0);
assert.ok(programsInText("Pear VC Garage").some((program) => program.id === "pear"));
assert.equal(programsInText("backed by pear vc").some((program) => program.id === "pear"), false);
assert.ok(programsInText("Founders, Inc.").some((program) => program.id === "founders_inc"));
assert.ok(programsInText("Founders Inc Off Season").some((program) => program.id === "founders_inc"));
assert.equal(programsInText("Founders include PhD candidates in the GRASP Lab").length, 0);
assert.ok(programsInText("SPC Founder Fellowship").some((program) => program.id === "spc"));
assert.ok(programsInText("South Park Commons").some((program) => program.id === "spc"));
assert.ok(programsInText("HF0").some((program) => program.id === "hf0"));
assert.ok(programsInText("Emergent Ventures").some((program) => program.id === "emergent"));
assert.ok(programsInText("Z Fellow").some((program) => program.id === "z_fellows"));
assert.ok(programsInText("Kleiner Perkins Engineering Fellow").some((program) => program.id === "kp_fellows"));
assert.equal(programsInText("Kleiner Perkins").some((program) => program.id === "kp_fellows"), false);
assert.ok(programsInText("1517 Fund").some((program) => program.id === "fund_1517"));
assert.equal(programsInText("https://www.linkedin.com/in/felix-fan-055115173").length, 0);
assert.ok(programsInText("Contrary venture partner").some((program) => program.id === "contrary"));
assert.ok(programsInText("AGI House SF").some((program) => program.id === "agi_house"));
assert.equal(programsInText("YC founder; page names Stanford University").some((program) => program.id === "yc"), true);
assert.equal(programsInText("NYC").length, 0);
assert.equal(programsInText("Rice Residency").some((program) => program.id === "the_residency"), false);
assert.ok(programsInText("The Residency in San Francisco").some((program) => program.id === "the_residency"));
assert.ok(programsInText("Afore FIR U").some((program) => program.id === "afore"));
assert.equal(programsInText("Pioneer").some((program) => program.id === "pioneer"), false);

const directoryRows: [string, ProgramSignalType][] = [
  ["spc", "south_park_commons"],
  ["hf0", "hf0"],
  ["emergent", "emergent_ventures"],
  ["kp_fellows", "kleiner_perkins_fellows"],
  ["z_fellows", "z_fellows"],
  ["founders_inc", "founders_inc"],
  ["agi_house", "agi_house"],
  ["contrary", "contrary_venture_partners"],
  ["fund_1517", "medici_1517"],
  ["afore", "afore_fir_u"],
  ["the_residency", "the_residency"],
  ["pioneer", "pioneer"],
  ["buildspace", "buildspace"],
  ["frontier_tower", "frontier_tower"],
];
for (const [id, signalType] of directoryRows) {
  assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === id)?.tier, PROGRAM_DIRECTORY[signalType].tier, id);
  assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === id)?.signalType, signalType, id);
}

assert.equal(investorFactIsTopVc("Andreessen Horowitz"), true);
assert.equal(investorFactIsTopVc("Sequoia Capital"), true);
assert.equal(investorFactIsTopVc("First Round Capital"), true);
assert.equal(investorFactIsTopVc("Lux Capital"), true);
assert.equal(investorFactIsTopVc("Founders Fund"), true);
assert.equal(investorFactIsTopVc("Bessemer Venture Partners"), true);
assert.equal(investorFactIsTopVc("General Catalyst"), true);
assert.equal(investorFactIsTopVc("a16z Speedrun"), false);
assert.equal(investorFactIsTopVc("Y Combinator"), false);
assert.equal(investorFactIsTopVc("Thiel Fellowship"), false);
assert.equal(investorFactIsTopVc("Kleiner Perkins"), false);
assert.equal(investorFactIsTopVc("Accel"), true);
assert.equal(investorFactIsTopVc("Accel Scholars"), false);
assert.equal(investorFactIsTopVc("Pear"), true);
assert.equal(investorFactIsTopVc("Pear Fellows"), false);
assert.equal(investorFactIsTopVc("Pear VC"), true);
assert.equal(investorFactIsTopVc("GV"), true);
assert.equal(investorFactIsTopVc("NEA"), true);
assert.equal(investorFactIsTopVc("Index Ventures"), true);
assert.equal(investorFactIsTopVc("SV Angel"), true);
assert.equal(investorFactIsTopVc("Berkeley SkyDeck"), false);

assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === "thiel")?.tier, "S+");
assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === "spc")?.tier, "S");
assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === "hf0")?.tier, "S");
assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === "emergent")?.tier, "S");
assert.equal(NATIONAL_PROGRAMS.find((program) => program.id === "z_fellows")?.tier, "A");
assert.ok(nationalProgramTierRank("S+") < nationalProgramTierRank("S"));
assert.ok(nationalProgramTierRank("S") < nationalProgramTierRank("A"));
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
assert.equal(analysis.programs.columns.length, 8);
assert.equal(analysis.programs.rows.some((row) => row.id === "vipx" || row.id === "penn_labs" || row.id === "eb"), false);
const mustShow = ["thiel", "neo", "accel_scholars", "yc", "speedrun", "human_capital", "z_fellows", TOP_VC_ID];
for (const id of mustShow) {
  assert.ok(analysis.programs.rows.some((row) => row.id === id), `missing program row ${id}`);
}
assert.equal(analysis.programs.rows.at(-1)?.id, TOP_VC_ID);
assert.equal(analysis.programs.rows.at(-1)?.tier ?? null, null);
let previousRank = -1;
let previousCount = Number.POSITIVE_INFINITY;
for (const row of analysis.programs.rows) {
  assert.equal(row.cells.length, analysis.programs.columns.length);
  assert.ok(row.all.count > 0, `${row.label} has no founders`);
  assert.ok(row.all.count >= Math.max(...row.cells.map((cell) => cell.count)));
  if (row.id === TOP_VC_ID) continue;
  const configured = NATIONAL_PROGRAMS.find((program) => program.id === row.id);
  assert.ok(configured, `${row.id} is not a national program`);
  assert.equal(row.tier, configured?.tier);
  assert.equal(row.label, configured?.label);
  const rank = nationalProgramTierRank(row.tier);
  assert.ok(rank > previousRank || (rank === previousRank && row.all.count <= previousCount), `${row.label} out of tier order`);
  if (rank !== previousRank) previousCount = Number.POSITIVE_INFINITY;
  previousRank = rank;
  previousCount = row.all.count;
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

assert.equal(analysis.pitchbook.title, "PitchBook VC-backed alumni founders (2015–2026)");
assert.ok(analysis.pitchbook.rows.length >= 5);
assert.equal(analysis.pitchbook.sourceUrl, "https://pitchbook.com/news/articles/pitchbook-university-rankings");
let previousPitch = Number.POSITIVE_INFINITY;
for (const row of analysis.pitchbook.rows) {
  if (row.perThousand == null) continue;
  assert.ok(row.perThousand <= previousPitch + 0.05, `${row.label} out of PitchBook rank order`);
  previousPitch = row.perThousand;
  assert.ok(row.founders > 0);
  assert.ok(row.capitalRaisedUsd > 1_000_000);
}
assert.ok(analysis.hitRate.rows.length >= 3);
assert.equal((analysis.hitRate.sentence.match(/[.!?](?=\s|$)/g) ?? []).length, 1);
let previousHit = Number.POSITIVE_INFINITY;
for (const row of analysis.hitRate.rows) {
  assert.ok(row.founders >= 8, row.label);
  assert.ok(row.low <= row.hitRate + 1e-9 && row.hitRate <= row.high + 1e-6, row.label);
  assert.ok(row.hitRate <= previousHit + 0.001, `${row.label} out of hit-rate order`);
  previousHit = row.hitRate;
  assert.ok(row.ids.includes(row.id));
}

console.log(`network-analysis tests ok (${analysis.metros.rows.length} campuses, ${analysis.programs.rows.length} programs, ${analysis.density.rows.length} density rows)`);
