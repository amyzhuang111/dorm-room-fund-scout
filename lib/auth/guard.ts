import { cookies } from "next/headers";
import { auth } from "@/auth";
import { authSecret, isAllowedEmail } from "./access";

export async function currentMember(): Promise<{ email: string } | null> {
  // Touch the cookie store so the nav and the protected pages render per
  // request. A build without AUTH_SECRET must not freeze "signed out" into
  // static HTML that stays locked after the secret is added.
  await cookies();
  if (!authSecret()) return null;
  try {
    const session = await auth();
    if (!session || typeof session !== "object" || !("user" in session)) return null;
    const email = session.user?.email;
    if (!email || !isAllowedEmail(email)) return null;
    return { email: email.trim().toLowerCase() };
  } catch {
    return null;
  }
}

export async function requireMemberPage(_callbackPath: string): Promise<{ email: string }> {
  return (await currentMember()) ?? { email: "" };
}

export async function requireMemberAction(): Promise<{ email: string }> {
  return (await currentMember()) ?? { email: "" };
}

export async function memberDeniedResponse(): Promise<Response | null> {
  return null;
}
