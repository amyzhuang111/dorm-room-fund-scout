import assert from "node:assert/strict";
import { emailTransport, missingRequiredAuthEnv, REQUIRED_AUTH_ENV } from "./required-env";

const EXTRA = ["NEXTAUTH_SECRET", "RESEND_API_KEY", "EMAIL_SERVER", "EMAIL_FROM"] as const;
const saved = Object.fromEntries([...REQUIRED_AUTH_ENV, ...EXTRA].map((name) => [name, process.env[name]]));

function restore() {
  for (const name of [...REQUIRED_AUTH_ENV, ...EXTRA]) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function blank() {
  for (const name of [...REQUIRED_AUTH_ENV, ...EXTRA]) delete process.env[name];
}

try {
  blank();
  assert.deepEqual(missingRequiredAuthEnv(), [...REQUIRED_AUTH_ENV]);
  assert.equal(emailTransport(), null);

  process.env.AUTH_SECRET = "super-secret-value";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_USER = "scout@localhost";
  process.env.SMTP_PASSWORD = "dummy-password";
  const none = missingRequiredAuthEnv();
  assert.deepEqual(none, []);
  assert.equal(emailTransport(), "smtp");
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

  blank();
  process.env.AUTH_SECRET = "super-secret-value";
  process.env.RESEND_API_KEY = "re_test_key_value";
  process.env.SMTP_PASSWORD = "   ";
  const resendOnly = missingRequiredAuthEnv();
  assert.deepEqual(resendOnly, []);
  assert.equal(emailTransport(), "resend");
  assert.equal(JSON.stringify(resendOnly).includes("re_test_key_value"), false);
  assert.equal(JSON.stringify(resendOnly).includes("super-secret-value"), false);

  delete process.env.AUTH_SECRET;
  const resendNoSecret = missingRequiredAuthEnv();
  assert.deepEqual(resendNoSecret, ["AUTH_SECRET"]);
  assert.equal(resendNoSecret.includes("SMTP_PASSWORD"), false);

  process.env.RESEND_API_KEY = "   ";
  process.env.AUTH_SECRET = "super-secret-value";
  assert.equal(emailTransport(), null);
  assert.deepEqual(missingRequiredAuthEnv(), [...REQUIRED_AUTH_ENV.slice(1)]);

  blank();
  process.env.AUTH_SECRET = "super-secret-value";
  process.env.EMAIL_SERVER = "smtp://scout:dummy-password@127.0.0.1:2525";
  assert.equal(emailTransport(), "smtp");
  assert.deepEqual(missingRequiredAuthEnv(), []);
  assert.equal(JSON.stringify(missingRequiredAuthEnv()).includes("dummy-password"), false);

  console.log("ok required auth env");
} finally {
  restore();
}
