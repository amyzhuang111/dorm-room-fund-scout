import assert from "node:assert/strict";
import { GET as health } from "../../app/api/auth/health/route";
import { POST as magicLink } from "../../app/api/auth/magic-link/route";
import { SEEDED_ALLOWED_EMAILS } from "./access";
import { SIGNIN_EMAIL_FAILED_MESSAGE, SIGNIN_UNCONFIGURED_MESSAGE } from "./required-env";

const NAMES = [
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_SERVER",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "ALLOWED_EMAILS",
  "AUTH_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

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

function post(email: string) {
  return magicLink(
    new Request("http://localhost:3000/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000" },
      body: JSON.stringify({ email, callbackUrl: "/startup/pipeline" }),
    })
  );
}

async function main() {
  blank();
  process.env.AUTH_SECRET = "super-secret-value";
  process.env.RESEND_API_KEY = "re_test_key_value";

  const ready = await health();
  const readyBody = (await ready.json()) as { ok: boolean; missing: string[]; signIn: string };
  assert.equal(ready.status, 200);
  assert.equal(readyBody.ok, true);
  assert.deepEqual(readyBody.missing, []);
  assert.equal(readyBody.signIn, "ready");
  const readyText = JSON.stringify(readyBody);
  assert.equal(readyText.includes("super-secret-value"), false);
  assert.equal(readyText.includes("re_test_key_value"), false);

  delete process.env.RESEND_API_KEY;
  delete process.env.AUTH_SECRET;
  const down = await health();
  const downBody = (await down.json()) as { ok: boolean; missing: string[] };
  assert.equal(downBody.ok, false);
  assert.equal(downBody.missing.includes("AUTH_SECRET"), true);
  assert.equal(downBody.missing.includes("SMTP_PASSWORD"), true);

  process.env.AUTH_SECRET = "super-secret-value";
  process.env.RESEND_API_KEY = "re_test_key_value";
  delete process.env.ALLOWED_EMAILS;

  const sent: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    sent.push({ url, init });
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  assert.equal(SEEDED_ALLOWED_EMAILS.includes("amyzhuang880@gmail.com"), true);
  const ok = await post("AmyZhuang880@gmail.com");
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, "https://api.resend.com/emails");
  const headers = new Headers(sent[0]?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer re_test_key_value");
  const body = JSON.parse(String(sent[0]?.init?.body)) as { from: string; to: string[]; subject: string; text: string };
  assert.equal(body.from, "Campus Scout <onboarding@resend.dev>");
  assert.deepEqual(body.to, ["amyzhuang880@gmail.com"]);
  assert.match(body.subject, /Campus Scout/);
  assert.match(body.text, /Campus Scout/);
  assert.equal(/\bamy\b|zhuang/i.test(`${body.from}\n${body.subject}\n${body.text}`), false);
  assert.match(body.text, /http:\/\/localhost:3000\/signin\/verify\?/);

  const beforeForbidden = sent.length;
  const forbidden = await post("someone@gmail.com");
  assert.equal(forbidden.status, 403);
  assert.equal(sent.length, beforeForbidden);

  const otherSeed = await post("zhuanga@engineering.upenn.edu");
  assert.equal(otherSeed.status, 200);
  assert.deepEqual(await otherSeed.json(), { ok: true });

  globalThis.fetch = async () => new Response(JSON.stringify({ message: "API key re_test_key_value is invalid" }), { status: 422 });
  const failed = await post("amyzhuang880@gmail.com");
  const failedBody = (await failed.json()) as { error?: string };
  assert.equal(failed.status, 502);
  assert.equal(failedBody.error, SIGNIN_EMAIL_FAILED_MESSAGE);
  assert.equal(JSON.stringify(failedBody).includes("re_test_key_value"), false);

  delete process.env.RESEND_API_KEY;
  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_SERVER"] as const) delete process.env[name];
  const beforeUnconfigured = sent.length;
  globalThis.fetch = async () => {
    sent.push({ url: "unexpected", init: undefined });
    throw new Error("should not send");
  };
  const unconfigured = await post("amyzhuang880@gmail.com");
  const unconfiguredBody = (await unconfigured.json()) as { error?: string };
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfiguredBody.error, SIGNIN_UNCONFIGURED_MESSAGE);
  assert.equal(sent.length, beforeUnconfigured);
  assert.equal(JSON.stringify(unconfiguredBody).includes("super-secret-value"), false);

  console.log("ok auth routes");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(restore);
