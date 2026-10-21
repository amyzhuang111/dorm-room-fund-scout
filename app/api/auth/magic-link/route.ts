import { SIGNIN_MESSAGE, authSecret, isAllowedEmail, safeCallbackUrl } from "@/lib/auth/access";
import { createMagicToken } from "@/lib/auth/magic-link";
import { logMissingAuthEnv, SIGNIN_EMAIL_FAILED_MESSAGE, SIGNIN_UNCONFIGURED_MESSAGE } from "@/lib/auth/required-env";
import { magicLinkConfigured, sendSignInEmail } from "@/lib/auth/send-email";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function originFrom(request: Request): string {
  const configured = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

async function tooMany(email: string): Promise<boolean> {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return false;
  try {
    const endpoint = url.replace(/\/$/, "");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const key = `scout-magic-rate:${email}`;
    const incr = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(["INCR", key]) });
    if (!incr.ok) return false;
    const data = (await incr.json()) as { result?: unknown };
    const count = typeof data.result === "number" ? data.result : Number(data.result);
    if (count === 1) {
      await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(["EXPIRE", key, "600"]) });
    }
    return Number.isFinite(count) && count > 5;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { email?: unknown; callbackUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || !isAllowedEmail(email)) {
    return Response.json({ error: SIGNIN_MESSAGE }, { status: 403 });
  }
  if (!authSecret() || !magicLinkConfigured()) {
    logMissingAuthEnv();
    return Response.json({ error: SIGNIN_UNCONFIGURED_MESSAGE }, { status: 503 });
  }
  if (await tooMany(email)) {
    return Response.json({ error: "Wait a few minutes and request another sign-in link." }, { status: 429 });
  }
  const token = await createMagicToken(email);
  if (!token) {
    logMissingAuthEnv();
    return Response.json({ error: SIGNIN_UNCONFIGURED_MESSAGE }, { status: 503 });
  }
  const callbackUrl = safeCallbackUrl(typeof body.callbackUrl === "string" ? body.callbackUrl : null);
  const url = `${originFrom(request)}/signin/verify?${new URLSearchParams({ token, callbackUrl }).toString()}`;
  const sent = await sendSignInEmail(email, url);
  if (!sent.ok) {
    if (sent.error === SIGNIN_UNCONFIGURED_MESSAGE) {
      logMissingAuthEnv();
      return Response.json({ error: SIGNIN_UNCONFIGURED_MESSAGE }, { status: 503 });
    }
    return Response.json({ error: SIGNIN_EMAIL_FAILED_MESSAGE }, { status: 502 });
  }
  return Response.json({ ok: true });
}
