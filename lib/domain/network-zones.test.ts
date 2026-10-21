import assert from "node:assert/strict";
import { campusOrgCards, cardIsExternal, orgsForCampus } from "./network-zones";
import { layoutZonedCampus } from "./network-layout";

const cards = campusOrgCards();
assert.equal(cards.some((card) => /pennapps organ/i.test(card.place)), false);

const berkeley = orgsForCampus("univ_berkeley", cards);
const one = (list: typeof berkeley, pattern: RegExp) => {
  const hits = list.filter((org) => pattern.test(org.label));
  assert.equal(hits.length, 1, pattern.source);
  return hits[0];
};

const free = one(berkeley, /free ventures/i);
assert.equal(free.tier, "A");
assert.equal(free.zone, "internal");
const cal = one(berkeley, /cal hacks/i);
assert.equal(cal.tier, "B");
assert.equal(cal.zone, "internal");
const eb = one(berkeley, /^Entrepreneurs@Berkeley$/);
assert.equal(eb.tier, "B");
assert.equal(eb.zone, "internal");
assert.equal(one(berkeley, /web development at berkeley/i).tier, "A");
assert.equal(one(berkeley, /skydeck/i).tier, "C");
assert.equal(one(berkeley, /skydeck/i).zone, "internal");
assert.equal(one(berkeley, /ai entrepreneurs/i).tier, "A");
assert.equal(one(berkeley, /berkeley ai research/i).tier, "A");
assert.equal(one(berkeley, /^Codebase$/).tier, "B");
assert.equal(one(berkeley, /accel scholars/i).zone, "internal");
assert.equal(one(berkeley, /accel scholars/i).tier, "A");
assert.equal(one(berkeley, /uc launch/i).zone, "external");
assert.equal(one(berkeley, /pear/i).zone, "external");
assert.equal(one(berkeley, /pear/i).tier, "A");
assert.equal(one(berkeley, /y combinator/i).zone, "external");

const stanford = orgsForCampus("univ_stanford", cards);
const mayfield = stanford.filter((org) => /mayfield/i.test(org.label));
assert.equal(mayfield.length, 1);
assert.equal(mayfield[0].tier, "S");
assert.equal(mayfield[0].zone, "internal");
assert.equal(one(stanford, /stanford ai lab/i).tier, "A");
assert.equal(one(stanford, /pear/i).label, "Pear Fellows / Pear Garage");
assert.equal(stanford.filter((org) => /prod fellowship/i.test(org.label)).length, 1);
assert.equal(one(stanford, /prod fellowship/i).zone, "external");

const penn = orgsForCampus("univ_penn", cards);
assert.equal(one(penn, /^Penn Labs$/).tier, "A");
assert.equal(one(penn, /pennapps/i).tier, "A");
assert.equal(one(penn, /hack4impact/i).tier, "A");
assert.equal(one(penn, /electric racing/i).tier, "A");
assert.equal(one(penn, /aerial robotics/i).tier, "A");
assert.equal(one(penn, /grasp/i).tier, "A");
assert.equal(one(penn, /grasp/i).zone, "internal");

assert.equal(one(orgsForCampus("univ_mit", cards), /csail/i).tier, "A");
assert.equal(one(orgsForCampus("univ_cmu", cards), /robotics institute/i).tier, "A");
assert.equal(one(orgsForCampus("univ_cmu", cards), /machine learning department/i).tier, "A");

const emory = orgsForCampus("univ_emory", cards);
assert.equal(one(emory, /techstars/i).zone, "external");
const laurentian = orgsForCampus("univ_laurentian", cards);
assert.equal(one(laurentian, /norcat/i).zone, "external");
assert.equal(one(laurentian, /foundry|fonderie/i).zone, "internal");

const keys = new Set<string>();
for (const org of penn) {
  assert.equal(keys.has(org.key), false, org.key);
  keys.add(org.key);
}

assert.equal(cardIsExternal(cards.find((card) => card.place === "Y Combinator (funded founders)")!), true);
assert.equal(cardIsExternal(cards.find((card) => card.place.startsWith("Mayfield Fellows"))!), false);

const placed = layoutZonedCampus(
  [
    { id: "u", type: "university", label: "Penn" },
    { id: "s", type: "community", label: "Mayfield", zone: "internal", tier: "S" },
    { id: "c", type: "community", label: "Club", zone: "internal", tier: "C" },
    { id: "y", type: "community", label: "YC", zone: "external", tier: "S" },
    { id: "p", type: "person", label: "Ada" },
    { id: "co", type: "project", label: "Ada Co" },
  ],
  [
    { source: "s", target: "u", relationshipType: "affiliated_with" },
    { source: "c", target: "u", relationshipType: "affiliated_with" },
    { source: "y", target: "u", relationshipType: "affiliated_with" },
    { source: "p", target: "s", relationshipType: "contributed_to" },
    { source: "p", target: "co", relationshipType: "founded" },
  ],
);
const at = (id: string) => placed.positions.get(id)!;
assert.ok(at("s").x > 0, "on-campus orgs sit on the right");
assert.ok(at("y").x < 0, "outside programs sit on the left");
assert.ok(Math.hypot(at("s").x, at("s").y) < Math.hypot(at("c").x, at("c").y));
assert.ok(Math.hypot(at("s").x, at("s").y) < Math.hypot(at("p").x, at("p").y));
assert.ok(placed.guides.some((guide) => guide.text === "OUTSIDE"));
assert.ok(placed.guides.some((guide) => guide.text === "ON CAMPUS"));
assert.ok(placed.guides.some((guide) => guide.kind === "tier" && guide.text === "S"));
assert.ok(placed.guides.some((guide) => guide.kind === "tier" && guide.text === "C"));

console.log("network zones ok", { berkeley: berkeley.length, stanford: stanford.length, penn: penn.length });
