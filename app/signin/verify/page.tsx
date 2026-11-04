import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyMagicLink } from "@/components/verify-magic-link";
import { logMissingAuthEnv, SIGNIN_UNCONFIGURED_MESSAGE } from "@/lib/auth/required-env";
import { authMethods } from "@/lib/auth/send-email";

export const metadata: Metadata = { title: "Check your email" };

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  const methods = authMethods();
  if (!methods.magicLink && !methods.google) {
    logMissingAuthEnv();
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-black">
        <p className="text-base font-medium">{SIGNIN_UNCONFIGURED_MESSAGE}</p>
      </div>
    );
  }
  return (
    <Suspense fallback={<p className="mx-auto max-w-md px-4 py-16 text-sm font-medium text-black">Signing in…</p>}>
      <VerifyMagicLink />
    </Suspense>
  );
}
