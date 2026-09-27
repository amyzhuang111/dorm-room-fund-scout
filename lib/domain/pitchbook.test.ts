import assert from "node:assert/strict";
import { foundersPerThousand, formatCapitalUsd, matchPitchbookUniversity } from "./pitchbook-model";

assert.equal(matchPitchbookUniversity("University of California, Berkeley"), "univ_berkeley");
assert.equal(matchPitchbookUniversity("Massachusetts Institute of Technology (MIT)"), "univ_mit");
assert.equal(matchPitchbookUniversity("University of Michigan, Ann Arbor"), "univ_michigan");
assert.equal(matchPitchbookUniversity("University of Texas, Austin"), "univ_utexas");
assert.equal(matchPitchbookUniversity("University of Illinois, Urbana-Champaign"), "univ_uiuc");
assert.equal(matchPitchbookUniversity("University of Virginia, Charlottesville"), "univ_uva");
assert.equal(matchPitchbookUniversity("University of California, Los Angeles (UCLA)"), "univ_ucla");
assert.equal(matchPitchbookUniversity("Washington University in St. Louis"), "univ_washu");
assert.equal(matchPitchbookUniversity("University of Washington"), "univ_uw");
assert.equal(matchPitchbookUniversity("University of Washington, Seattle"), "univ_uw");
assert.equal(matchPitchbookUniversity("Washington University"), "univ_washu");
assert.equal(matchPitchbookUniversity("Cornell University"), "univ_cornell");
assert.equal(matchPitchbookUniversity("Cornell Tech"), "univ_cornell_tech");
assert.equal(matchPitchbookUniversity("Queen's University"), "univ_queens");
assert.equal(matchPitchbookUniversity("Tel Aviv University"), null);
assert.equal(matchPitchbookUniversity("University of California, San Diego"), null);
assert.notEqual(matchPitchbookUniversity("Cornell University"), "univ_cornell_tech");

assert.equal(formatCapitalUsd(139394.26021627351 * 1_000_000), "$139.4B");
assert.equal(formatCapitalUsd(252730.99766470629 * 1_000_000), "$252.7B");
assert.equal(foundersPerThousand(1525, 4535), 336.3);
assert.equal(foundersPerThousand(2380, 33068), 72);

console.log("pitchbook tests ok");
