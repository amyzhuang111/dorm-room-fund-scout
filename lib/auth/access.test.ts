import assert from "node:assert/strict";
import { SIGNIN_MESSAGE, SEEDED_ALLOWED_EMAILS, isAllowedEmail, isProtectedPath, safeCallbackUrl } from "./access";

const saved = process.env.ALLOWED_EMAILS;

function restore() {
  if (saved === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = saved;
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    restore();
    console.error(`fail ${name}`);
    throw err;
  }
}

test("sign-in copy is fund-neutral", () => {
  assert.equal(SIGNIN_MESSAGE, "Campus Scout is open without an account. Sign-in is optional.");
  assert.equal(/\bdrf\b|dorm room|\bamy\b/i.test(SIGNIN_MESSAGE), false);
});

test("an unset allowlist allows nobody", () => {
  delete process.env.ALLOWED_EMAILS;
  assert.equal(SEEDED_ALLOWED_EMAILS.length, 0);
  assert.equal(isAllowedEmail("scout@example.com"), false);
  assert.equal(isAllowedEmail("someone@gmail.com"), false);
});

test("ALLOWED_EMAILS is the only allowlist", () => {
  process.env.ALLOWED_EMAILS = "partner@example.com";
  assert.equal(isAllowedEmail("partner@example.com"), true);
  assert.equal(isAllowedEmail("Scout@Example.com"), false);
  assert.equal(isAllowedEmail("someone@gmail.com"), false);
});

test("an empty allowlist allows nobody", () => {
  process.env.ALLOWED_EMAILS = "";
  assert.equal(isAllowedEmail("partner@example.com"), false);
  assert.equal(isAllowedEmail("scout@example.com"), false);
});

test("no route is member-gated", () => {
  for (const path of [
    "/startup/pipeline",
    "/founder/shortlist",
    "/api/user-pipeline/duplicates",
    "/pipeline",
    "/shortlist",
    "/startup/discover",
    "/alumni",
    "/hotspots",
    "/news",
    "/api/ask",
    "/api/network/map",
  ]) {
    assert.equal(isProtectedPath(path), false, path);
  }
});

test("callback urls stay on this site", () => {
  assert.equal(safeCallbackUrl("/founder/shortlist?from=founder"), "/founder/shortlist?from=founder");
  assert.equal(safeCallbackUrl("/startup/pipeline?outreach=proj_1"), "/startup/pipeline?outreach=proj_1");
  assert.equal(safeCallbackUrl("https://evil.example"), "/startup/pipeline");
  assert.equal(safeCallbackUrl("//evil.example"), "/startup/pipeline");
  assert.equal(safeCallbackUrl("/signin"), "/startup/pipeline");
});

restore();
