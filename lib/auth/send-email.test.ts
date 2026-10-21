import assert from "node:assert/strict";
import { SIGNIN_EMAIL_FAILED_MESSAGE, SIGNIN_UNCONFIGURED_MESSAGE } from "./required-env";
import { sendSignInEmail, signInEmailContent, signInFromAddress } from "./send-email";

const NAMES = ["AUTH_SECRET", "NEXTAUTH_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_SERVER", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function restore() {
  for (const name of NAMES) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}

function blank() {
  for (const name of NAMES) delete process.env[name];
}

function assertNeutral(value: string) {
  assert.match(value, /Campus Scout/);
  assert.equal(/\bamy\b|zhuang|zhuanga/i.test(value), false);
}

type Sent = { url: string; init: RequestInit | undefined };

async function main() {
  const content = signInEmailContent("https://scout.example/signin/verify?token=abc");
  assert.equal(content.subject, "Sign in to Campus Scout");
  assertNeutral(content.subject);
  assertNeutral(content.text);
  assert.match(content.text, /https:\/\/scout\.example\/signin\/verify\?token=abc/);

  blank();
  const unconfigured = await sendSignInEmail("scout@example.com", "https://scout.example/in");
  assert.deepEqual(unconfigured, { ok: false, error: SIGNIN_UNCONFIGURED_MESSAGE });

  process.env.RESEND_API_KEY = "re_test_key_value";
  assert.equal(signInFromAddress(), "Campus Scout <onboarding@resend.dev>");
  process.env.EMAIL_FROM = "Campus Scout <mail@example.com>";
  assert.equal(signInFromAddress(), "Campus Scout <mail@example.com>");
  assertNeutral(signInFromAddress());

  const calls: Sent[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  const sent = await sendSignInEmail("scout@example.com", "https://scout.example/signin/verify?token=abc");
  assert.deepEqual(sent, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.resend.com/emails");
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer re_test_key_value");
  const body = JSON.parse(String(calls[0]?.init?.body)) as { from: string; to: string[]; subject: string; text: string };
  assert.equal(body.from, "Campus Scout <mail@example.com>");
  assert.deepEqual(body.to, ["scout@example.com"]);
  assertNeutral(body.from);
  assertNeutral(body.subject);
  assertNeutral(body.text);
  assert.match(body.text, /token=abc/);

  delete process.env.EMAIL_FROM;
  calls.length = 0;
  await sendSignInEmail("scout@example.com", "https://scout.example/in");
  const fallbackFrom = JSON.parse(String(calls[0]?.init?.body)) as { from: string };
  assert.equal(fallbackFrom.from, "Campus Scout <onboarding@resend.dev>");

  globalThis.fetch = async () => new Response(JSON.stringify({ message: "invalid key re_test_key_value" }), { status: 403 });
  const rejected = await sendSignInEmail("scout@example.com", "https://scout.example/in");
  assert.deepEqual(rejected, { ok: false, error: SIGNIN_EMAIL_FAILED_MESSAGE });
  assert.equal(rejected.ok === false && rejected.error.includes("re_test_key_value"), false);

  globalThis.fetch = async () => {
    throw new Error("network down re_test_key_value");
  };
  const thrown = await sendSignInEmail("scout@example.com", "https://scout.example/in");
  assert.deepEqual(thrown, { ok: false, error: SIGNIN_EMAIL_FAILED_MESSAGE });

  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_USER = "scout@localhost";
  process.env.SMTP_PASSWORD = "dummy-password";
  calls.length = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "email_456" }), { status: 200 });
  };
  const preferred = await sendSignInEmail("scout@example.com", "https://scout.example/in");
  assert.deepEqual(preferred, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.resend.com/emails");

  delete process.env.RESEND_API_KEY;
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_USER = "scout@localhost";
  process.env.SMTP_PASSWORD = "dummy-password";
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error("resend should not be called");
  };
  assert.equal(signInFromAddress(), "scout@localhost");
  const smtp = await sendSignInEmail("scout@example.com", "https://scout.example/in");
  assert.equal(fetched, false);
  assert.equal(smtp.ok, false);
  if (!smtp.ok) {
    assert.equal(smtp.error, SIGNIN_EMAIL_FAILED_MESSAGE);
    assert.equal(smtp.error.includes("dummy-password"), false);
  }

  console.log("ok send email");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(restore);
