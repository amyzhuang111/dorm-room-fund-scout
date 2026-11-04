import assert from "node:assert/strict";
import { decideEnrollment, isEligibleForFounderDirectory } from "./founder-status";

assert.equal(
  isEligibleForFounderDirectory({ enrollmentStatus: "older_alumni", affiliationStatus: "unverified" }),
  false,
);
assert.equal(
  isEligibleForFounderDirectory({ enrollmentStatus: "recent_grad", affiliationStatus: "older_alumni" }),
  true,
);
assert.equal(
  isEligibleForFounderDirectory({ enrollmentStatus: "unknown", affiliationStatus: "older_alumni" }),
  false,
);
assert.equal(
  isEligibleForFounderDirectory({ enrollmentStatus: "current_student", affiliationStatus: "unverified" }),
  true,
);
assert.equal(
  isEligibleForFounderDirectory({ enrollmentGradYear: 2015, enrollmentStatus: "unknown" }),
  false,
);

const josh = decideEnrollment(
  [
    {
      excerpt: "Josh Aviv '15 'G17, first developed SparkCharge as a student at Syracuse University",
      sourceUrl: null,
      sourceId: null,
    },
  ],
  { personName: "Josh Aviv" },
);
assert.equal(josh.status, "older_alumni");
assert.ok(josh.gradYear === 2017 || josh.gradYear === 2015, JSON.stringify(josh));

console.log("eligibility-directory tests ok", { josh });
