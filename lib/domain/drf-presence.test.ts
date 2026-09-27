import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DRF_SCHOOL_UNIVERSITY, comparePresence, evidenceUrls, parsePresenceRecords, presenceId, statusRank } from "./drf-presence";
import { parseCsv } from "./hotspot-model";

assert.deepEqual(evidenceUrls("https://www.dormroomfund.com/our-team ; https://www.dormroomfund.com/join"), [
  "https://www.dormroomfund.com/our-team",
  "https://www.dormroomfund.com/join",
]);
assert.deepEqual(evidenceUrls("none found"), []);
assert.equal(presenceId("Penn / Wharton"), "dcp_penn_wharton");
assert.equal(presenceId("Stanford (incl. GSB)"), presenceId("Stanford (incl. GSB)"));

const csv = fs.readFileSync(path.join(process.cwd(), "data", "imports", "drf_campus_presence.csv"), "utf8");
const rows = parsePresenceRecords(parseCsv(csv));
assert.equal(rows.length, 36);
for (const row of rows) assert.ok(row.school in DRF_SCHOOL_UNIVERSITY, row.school);

const byStatus = new Map<string, number>();
for (const row of rows) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
assert.equal(byStatus.get("Current partner"), 16);
assert.equal(byStatus.get("Recent partner"), 10);
assert.equal(byStatus.get("Historical + portfolio"), 1);
assert.equal(byStatus.get("Historical"), 2);
assert.equal(byStatus.get("Portfolio-only"), 1);
assert.equal(byStatus.get("Unverified"), 6);

const penn = rows.find((row) => row.school === "Penn / Wharton");
assert.ok(penn);
assert.equal(penn.partnerCount, 8);
assert.match(penn.namedPartners, /Om Shastri/);
assert.equal(penn.evidenceLinks.length, 1);
const rice = rows.find((row) => row.school === "Rice");
assert.ok(rice);
assert.equal(rice.partnerCount, 0);
assert.deepEqual(rice.evidenceLinks, []);

const sorted = [...rows].sort(comparePresence);
assert.equal(sorted[0].status, "Current partner");
assert.ok(statusRank("Current partner") < statusRank("Recent partner"));
assert.ok(statusRank("Recent partner") < statusRank("Unverified"));
assert.equal(sorted.at(-1)?.status, "Unverified");

console.log("drf-presence tests ok");
