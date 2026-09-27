import { Suspense } from "react";
import { VerifyMagicLink } from "@/components/verify-magic-link";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-md px-4 py-16 text-sm font-medium text-black">Signing in…</p>}>
      <VerifyMagicLink />
    </Suspense>
  );
}
