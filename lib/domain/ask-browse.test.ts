import assert from "node:assert/strict";
import { parseAskIntent } from "./ask-intent";
import {
  browseHrefFromAskIntent,
  browseQueryFromAskIntent,
  browseYearFromAskIntent,
  buildSectorFacetAliasMap,
  resolveSectorFacetId,
} from "./ask-browse";

assert.equal(resolveSectorFacetId("ai agents"), "ai_agents");
assert.equal(resolveSectorFacetId("AI"), "ai_agents");
assert.equal(resolveSectorFacetId("ai-agents"), "ai_agents");
assert.equal(resolveSectorFacetId("robotics"), "robotics_hardware");
assert.equal(resolveSectorFacetId("robotics_hardware"), "robotics_hardware");
assert.equal(resolveSectorFacetId("fintech"), "fintech");
assert.equal(resolveSectorFacetId("dev tools"), "dev_tools");
assert.equal(resolveSectorFacetId("climate"), "climate_energy");

const aliasMap = buildSectorFacetAliasMap();
assert.equal(aliasMap.get("ai agents"), "ai_agents");
assert.equal(aliasMap.get("robotics"), "robotics_hardware");

const pennFintechSeed = parseAskIntent("Penn fintech Seed");
assert.equal(browseQueryFromAskIntent(pennFintechSeed, "Penn fintech Seed"), "");
{
  const href = browseHrefFromAskIntent(pennFintechSeed, "Penn fintech Seed");
  assert.match(href, /campus=univ_penn/);
  assert.match(href, /sector=fintech/);
  assert.match(href, /stage=Seed/);
  assert.doesNotMatch(href, /[?&]q=/);
}

// Stanford AI → real facet id ai_agents
const stanfordAi = parseAskIntent("Stanford AI");
{
  const href = browseHrefFromAskIntent(stanfordAi, "Stanford AI");
  assert.match(href, /campus=univ_stanford/);
  assert.match(href, /sector=ai_agents/);
  assert.doesNotMatch(href, /sector=ai-agents/);
  assert.doesNotMatch(href, /[?&]q=/);
}

// MIT robotics → robotics_hardware
const mitRobotics = parseAskIntent("MIT robotics");
{
  const href = browseHrefFromAskIntent(mitRobotics, "MIT robotics");
  assert.match(href, /campus=univ_mit/);
  assert.match(href, /sector=robotics_hardware/);
  assert.doesNotMatch(href, /sector=robotics[^_]/);
  assert.doesNotMatch(href, /[?&]q=/);
}

// Berkeley Seed 2024 must not over-constrain with year (Seed∩Berkeley exists; +2024 is empty)
const berkeley = parseAskIntent("Berkeley Seed 2024");
assert.equal(berkeley.year, 2024);
assert.equal(berkeley.stage, "seed");
assert.equal(browseYearFromAskIntent(berkeley), null);
{
  const href = browseHrefFromAskIntent(berkeley, "Berkeley Seed 2024");
  assert.match(href, /campus=univ_berkeley/);
  assert.match(href, /stage=Seed/);
  assert.doesNotMatch(href, /year=2024/);
  assert.doesNotMatch(href, /[?&]q=/);
}

const mercor = parseAskIntent("Mercor");
assert.equal(browseQueryFromAskIntent(mercor, "Mercor").toLowerCase(), "mercor");
assert.match(browseHrefFromAskIntent(mercor, "Mercor"), /q=Mercor/i);

console.log("ask-browse tests ok");

{
  const stanfordAgents = parseAskIntent("Stanford AI agents");
  assert.equal(browseQueryFromAskIntent(stanfordAgents, "Stanford AI agents"), "");
  const href = browseHrefFromAskIntent(stanfordAgents, "Stanford AI agents");
  assert.match(href, /sector=ai_agents/);
  assert.match(href, /campus=univ_stanford/);
  assert.doesNotMatch(href, /[?&]q=/);
}
