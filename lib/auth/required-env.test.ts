import assert from "node:assert/strict";
import { missingRequiredAuthEnv, REQUIRED_AUTH_ENV } from "./required-env";

const saved = Object.fromEntries(REQUIRED_AUTH_ENV.map((name) => [name, process.env[name]]));
const savedNext = process.env.NEXTAUTH_SECRET;

function restore() {
  for (const name of REQUIRED_AUTH_ENV) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  if (savedNext === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = savedNext;
}

function blank() {
  for (const name of REQUIRED_AUTH_ENV) delete process.env[name];
  delete process.env.NEXTAUTH_SECRET;
}

try {
  blank();
  assert.deepEqual(missingRequiredAuthEnv(), [...REQUIRED_AUTH_ENV]);

  process.env.AUTH_SECRET = "super-secret-value";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_USER = "scout@localhost";
  process.env.SMTP_PASSWORD = "dummy-password";
  const none = missingRequiredAuthEnv();
  assert.deepEqual(none, []);
  assert.equal(JSON.stringify(none).includes("super-secret-value"), false);
  assert.equal(JSON.stringify(none).includes("dummy-password"), false);

  delete process.env.AUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "other-secret";
  assert.equal(missingRequiredAuthEnv().includes("AUTH_SECRET"), false);

  delete process.env.NEXTAUTH_SECRET;
  process.env.SMTP_PORT = "   ";
  const missing = missingRequiredAuthEnv();
  assert.deepEqual(missing, ["AUTH_SECRET", "SMTP_PORT"]);
  assert.equal(missing.some((name) => name.includes("127.0.0.1")), false);

  console.log("ok required auth env");
} finally {
  restore();
}
