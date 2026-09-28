// Intent parsing and stage filtering. These do not read the database.

import assert from "node:assert/strict";
import {
  dateKey,
  emptyFundingView,
  fundingFit,
  parseAskIntent,
  type FundingView,
} from "./ask-intent";
import { answerFromRecords, noMatchAnswer } from "./ask-prompt";
import type { AskHit } from "./ask-types";

const penn = parseAskIntent("ANY STARTUPS PRESEED IN PENN");
assert.equal(penn.campus, "Penn");
assert.equal(penn.stage, "pre-seed");
assert.equal(penn.startupFocus, true);
assert.equal(penn.founderFocus, false);
assert.equal(penn.companyName, null);
assert.equal(penn.founderName, null);
assert.equal(penn.confirmedOnly, false);

assert.equal(parseAskIntent("pre-seed startups at penn").stage, "pre-seed");
assert.equal(parseAskIntent("pre seed startups at penn").stage, "pre-seed");
assert.equal(parseAskIntent("presed startups at penn").stage, "pre-seed");
assert.equal(parseAskIntent("upenn preseed companies").campus, "Penn");
assert.equal(parseAskIntent("startups at wharton").campus, "Penn");
assert.equal(parseAskIntent("u penn founders").campus, "Penn");
assert.equal(parseAskIntent("startups in pennsylvania").campus, "Penn");

const berkeley = parseAskIntent("seed startups at berkeley");
assert.equal(berkeley.campus, "Berkeley");
assert.equal(berkeley.stage, "seed");
assert.equal(berkeley.startupFocus, true);
assert.equal(parseAskIntent("seed startups at berkely").campus, "Berkeley");
assert.equal(parseAskIntent("seed startups at berkley").campus, "Berkeley");
assert.equal(parseAskIntent("standford seed startups").campus, "Stanford");

const unfunded = parseAskIntent("unfunded penn founders");
assert.equal(unfunded.campus, "Penn");
assert.equal(unfunded.stage, "unfunded");
assert.equal(unfunded.founderFocus, true);
assert.equal(unfunded.startupFocus, false);

assert.equal(parseAskIntent("penn founders with no funding").stage, "unfunded");
assert.equal(parseAskIntent("bootstrapped berkeley startups").stage, "bootstrapped");
assert.equal(parseAskIntent("self-funded mit companies").stage, "bootstrapped");
assert.equal(parseAskIntent("series a stanford startups").stage, "series a");
assert.equal(parseAskIntent("series-b penn companies").stage, "series b");
assert.equal(parseAskIntent("seriesc mit startups").stage, "series c");
assert.equal(parseAskIntent("angel startups at yale").stage, "angel");
assert.equal(parseAskIntent("friends and family rounds at brown").stage, "angel");

const confirmed = parseAskIntent("confirmed only healthcare startups at penn in 2025");
assert.equal(confirmed.confirmedOnly, true);
assert.equal(confirmed.sector, "healthcare");
assert.equal(confirmed.year, 2025);
assert.equal(confirmed.campus, "Penn");
assert.equal(confirmed.startupFocus, true);
assert.equal(parseAskIntent("fintec startups at cmu").sector, "fintech");
assert.equal(parseAskIntent("class of 2028 penn founders").year, 2028);

const named = parseAskIntent("startup called flagler at penn");
assert.equal(named.companyName, "flagler");
assert.equal(named.campus, "Penn");
const founder = parseAskIntent("founders named ada lovelace at penn");
assert.equal(founder.founderName, "ada lovelace");
assert.equal(founder.founderFocus, true);

assert.equal(dateKey("Fall 2026"), "2026-10-01");
assert.equal(dateKey("Winter 2026"), "2026-01-01");
assert.equal(dateKey("July 21, 2026"), "2026-07-21");
assert.ok(dateKey("Fall 2026") > dateKey("Summer 2026"));

function view(partial: Partial<FundingView>): FundingView {
  return { ...emptyFundingView(), ...partial };
}

const preseed = fundingFit(
  view({ rounds: [{ stage: "Pre-seed", amountText: "$1.3M", date: "2024", leads: ["Foo"] }] }),
  "pre-seed"
);
assert.equal(preseed.fits, true);
assert.equal(preseed.relevance, 100);
assert.match(preseed.label, /Pre-seed \$1\.3M/);

const yc = fundingFit(
  view({ investors: [{ name: "Y Combinator", round: null, kind: "accelerator", batch: "Fall 2026" }] }),
  "pre-seed"
);
assert.equal(yc.fits, true);
assert.equal(yc.relevance, 60);
assert.match(yc.label, /Y Combinator accelerator \(Fall 2026\)/);
assert.equal(yc.recency, "2026-10-01");

const angel = fundingFit(view({ rounds: [{ stage: "Angel", amountText: "$250k", date: null, leads: [] }] }), "pre-seed");
assert.equal(angel.fits, true);
assert.equal(angel.relevance, 90);

const friends = fundingFit(view({ rounds: [{ stage: "Friends & family", amountText: "$50k", date: null, leads: [] }] }), "pre-seed");
assert.equal(friends.fits, true);
assert.equal(friends.relevance, 90);

const grant = fundingFit(
  view({ rounds: [{ stage: "grant", amountText: "$100,000", date: "2024-03", leads: ["Thiel Fellowship"] }] }),
  "pre-seed"
);
assert.equal(grant.fits, true);
assert.equal(grant.relevance, 70);

const bare = fundingFit(view({}), "pre-seed");
assert.equal(bare.fits, true);
assert.equal(bare.relevance, 40);
assert.equal(bare.label, "no priced round recorded");

const seedRound = fundingFit(
  view({ rounds: [{ stage: "Seed", amountText: "$20M", date: "July 21, 2026", leads: ["Lux Capital"] }] }),
  "pre-seed"
);
assert.equal(seedRound.fits, false);
assert.equal(fundingFit(view({ rounds: [{ stage: "Series B", amountText: "$50M", date: "August 11, 2026", leads: [] }] }), "pre-seed").fits, false);

const ycThenSeed = fundingFit(
  view({
    rounds: [{ stage: "Seed", amountText: "$5M", date: "July 29, 2025", leads: ["Sorenson Capital"] }],
    investors: [{ name: "Y Combinator", round: "Seed", kind: "accelerator", batch: "Fall 2024" }],
  }),
  "pre-seed"
);
assert.equal(ycThenSeed.fits, false);

assert.equal(fundingFit(view({ description: "A seed-stage idea." }), "seed").fits, false);
const newsSeed = fundingFit(view({ news: ["Blings.io raises $4 million Seed round"] }), "seed");
assert.equal(newsSeed.fits, true);
assert.match(newsSeed.label, /Seed round/);
assert.equal(fundingFit(view({ rounds: [{ stage: "Seed", amountText: "$20M", date: "July 21, 2026", leads: ["Lux Capital"] }] }), "seed").fits, true);
assert.equal(fundingFit(view({ rounds: [{ stage: "Pre-seed", amountText: "$1.3M", date: null, leads: [] }] }), "seed").fits, false);
assert.equal(fundingFit(view({ rounds: [{ stage: "Series A", amountText: "$28.5M", date: null, leads: [] }] }), "series a").fits, true);
assert.equal(fundingFit(view({ rounds: [{ stage: "Seed", amountText: "$8M", date: null, leads: [] }] }), "series a").fits, false);
assert.equal(fundingFit(view({}), "unfunded").fits, true);
assert.equal(fundingFit(view({ investors: [{ name: "Y Combinator", round: null, kind: "accelerator", batch: "Fall 2026" }] }), "unfunded").fits, false);
assert.equal(fundingFit(view({ description: "The team is bootstrapped." }), "bootstrapped").fits, true);
assert.equal(fundingFit(view({ description: "The team is bootstrapped.", rounds: [{ stage: "Seed", amountText: "$1M", date: null, leads: [] }] }), "bootstrapped").fits, false);

assert.ok(preseed.relevance > yc.relevance);
assert.ok(yc.relevance > bare.relevance);
assert.ok(yc.recency > dateKey("Winter 2026"));

const hit = (name: string, detail: string): AskHit => ({
  id: name,
  kind: "startup",
  name,
  href: `/startup/${name}`,
  detail,
  campuses: ["univ_penn"],
  relatedIds: [],
  sources: [],
});
const listed = answerFromRecords(
  [hit("Deploy", "recorded: Y Combinator accelerator (Fall 2026) · founders: Ada Lovelace")],
  "ANY STARTUPS PRESEED IN PENN",
  12
);
assert.match(listed, /No round is labelled Pre-seed/);
assert.match(listed, /Deploy/);
assert.match(listed, /Y Combinator accelerator \(Fall 2026\)/);
assert.match(listed, /Ada Lovelace/);
const nearest = noMatchAnswer("Stanford startups that raised a Series A", {
  stage: "seed",
  matches: [hit("SkyPilot", "recorded: Seed $20M (July 21, 2026) led by Lux Capital")],
});
assert.match(nearest, /No Series A records match for Stanford/);
assert.match(nearest, /Seed/);
assert.match(nearest, /SkyPilot/);
assert.doesNotMatch(nearest, /Flagler/);

console.log("ask-intent tests ok");
