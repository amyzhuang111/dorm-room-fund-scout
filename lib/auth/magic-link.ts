import { authSecret } from "./access";

const TTL_SECONDS = 15 * 60;

type MagicPayload = { email: string; exp: number; jti: string };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncode(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function signaturesMatch(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

function redisCreds(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

// Optional single-use marker. Sessions themselves stay in the Auth.js JWT.
// With no Redis, the link is valid until it expires (15 minutes).
async function consumeJti(jti: string, ttl: number): Promise<"fresh" | "replay" | "unchecked"> {
  const creds = redisCreds();
  if (!creds) return "unchecked";
  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", `scout-magic:${jti}`, "1", "NX", "EX", String(ttl)]),
    });
    if (!res.ok) return "unchecked";
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data.error) return "unchecked";
    return data.result === "OK" ? "fresh" : "replay";
  } catch {
    return "unchecked";
  }
}

export async function createMagicToken(email: string, now = Date.now()): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;
  const payload: MagicPayload = {
    email: email.trim().toLowerCase(),
    exp: Math.floor(now / 1000) + TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
}

export async function verifyMagicToken(token: string, now = Date.now()): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  if (!signaturesMatch(expected, signature)) return null;
  const json = base64UrlDecode(body);
  if (!json) return null;
  let payload: MagicPayload;
  try {
    payload = JSON.parse(json) as MagicPayload;
  } catch {
    return null;
  }
  if (!payload.email || !payload.exp || !payload.jti) return null;
  if (payload.exp * 1000 <= now) return null;
  const used = await consumeJti(payload.jti, Math.max(1, payload.exp - Math.floor(now / 1000)));
  if (used === "replay") return null;
  return payload.email.trim().toLowerCase();
}

export function magicLinkTtlMinutes(): number {
  return TTL_SECONDS / 60;
}
