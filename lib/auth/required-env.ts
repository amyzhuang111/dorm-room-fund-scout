// Names only. Never read these back into a response or a log as values.
// A magic-link sender is RESEND_API_KEY, or EMAIL_SERVER, or all four SMTP_* variables.
// When RESEND_API_KEY is set, SMTP_* is not required.

export const REQUIRED_AUTH_ENV = ["AUTH_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;

const SMTP_ENV = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;

const SECRET_ENV_NAMES = [
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "RESEND_API_KEY",
  "SMTP_PASSWORD",
  "SMTP_USER",
  "EMAIL_SERVER",
  "EMAIL_FROM",
  "AUTH_GOOGLE_SECRET",
  "GOOGLE_CLIENT_SECRET",
] as const;

export const SIGNIN_UNCONFIGURED_MESSAGE = "Sign-in isn't configured yet.";

export const SIGNIN_EMAIL_FAILED_MESSAGE = "The sign-in email could not be sent.";

export type EmailTransport = "resend" | "smtp";

function present(name: string): boolean {
  if (name === "AUTH_SECRET") {
    return Boolean(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim());
  }
  return Boolean(process.env[name]?.trim());
}

export function emailTransport(): EmailTransport | null {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.EMAIL_SERVER?.trim()) return "smtp";
  if (SMTP_ENV.every((name) => present(name))) return "smtp";
  return null;
}

export function missingRequiredAuthEnv(): string[] {
  const missing: string[] = [];
  if (!present("AUTH_SECRET")) missing.push("AUTH_SECRET");
  if (!emailTransport()) {
    for (const name of SMTP_ENV) {
      if (!present(name)) missing.push(name);
    }
  }
  return missing;
}

export function redactSecrets(message: string): string {
  let text = message;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) text = text.split(value).join(`[${name}]`);
  }
  return text;
}

export function logMissingAuthEnv(missing = missingRequiredAuthEnv()): void {
  if (!missing.length) return;
  console.warn(`[auth] Sign-in isn't configured yet. Missing env: ${missing.join(", ")}`);
}
