import assert from "node:assert/strict";
import { DRF_SIGNIN_MESSAGE, SEEDED_ALLOWED_EMAILS, isAllowedEmail, isProtectedPath, safeCallbackUrl } from "./access";

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

test("DRF message is the member notice", () => {
  assert.equal(DRF_SIGNIN_MESSAGE, "Pipeline and Shortlist are for Dorm Room Fund members, sign in with your DRF email");
});

test("dormroomfund.com addresses are allowed", () => {
  delete process.env.ALLOWED_EMAILS;
  assert.equal(isAllowedEmail("Ada@DormRoomFund.com"), true);
  assert.equal(isAllowedEmail("ada@notdormroomfund.com"), false);
  assert.equal(isAllowedEmail("ada@sub.dormroomfund.com"), false);
});

test("seeded owner emails are allowed when ALLOWED_EMAILS is unset", () => {
  delete process.env.ALLOWED_EMAILS;
  for (const email of SEEDED_ALLOWED_EMAILS) assert.equal(isAllowedEmail(email), true);
  assert.equal(isAllowedEmail("someone@gmail.com"), false);
});

test("ALLOWED_EMAILS replaces the seed list", () => {
  process.env.ALLOWED_EMAILS = "partner@example.com";
  assert.equal(isAllowedEmail("partner@example.com"), true);
  assert.equal(isAllowedEmail("amyzhuang880@gmail.com"), false);
  assert.equal(isAllowedEmail("member@dormroomfund.com"), true);
});

test("an empty allowlist still keeps the DRF domain", () => {
  process.env.ALLOWED_EMAILS = "";
  assert.equal(isAllowedEmail("amyzhuang880@gmail.com"), false);
  assert.equal(isAllowedEmail("member@dormroomfund.com"), true);
});

test("protected paths are pipeline, shortlist, and their APIs", () => {
  assert.equal(isProtectedPath("/startup/pipeline"), true);
  assert.equal(isProtectedPath("/founder/shortlist"), true);
  assert.equal(isProtectedPath("/api/user-pipeline/duplicates"), true);
  assert.equal(isProtectedPath("/pipeline"), true);
  assert.equal(isProtectedPath("/shortlist"), true);
  assert.equal(isProtectedPath("/startup/discover"), false);
  assert.equal(isProtectedPath("/alumni"), false);
  assert.equal(isProtectedPath("/hotspots"), false);
  assert.equal(isProtectedPath("/news"), false);
  assert.equal(isProtectedPath("/api/ask"), false);
  assert.equal(isProtectedPath("/api/network/map"), false);
});

test("callback urls stay on this site", () => {
  assert.equal(safeCallbackUrl("/founder/shortlist?from=founder"), "/founder/shortlist?from=founder");
  assert.equal(
    safeCallbackUrl("/startup/pipeline?outreach=proj_1&referrer=person_drf_a"),
    "/startup/pipeline?outreach=proj_1&referrer=person_drf_a"
  );
  assert.equal(safeCallbackUrl("https://evil.example"), "/startup/pipeline");
  assert.equal(safeCallbackUrl("//evil.example"), "/startup/pipeline");
  assert.equal(safeCallbackUrl("/signin"), "/startup/pipeline");
});

restore();
