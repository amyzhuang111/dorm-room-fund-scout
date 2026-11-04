import assert from "node:assert/strict";
import { classifyDescription, primaryTag, sectorLabel, SECTORS } from "./sectors";

// Deterministic keyword map: known phrases hit expected sectors (auditable).
const cases: { text: string; tag: string }[] = [
  { text: "AI-powered virtual advertising for live sports broadcasts.", tag: "ai_agents" },
  { text: "The AI-native platform for next-generation protein characterization.", tag: "vertical_ai" },
  { text: "AI tool that automates parts of the real estate contract process for brokers.", tag: "vertical_ai" },
  { text: "Training platform for police communication practice.", tag: "defense_gov" },
  { text: "AI Affiliate Network For Financial Companies", tag: "fintech" },
  { text: "Embed a branded AI copilot inside your product to guide onboarding.", tag: "ai_agents" },
  { text: "A marketplace connecting buyers and sellers of lab equipment.", tag: "marketplaces" },
  { text: "Climate tech for carbon accounting at industrial plants.", tag: "climate_energy" },
];

for (const row of cases) {
  const hit = primaryTag(classifyDescription(row.text));
  assert.equal(hit?.tag, row.tag, `expected ${row.tag} for "${row.text.slice(0, 48)}", got ${hit?.tag}`);
}

// Boilerplate / too-short text yields no sector (no guessing).
assert.equal(primaryTag(classifyDescription("Product/sector not yet researched for this listing.")), null);
assert.equal(primaryTag(classifyDescription("x")), null);
assert.equal(primaryTag(classifyDescription("A short blurb.")), null);

// Every sector id has a stable label; non-composite sectors carry patterns.
for (const sector of SECTORS) {
  assert.ok(sectorLabel(sector.id));
  if (sector.id !== "vertical_ai") assert.ok(sector.patterns.length > 0, sector.id);
}

assert.equal(sectorLabel("food_ag"), "Food/Ag");
assert.equal(sectorLabel("Food/ag"), "Food/Ag");
assert.equal(sectorLabel("enterprise_saas"), "Enterprise SaaS");
assert.equal(sectorLabel("dev_tools"), "Dev Tools");
assert.equal(sectorLabel("robotics_hardware"), "Robotics/Hardware");
assert.equal(sectorLabel("hr_work"), "HR/Work");
assert.equal(sectorLabel("AI infra"), "AI Infra");

console.log("sectors tests ok", { cases: cases.length, sectors: SECTORS.length });
