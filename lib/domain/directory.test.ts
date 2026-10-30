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

assert.equal(directorySortOf(undefined), "recent");
assert.equal(directorySortOf("name"), "name");
assert.equal(directorySortOf("stage"), "stage");
assert.equal(directorySortOf("signals"), "recent");

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

const stored = loadDirectory();
const after = searchDirectory(stored.cards, "Spencer Mateega").find((item) => item.name === "AfterQuery");
assert.ok(after, "founder name search should find AfterQuery");
assert.ok(after.logoUrl && after.logoUrl.startsWith("https://"), "AfterQuery should use a stored https favicon when a website fact exists");
assert.ok(after.logoUrl.includes("afterquery.com"), "favicon should come from the stored website host");
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

// Live directory: Berkeley peers include the subject company (Sim). Export 139 was stale.
{
  const berkeley = loadDirectory().cards.filter((c) => c.schoolId === "univ_berkeley");
  assert.equal(berkeley.length, 138, "univ_berkeley peer count (incl. subject)");
  assert.ok(berkeley.some((c) => c.name === "Sim"), "Sim is a Berkeley peer");
  assert.equal(
    berkeley.filter((c) => c.id !== "proj_9GUOmdEYxbuH").length,
    137,
    "peers excluding Sim",
  );
}

