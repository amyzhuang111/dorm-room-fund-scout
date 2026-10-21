import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { authSecret, isAllowedEmail, isProtectedPath, safeCallbackUrl } from "@/lib/auth/access";

// Next.js 16 renamed middleware.ts to proxy.ts. The generic workspace leaves
// every route public. isProtectedPath is empty, so this returns next.

function deny(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to use this route." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "";
  url.searchParams.set("callbackUrl", safeCallbackUrl(`${path}${request.nextUrl.search}`));
  return NextResponse.redirect(url);
}

async function sessionEmail(request: NextRequest, secret: string): Promise<string | null> {
  const secure = request.nextUrl.protocol === "https:";
  const primary = await getToken({ req: request, secret, secureCookie: secure });
  const token = primary ?? (await getToken({ req: request, secret, secureCookie: !secure }));
  return typeof token?.email === "string" ? token.email : null;
}

export async function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) return NextResponse.next();
  const secret = authSecret();
  if (!secret) return deny(request);
  try {
    const email = await sessionEmail(request, secret);
    if (isAllowedEmail(email)) return NextResponse.next();
  } catch {
    // A broken session cookie stays locked.
  }
  return deny(request);
}

export const config = {
  matcher: [
    "/pipeline",
    "/pipeline/:path*",
    "/shortlist",
    "/shortlist/:path*",
    "/startup/pipeline",
    "/startup/pipeline/:path*",
    "/startup/shortlist",
    "/startup/shortlist/:path*",
    "/founder/shortlist",
    "/founder/shortlist/:path*",
    "/api/user-pipeline",
    "/api/user-pipeline/:path*",
  ],
};
