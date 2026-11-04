import assert from "node:assert/strict";
import { ellipsisAtBoundary } from "./ellipsis";

assert.equal(ellipsisAtBoundary("Hello world", 40), "Hello world");

{
  const out = ellipsisAtBoundary("Alpha beta gamma delta epsilon", 14);
  assert.equal(out, "Alpha beta…");
  assert.equal(out.includes("gamm"), false);
}

{
  const out = ellipsisAtBoundary("First sentence. Second continues here forever.", 40);
  assert.equal(out, "First sentence.…");
}

console.log("ellipsis.test.ts ok");
