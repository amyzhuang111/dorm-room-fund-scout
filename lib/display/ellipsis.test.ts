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
  assert.equal(out, "First sentence…");
  assert.equal(out.includes(".…"), false);
  assert.equal(out.endsWith(".…"), false);
}

{
  // Never mid-word, even when the only space is early in the window
  const out = ellipsisAtBoundary("Supercalifragilistic expialidocious forevermore", 22);
  assert.ok(out.endsWith("…"));
  assert.equal(out.includes(".…"), false);
  assert.ok(!/expialidociou[^s]/.test(out.replace(/…$/, "")));
  assert.ok(!out.replace(/…$/, "").endsWith(" "));
  // last char before ellipsis is end of a whole word
  const body = out.replace(/…$/, "");
  assert.ok(/\w$/.test(body));
}

console.log("ellipsis.test.ts ok");
