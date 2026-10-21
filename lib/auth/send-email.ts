import { authSecret } from "./access";
import {
  emailTransport,
  redactSecrets,
  SIGNIN_EMAIL_FAILED_MESSAGE,
  SIGNIN_UNCONFIGURED_MESSAGE,
  type EmailTransport,
} from "./required-env";

export type { EmailTransport };

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const RESEND_DEFAULT_FROM = "Campus Scout <onboarding@resend.dev>";

export function googleAuthConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret() && authSecret());
}

export function magicLinkConfigured(): boolean {
  return Boolean(authSecret() && emailTransport());
}

export function authMethods(): { magicLink: boolean; google: boolean } {
  return { magicLink: magicLinkConfigured(), google: googleAuthConfigured() };
}

export function googleClientId(): string | null {
  const value = process.env.AUTH_GOOGLE_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
  return value || null;
}

export function googleClientSecret(): string | null {
  const value = process.env.AUTH_GOOGLE_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
  return value || null;
}

export function signInFromAddress(): string {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY?.trim()) return RESEND_DEFAULT_FROM;
  return process.env.SMTP_USER?.trim() || RESEND_DEFAULT_FROM;
}

export function signInEmailContent(url: string): { subject: string; text: string } {
  const subject = "Sign in to Campus Scout";
  const text = [
    "Sign in to Campus Scout",
    "",
    "Open this link to sign in to Campus Scout. It expires in 15 minutes.",
    "",
    url,
    "",
    "If you did not ask for this email, you can ignore it.",
  ].join("\n");
  return { subject, text };
}

export async function sendSignInEmail(to: string, url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const transport = emailTransport();
  if (!transport) return { ok: false, error: SIGNIN_UNCONFIGURED_MESSAGE };
  const { subject, text } = signInEmailContent(url);

  try {
    if (transport === "resend") return await sendResend(to, subject, text);
    return await sendSmtp(to, subject, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : SIGNIN_EMAIL_FAILED_MESSAGE;
    console.warn(`[auth] sign-in email failed: ${redactSecrets(message)}`);
    return { ok: false, error: SIGNIN_EMAIL_FAILED_MESSAGE };
  }
}

async function sendResend(to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: SIGNIN_UNCONFIGURED_MESSAGE };
  const res = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: signInFromAddress(), to: [to], subject, text }),
  });
  if (res.ok) return { ok: true };
  let detail = "";
  try {
    detail = await res.text();
  } catch {
    detail = "";
  }
  console.warn(`[auth] resend rejected sign-in email (${res.status}): ${redactSecrets(detail).slice(0, 300)}`);
  return { ok: false, error: SIGNIN_EMAIL_FAILED_MESSAGE };
}

async function sendSmtp(to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const nodemailer = await import("nodemailer");
  const server = process.env.EMAIL_SERVER?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = server
    ? nodemailer.createTransport(server)
    : nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
  await transport.sendMail({ from: signInFromAddress(), to, subject, text });
  return { ok: true };
}
