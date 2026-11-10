import assert from "node:assert/strict";
import { readPersonScope } from "./claim-scope";
import { classYearBandCaption, classYearBandTotal, classYearBars, countClassYears } from "./class-year-cohort";

const rows = [
  { id: "unknown-year", year: 2027 },
  { id: "unknown-year", year: 2028 },
  { id: "left-school", year: 2025 },
  { id: "degree-not-stated", year: 2024 },
  { id: "enrolled", year: 2026 },
  { id: "event-only", year: null },
  { id: "no-year", year: null },
];

const counts = countClassYears(rows);
assert.deepEqual(counts, [
  { year: 2024, count: 1 },
  { year: 2025, count: 1 },
  { year: 2026, count: 1 },
  { year: 2027, count: 1 },
]);

const recent = classYearBars(counts, "recent_class_years");
assert.deepEqual(recent.map((bar) => bar.count), [1, 1, 0, 0]);
assert.equal(classYearBandTotal(recent), 2);
const recentCaption = classYearBandCaption("recent_class_years", classYearBandTotal(recent), rows.length);
assert.match(recentCaption, /Class years 2026 to 2029 on file\. 2 of 7 founders\./);
assert.match(recentCaption, /not present enrollment/);
assert.doesNotMatch(recentCaption, /current student/i);
assert.doesNotMatch(recentCaption, /alumni/i);

const earlier = classYearBars(counts, "earlier_class_years");
assert.equal(classYearBandTotal(earlier), 2);
const earlierCaption = classYearBandCaption("earlier_class_years", 2, 7);
assert.match(earlierCaption, /Class years through 2025 on file/);
assert.match(earlierCaption, /not a graduation record/);
assert.doesNotMatch(earlierCaption, /alumni/i);
assert.doesNotMatch(earlierCaption, /current student/i);

const penn = classYearBars(
  [
    { year: 2026, count: 51 },
    { year: 2027, count: 23 },
    { year: 2028, count: 6 },
    { year: 2029, count: 17 },
  ],
  "recent_class_years",
);
assert.equal(classYearBandTotal(penn), 97);
const pennCaption = classYearBandCaption("recent_class_years", 97, 768);
assert.match(pennCaption, /97 of 768 founders/);
assert.doesNotMatch(pennCaption, /current student/i);

const unknown = readPersonScope({
  name: "Nami Lindquist",
  year: 2027,
  status: "current_student",
  basis: "verified",
  evidence: "Nami Lindquist is named on a campus page.",
});
assert.equal(unknown.present, "unknown");
assert.equal(countClassYears([{ id: "nami", year: 2027 }])[0]?.count, 1);

const victor = readPersonScope({
  name: "Victor Espinosa",
  year: 2026,
  status: "current_student",
  basis: "verified",
  evidence: "The CREATE-X article says Victor Espinosa is currently pursuing his master's degree in computer science at Georgia Tech.",
});
assert.equal(victor.present, "current_student");
assert.equal(countClassYears([{ id: "victor", year: 2026 }])[0]?.year, 2026);
assert.doesNotMatch(classYearBandCaption("recent_class_years", 1, 1), /enrolled/i);

const departed = readPersonScope({
  name: "Ada Left",
  year: 2025,
  leftSchool: true,
  status: "recent_grad",
  basis: "verified",
  evidence: "Ada Left left school in 2024.",
});
assert.equal(departed.present, "unknown");
assert.equal(classYearBars(countClassYears([{ id: "ada", year: 2025 }]), "earlier_class_years").find((bar) => bar.label === "2025")?.count, 1);

console.log("class year cohort tests ok");
