import { logMissingAuthEnv, missingRequiredAuthEnv } from "@/lib/auth/required-env";
import { authMethods } from "@/lib/auth/send-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const missing = missingRequiredAuthEnv();
  logMissingAuthEnv(missing);
  const methods = authMethods();
  return Response.json({
    ok: missing.length === 0,
    missing,
    signIn: methods.magicLink || methods.google ? "ready" : "unconfigured",
  });
}
