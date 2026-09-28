import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { authSecret } from "@/lib/auth/access";
import { logMissingAuthEnv, missingRequiredAuthEnv, SIGNIN_UNCONFIGURED_MESSAGE } from "@/lib/auth/required-env";

export const runtime = "nodejs";

function unconfigured(request: NextRequest): Response {
  const missing = missingRequiredAuthEnv();
  logMissingAuthEnv(missing);
  const url = new URL(request.url);
  const tail = url.pathname.split("/").pop() ?? "";
  if (request.method === "GET" && (tail === "signin" || tail === "error")) {
    return Response.redirect(new URL("/signin", url.origin));
  }
  if (tail === "session") return Response.json(null);
  if (tail === "providers") return Response.json({});
  if (tail === "csrf") return Response.json({ csrfToken: "" });
  return Response.json({ error: SIGNIN_UNCONFIGURED_MESSAGE, missing }, { status: 503 });
}

export function GET(request: NextRequest) {
  if (!authSecret()) return unconfigured(request);
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (!authSecret()) return unconfigured(request);
  return handlers.POST(request);
}
