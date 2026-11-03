import assert from "node:assert/strict";
import type { NetworkSummary, NetworkMember } from "./founder-networks-model";
import { searchFounderNetworks, selectedNetworkMembers } from "./network-directory-search";

const networks: NetworkSummary[] = [
  { id: "hbs", label: "HBS Rock Venture Catalyst", kind: "accelerator", founderCount: 6, companyCount: 5, campusCount: 2 },
  { id: "cardinal", label: "Cardinal Ventures", kind: "accelerator", founderCount: 4, companyCount: 3, campusCount: 1 },
  { id: "sequoia", label: "Sequoia Capital", kind: "investor", founderCount: 8, companyCount: 7, campusCount: 3 },
];
const member = (founderName: string, companyName: string, campusLabel: string): NetworkMember =>
  ({ founderId: founderName, founderName, companyId: companyName, companyName, campusId: null, campusLabel, stage: null });
const rosters = {
  hbs: [member("Ava Morgan", "Photon Robotics", "Harvard"), member("Jules Chen", "Harbor AI", "Harvard")],
  cardinal: [member("Mina Park", "Zuca", "Stanford")],
  sequoia: [member("Sam Lee", "Clearwater", "Penn")],
};
assert.deepEqual(searchFounderNetworks(networks, rosters, "", "all").map((r) => r.network.id), ["hbs", "cardinal", "sequoia"]);
assert.deepEqual(searchFounderNetworks(networks, rosters, "venture", "all").map((r) => r.network.id), ["hbs", "cardinal"]);
assert.deepEqual(searchFounderNetworks(networks, rosters, "Ava", "all").map((r) => r.network.id), ["hbs"]);
assert.deepEqual(searchFounderNetworks(networks, rosters, "photon", "all").map((r) => r.network.id), ["hbs"]);
assert.deepEqual(searchFounderNetworks(networks, rosters, "stanford", "all").map((r) => r.network.id), ["cardinal"]);
assert.deepEqual(searchFounderNetworks(networks, rosters, "Sequoia", "accelerator").map((r) => r.network.id), []);
assert.equal(searchFounderNetworks(networks, rosters, "AVa", "all")[0]?.matchingMembers.length, 1);
assert.equal(searchFounderNetworks(networks, rosters, "hbs", "all")[0]?.matchingMembers.length, 2);
assert.equal(selectedNetworkMembers("hbs", searchFounderNetworks(networks, rosters, "photon"), rosters).length, 1);
assert.equal(selectedNetworkMembers("cardinal", searchFounderNetworks(networks, rosters, "photon"), rosters).length, 1);
assert.equal(selectedNetworkMembers(null, [], rosters).length, 0);
console.log("Network search works for programs, founders, companies, campuses and type filters");
