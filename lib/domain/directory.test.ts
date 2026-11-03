import assert from "node:assert/strict";
import {
  directorySortOf,
  loadDirectory,
  logoUrlFromStored,
  searchDirectory,
  signalSortKey,
  sortDirectory,
  type DirectoryCard,
} from "./directory";
import { countCandidateProjects } from "./queries";
import { bucketSum, foundedYearBuckets, hqRegionBuckets } from "./sample-facets";

function card(partial: Partial<DirectoryCard> & Pick<DirectoryCard, "id" | "name">): DirectoryCard {
  return {
    description: null,
    school: null,
    schoolId: null,
    schoolSlug: null,
    sectorId: null,
    sector: null,
    stage: null,
    signalLabel: null,
    signalKind: null,
    signals: 0,
    founders: [],
    latestSignalAt: null,
    logoUrl: null,
    foundedYear: null,
    operatingStatus: null,
    hqRegion: null,
    primaryProgram: null,
    programs: [],
    ...partial,
  };
}

assert.equal(signalSortKey("2026-05-04"), "2026-05-04");
assert.equal(signalSortKey("2026-05"), "2026-05-00");
assert.equal(signalSortKey("2026"), "2026-00-00");
assert.equal(signalSortKey("May 2026"), "");
assert.equal(signalSortKey(null), "");
assert.ok(signalSortKey("2026-05-04") > signalSortKey("2026-05"));
assert.ok(signalSortKey("2026-05") > signalSortKey("2026"));

assert.equal(logoUrlFromStored("website", "https://afterquery.com", "{}"), null);
assert.equal(logoUrlFromStored("logo", "https://cdn.example.com/mark.png", "{}"), "https://cdn.example.com/mark.png");
assert.equal(logoUrlFromStored("description", "not a url", JSON.stringify({ favicon: "https://cdn.example.com/favicon.ico" })), "https://cdn.example.com/favicon.ico");
assert.equal(logoUrlFromStored("description", "", JSON.stringify({ logo: "relative/logo.png" })), null);
assert.equal(logoUrlFromStored("favicon", "ftp://files.example.com/icon.ico", null), null);

assert.equal(directorySortOf(undefined), "rank");
assert.equal(directorySortOf("name"), "name");
assert.equal(directorySortOf("stage"), "stage");
assert.equal(directorySortOf("recent"), "recent");
assert.equal(directorySortOf("newest"), "recent");
assert.equal(directorySortOf("signals"), "rank");

const rows = [
  card({ id: "a", name: "Arden", description: "A translation device for clinics.", founders: ["Aiko Tanaka"], stage: "Seed", latestSignalAt: "2024-01-01", signals: 1 }),
  card({ id: "b", name: "AfterQuery", description: "Research tooling.", founders: ["Spencer Mateega"], stage: "Series A", latestSignalAt: "2026-02-02", signals: 4 }),
  card({ id: "c", name: "Zephyr", description: null, founders: [], stage: null, latestSignalAt: null, signals: 0 }),
  card({ id: "d", name: "Beacon", description: "Hardware for labs.", founders: ["Sam Lee"], stage: "Pre-seed", latestSignalAt: "2025-06-00", signals: 2 }),
];

assert.deepEqual(searchDirectory(rows, "  ").map((item) => item.id), ["a", "b", "c", "d"]);
assert.deepEqual(searchDirectory(rows, "mateega").map((item) => item.id), ["b"]);
assert.deepEqual(searchDirectory(rows, "translation").map((item) => item.id), ["a"]);
assert.deepEqual(searchDirectory(rows, "AfterQuery research").map((item) => item.id), ["b"]);
assert.deepEqual(searchDirectory(rows, "mateega translation"), []);
assert.deepEqual(searchDirectory(rows, "ZEPHYR").map((item) => item.id), ["c"]);

assert.deepEqual(sortDirectory(rows, "name").map((item) => item.name), ["AfterQuery", "Arden", "Beacon", "Zephyr"]);
assert.deepEqual(sortDirectory(rows, "stage").map((item) => item.name), ["Beacon", "Arden", "AfterQuery", "Zephyr"]);
assert.deepEqual(sortDirectory(rows, "recent").map((item) => item.name), ["AfterQuery", "Beacon", "Arden", "Zephyr"]);

{
  const ranked = [
    card({ id: "thin", name: "Coveted", school: null, schoolId: null, signals: 1, signalKind: null, founders: ["A"], latestSignalAt: "2026-10-16" }),
    card({ id: "one", name: "Frutecho", school: "Penn", schoolId: "univ_penn", signals: 1, signalKind: null, founders: ["B"], latestSignalAt: "2026-10-16" }),
    card({ id: "yc", name: "Sim", school: "Berkeley", schoolId: "univ_berkeley", signals: 3, signalKind: "funding", signalLabel: "Funding", founders: ["Emir Karabeg", "Waleed Latif"], programs: ["Y Combinator"], stage: "Seed", latestSignalAt: "2026-09-25" }),
    card({ id: "nocampus", name: "Orphan", school: null, signals: 6, signalKind: "funding", signalLabel: "Funding", founders: ["C", "D"], programs: ["Y Combinator"], latestSignalAt: "2026-10-01" }),
  ];
  const order = sortDirectory(ranked, "rank").map((item) => item.name);
  assert.equal(order[0], "Sim", "a campus company with signals, founders, and a program leads");
  assert.ok(order.indexOf("Sim") < order.indexOf("Frutecho"));
  assert.ok(order.indexOf("Sim") < order.indexOf("Coveted"));
  assert.ok(order.indexOf("Frutecho") < order.indexOf("Coveted"), "a campus outranks a record with no campus");
  assert.ok(order.indexOf("Sim") < order.indexOf("Orphan"), "no campus never leads ahead of a ranked campus company");
}

const stored = loadDirectory();
const after = searchDirectory(stored.cards, "Spencer Mateega").find((item) => item.name === "AfterQuery");
assert.ok(after, "founder name search should find AfterQuery");
assert.ok(after.logoUrl && after.logoUrl.startsWith("/company-logos/"), "AfterQuery should use a verified local logo cache path");
assert.ok(after.logoUrl.endsWith(".webp"), "local logos are webp");
assert.ok(after.founders.includes("Spencer Mateega"));
assert.equal(searchDirectory(stored.cards, "zzzz-not-a-company-zzzz").length, 0);
const sample = stored.cards.slice(0, 40);
const byName = sortDirectory(sample, "name");
assert.deepEqual(
  byName.map((item) => item.name),
  sample.map((item) => item.name).sort((left, right) => left.localeCompare(right)),
);

console.log("directory tests ok");

const live = loadDirectory();
assert.equal(live.cards.length, countCandidateProjects());
assert.equal(bucketSum(foundedYearBuckets(live.cards)), live.cards.length);
assert.equal(bucketSum(hqRegionBuckets(live.cards)), live.cards.length);
console.log("directory count surfaces agree", live.cards.length);

// Live directory: Berkeley peers include the subject company (Sim).
{
  const berkeley = loadDirectory().cards.filter((c) => c.schoolId === "univ_berkeley");
  assert.ok(berkeley.length >= 130, `univ_berkeley peer count (incl. subject), got ${berkeley.length}`);
  assert.ok(berkeley.some((c) => c.name === "Sim"), "Sim is a Berkeley peer");
  assert.equal(
    berkeley.filter((c) => c.id !== "proj_9GUOmdEYxbuH").length,
    berkeley.length - 1,
    "peers excluding Sim",
  );
}

