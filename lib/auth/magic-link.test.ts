import assert from "node:assert/strict";
import { createMagicToken, verifyMagicToken } from "./magic-link";

const savedSecret = process.env.AUTH_SECRET;
const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;

async function main() {
  process.env.AUTH_SECRET = "test-secret-for-magic-link";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  const email = "scout@example.com";
  const now = Date.parse("2026-09-27T12:00:00Z");

  const token = await createMagicToken(email, now);
  assert.ok(token);
  assert.equal(await verifyMagicToken(token, now + 60_000), email);
  assert.equal(await verifyMagicToken(token, now + 16 * 60_000), null);
  assert.equal(await verifyMagicToken(`${token}x`, now), null);

  const again = await createMagicToken(email, now);
  assert.notEqual(token, again);

  delete process.env.AUTH_SECRET;
  assert.equal(await createMagicToken(email, now), null);
  assert.equal(await verifyMagicToken(token, now), null);
  console.log("ok magic link");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (savedSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = savedSecret;
    if (savedUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = savedUrl;
    if (savedToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
  });
