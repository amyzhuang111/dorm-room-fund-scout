import assert from "node:assert/strict";
import { namedPersonPath, namedPersonTarget } from "./person-href";

assert.equal(namedPersonPath("person_Pvwm0NBqQSQo"), "/founders/person_Pvwm0NBqQSQo");
assert.equal(namedPersonPath("a/b"), "/founders/a%2Fb");

assert.equal(
  namedPersonTarget({ founder: "person_Pvwm0NBqQSQo", enroll: "current_student" }),
  "/founders/person_Pvwm0NBqQSQo",
);
assert.equal(namedPersonTarget({ person: " person_old " }), "/founders/person_old");
assert.equal(
  namedPersonTarget({ founder: "person_old" }, (id) => (id === "person_old" ? "person_new" : null)),
  "/founders/person_new",
);
assert.equal(namedPersonTarget({}), null);
assert.equal(namedPersonTarget({ founder: "  ", q: "Victor" }), null);
assert.equal(namedPersonTarget({ q: "Victor Espinosa", campus: "univ_gatech" }), null);

console.log("person href tests ok");
