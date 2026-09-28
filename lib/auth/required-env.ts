// Names only. Never read these back into a response or a log as values.

export const REQUIRED_AUTH_ENV = ["AUTH_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;

export const SIGNIN_UNCONFIGURED_MESSAGE = "Sign-in isn't configured yet.";

function present(name: string): boolean {
  if (name === "AUTH_SECRET") {
    return Boolean(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim());
  }
  return Boolean(process.env[name]?.trim());
}

export function missingRequiredAuthEnv(): string[] {
  return REQUIRED_AUTH_ENV.filter((name) => !present(name));
}

export function logMissingAuthEnv(missing = missingRequiredAuthEnv()): void {
  if (!missing.length) return;
  console.warn(`[auth] Sign-in isn't configured yet. Missing env: ${missing.join(", ")}`);
}
