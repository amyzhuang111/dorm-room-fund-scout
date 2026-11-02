import assert from "node:assert/strict";
import { parseAskIntent } from "./ask-intent";
import { browseHrefFromAskIntent, browseQueryFromAskIntent } from "./ask-browse";

const pennFintechSeed = parseAskIntent("Penn fintech Seed");
assert.equal(pennFintechSeed.campus, "Penn");
assert.equal(pennFintechSeed.sector, "fintech");
assert.equal(pennFintechSeed.stage, "seed");
assert.equal(browseQueryFromAskIntent(pennFintechSeed, "Penn fintech Seed"), "");
{
  const href = browseHrefFromAskIntent(pennFintechSeed, "Penn fintech Seed");
  assert.match(href, /campus=univ_penn/);
  assert.match(href, /sector=fintech/);
  assert.match(href, /stage=Seed/);
  assert.doesNotMatch(href, /[?&]q=/);
}

const stanfordAi = parseAskIntent("Stanford AI");
assert.equal(browseQueryFromAskIntent(stanfordAi, "Stanford AI"), "");
assert.doesNotMatch(browseHrefFromAskIntent(stanfordAi, "Stanford AI"), /[?&]q=/);

const berkeley = parseAskIntent("Berkeley Seed 2024");
assert.equal(browseQueryFromAskIntent(berkeley, "Berkeley Seed 2024"), "");
{
  const href = browseHrefFromAskIntent(berkeley, "Berkeley Seed 2024");
  assert.match(href, /year=2024/);
  assert.doesNotMatch(href, /[?&]q=/);
}

const mercor = parseAskIntent("Mercor");
assert.equal(browseQueryFromAskIntent(mercor, "Mercor").toLowerCase(), "mercor");
assert.match(browseHrefFromAskIntent(mercor, "Mercor"), /q=Mercor/i);

const flagler = parseAskIntent("startup called flagler at penn");
assert.equal(browseQueryFromAskIntent(flagler, "startup called flagler at penn").toLowerCase(), "flagler");
{
  const href = browseHrefFromAskIntent(flagler, "startup called flagler at penn");
  assert.match(href, /campus=univ_penn/);
  assert.match(href, /q=flagler/i);
}

console.log("ask-browse tests ok");
