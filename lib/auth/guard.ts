import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DRF_SIGNIN_MESSAGE, authSecret, isAllowedEmail, safeCallbackUrl } from "./access";

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

export async function requireMemberPage(callbackPath: string): Promise<{ email: string }> {
  const member = await currentMember();
  if (!member) redirect(`/signin?callbackUrl=${encodeURIComponent(safeCallbackUrl(callbackPath))}`);
  return member;
}

export async function requireMemberAction(): Promise<{ email: string }> {
  const member = await currentMember();
  if (member) return member;
  let callback = "/startup/pipeline";
  try {
    const referer = (await headers()).get("referer");
    if (referer) {
      const url = new URL(referer);
      callback = safeCallbackUrl(url.pathname + url.search);
    }
  } catch {
    callback = "/startup/pipeline";
  }
  redirect(`/signin?callbackUrl=${encodeURIComponent(callback)}`);
}

export async function memberDeniedResponse(): Promise<Response | null> {
  const member = await currentMember();
  if (member) return null;
  return Response.json({ error: DRF_SIGNIN_MESSAGE }, { status: 401 });
}
