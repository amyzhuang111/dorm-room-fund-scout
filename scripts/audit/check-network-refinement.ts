import assert from "node:assert/strict";
import { buildFounderNetworksPage } from "../../lib/domain/founder-networks";
import { NETWORK_ZOOM_PRESETS } from "../../lib/domain/network-zoom-presets";
import { getDb } from "../../lib/db/client";

const db = getDb();
const companies = db.prepare("SELECT COUNT(*) AS n FROM projects WHERE kind='company'").get() as { n: number };
assert.ok(companies.n >= 1500, "Use the latest merged startup database, not the old r50 preview snapshot");
const page = buildFounderNetworksPage();
assert.ok(page.topNetworks.length > 24, "All network hubs should be accessible, not capped to 24");
assert.equal(page.topNetworks.length, page.totals.networks, "All evidenced hubs appear in the directory");
assert.ok(page.totals.foundersLinked > 0);
assert.ok(page.topNetworks.every((network) => network.founderCount > 0), "No empty program source should be represented as a founded relationship");

for (const id of ["hbs_rock", "cardinal"]) {
  const net = page.topNetworks.find((item) => item.id === id);
  assert.ok(net && net.founderCount > 0, `Imported 2026 roster missing evidenced founders in ${id}`);
  assert.ok(page.membersByNetwork[id].length, `Program ${id} must link to named founders`);
}
assert.equal(NETWORK_ZOOM_PRESETS.length, 5);
console.log("Network map sourced from current GitHub corpus:", {
  companies: companies.n,
  networks: page.totals.networks,
  founderLinks: page.totals.founderLinks,
  foundersLinked: page.totals.foundersLinked,
  hbsRock: page.topNetworks.find((item) => item.id === "hbs_rock")?.founderCount,
  cardinal: page.topNetworks.find((item) => item.id === "cardinal")?.founderCount,
  zoomLevels: NETWORK_ZOOM_PRESETS.map((item) => item.id),
});
