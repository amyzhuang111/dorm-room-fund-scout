import assert from "node:assert/strict";
import fs from "node:fs";
import { getDb } from "../../lib/db/client";
import { buildFounderNetworksPage } from "../../lib/domain/founder-networks";
import { searchFounderNetworks } from "../../lib/domain/network-directory-search";

const db = getDb();
const projects = db.prepare("SELECT COUNT(*) AS n FROM projects WHERE kind='company'").get() as { n: number };
assert.ok(projects.n > 4000, "Must use current GitHub corpus, not an old preview database");
const data = buildFounderNetworksPage();
assert.ok(data.topNetworks.length >= 80, "Full observed network universe should load");
assert.equal(data.topNetworks.length, data.totals.networks);
const entries = Object.entries(data.membersByNetwork);
assert.equal(entries.length, data.topNetworks.length);
const allLinks = entries.reduce((sum, [, members]) => sum + members.length, 0);
assert.ok(allLinks >= data.totals.founderLinks, "Do not lose founder links behind old top-80 truncation");
assert.ok(entries.some(([, members]) => members.length > 80), "Large programs must expose full public rosters");
assert.ok(entries.some(([, members]) => members.some(m => /^https?:\/\//i.test(m.sourceUrl ?? ""))), "A source must be available to verify at least some connections");

const rock = data.topNetworks.find(x => x.id === "hbs_rock");
assert.ok(rock && rock.founderCount > 0, "2026 HBS Rock founders must remain included");
const member = data.membersByNetwork.hbs_rock[0];
assert.ok(member?.founderName && member.companyName);
for (const query of [member.founderName, member.companyName, rock.label]) {
  assert.ok(searchFounderNetworks(data.topNetworks, data.membersByNetwork, query)
    .some(x => x.network.id === rock.id), `Search must find ${query}`);
}
assert.deepEqual(searchFounderNetworks(data.topNetworks, data.membersByNetwork, "unlikely__not__present"),
  [], "Unmatched terms must not silently show every founder");
const onlyAccelerators = searchFounderNetworks(data.topNetworks, data.membersByNetwork, "", "accelerator");
assert.ok(onlyAccelerators.length > 0 && onlyAccelerators.every(x => x.network.kind === "accelerator"));

const component = fs.readFileSync("components/networks-app.tsx", "utf8");
for (const marker of [
  "data-network-quick-find", "data-network-map-inspector", "network-roster",
  "data-network-founder-link", "data-network-company-link", "data-network-evidence-link",
  "Copy network link", "sourceUrl",
]) assert.ok(component.includes(marker), `Missing actionable network UI: ${marker}`);
assert.ok(component.includes("namedPersonPath("), "Named founders open their person record");
assert.ok(component.includes("/startup/"), "Company links must open full records");
assert.ok(!component.includes('id="investor-hubs-heading" className="order-5 hidden'), "Do not keep an inaccessible duplicate investor table");

console.log("Network utility validated", {
  companyRows: projects.n,
  networks: data.totals.networks,
  publicFounderNetworkLinks: data.totals.founderLinks,
  fullRosterEntries: allLinks,
  sample: { founder: member.founderName, company: member.companyName },
});
