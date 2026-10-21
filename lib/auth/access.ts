// Optional sign-in. The generic workspace does not gate any route.
// ALLOWED_EMAILS can still restrict the optional sign-in form.
// When that variable is unset, nobody is on the allowlist.

export const SIGNIN_MESSAGE =
  "Campus Scout is open without an account. Sign-in is optional.";

export const SEEDED_ALLOWED_EMAILS = [] as const;

const PROTECTED_PREFIXES: string[] = [];

export function authSecret(): string | null {
  const value = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  return value || null;
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizedEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  if (value.slice(0, at).includes("@")) return null;
  return value;
}

function allowlist(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS;
  const source = raw === undefined ? SEEDED_ALLOWED_EMAILS.join(",") : raw;
  return new Set(
    source
      .split(/[,;\s]+/)
      .map((item) => normalizedEmail(item))
      .filter((item): item is string => !!item)
  );
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const value = normalizedEmail(email);
  if (!value) return false;
  return allowlist().has(value);
}

export function safeCallbackUrl(value: string | null | undefined, fallback = "/startup/pipeline"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\n") || value.includes("\r")) {
    return fallback;
  }
  const path = value.split("?")[0] ?? value;
  if (path.startsWith("/signin") || path.startsWith("/api/auth")) return fallback;
  return value;
}
