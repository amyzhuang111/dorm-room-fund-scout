import { authSecret } from "./access";

export type EmailTransport = "resend" | "smtp";

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

function emailTransport(): EmailTransport | null {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.EMAIL_SERVER?.trim()) return "smtp";
  if (
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_PORT?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASSWORD?.trim()
  ) {
    return "smtp";
  }
  return null;
}

function fromAddress(): string {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  if (process.env.RESEND_API_KEY?.trim()) return "Campus Scout <onboarding@resend.dev>";
  return process.env.SMTP_USER?.trim() || "Campus Scout <onboarding@resend.dev>";
}

export async function sendSignInEmail(to: string, url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const transport = emailTransport();
  if (!transport) return { ok: false, error: "Sign-in isn't configured yet." };
  const subject = "Sign in to Campus Scout";
  const text = [
    "Sign in to Campus Scout",
    "",
    "Pipeline and Shortlist are for Dorm Room Fund members. Open this link to sign in. It expires in 15 minutes.",
    "",
    url,
    "",
    "If you did not ask for this email, you can ignore it.",
  ].join("\n");

  try {
    if (transport === "resend") return await sendResend(to, subject, text);
    return await sendSmtp(to, subject, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email could not be sent.";
    console.warn(`[auth] sign-in email failed: ${redactMailError(message)}`);
    return { ok: false, error: "The sign-in email could not be sent." };
  }
}

async function sendResend(to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "Sign-in isn't configured yet." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, text }),
  });
  if (res.ok) return { ok: true };
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) detail = ` ${body.message}`;
  } catch {
    detail = "";
  }
  return { ok: false, error: `The email service rejected the sign-in message.${detail}` };
}

function redactMailError(message: string): string {
  let text = message;
  for (const name of ["AUTH_SECRET", "NEXTAUTH_SECRET", "SMTP_PASSWORD", "SMTP_USER", "RESEND_API_KEY", "EMAIL_SERVER"]) {
    const value = process.env[name]?.trim();
    if (value) text = text.split(value).join(`[${name}]`);
  }
  return text;
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
  await transport.sendMail({ from: fromAddress(), to, subject, text });
  return { ok: true };
}
