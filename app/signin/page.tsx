import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth/actions";
import { DRF_SIGNIN_MESSAGE, safeCallbackUrl } from "@/lib/auth/access";
import { currentMember } from "@/lib/auth/guard";
import { logMissingAuthEnv, SIGNIN_UNCONFIGURED_MESSAGE } from "@/lib/auth/required-env";
import { authMethods } from "@/lib/auth/send-email";
import { MagicLinkForm } from "@/components/magic-link-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const callbackUrl = safeCallbackUrl(sp.callbackUrl);
  const member = await currentMember();
  if (member) redirect(callbackUrl);
  const methods = authMethods();
  const linkError = sp.error === "CredentialsSignin";
  const denied = sp.error === "AccessDenied";
  const unconfigured = sp.error === "Configuration" || (!methods.magicLink && !methods.google);
  if (unconfigured) logMissingAuthEnv();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 text-black">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-4 rounded-md border border-black bg-white p-4 text-base font-medium leading-snug">{DRF_SIGNIN_MESSAGE}</p>
      <p className="mt-3 text-sm text-black">
        Discover, Alumni, News, Hotspots, Verification, Signals, Sources, the globe, the network map, and Ask AI stay open without an account.
      </p>
      {denied && <p className="mt-4 text-sm font-semibold text-black">That email is not on the member list.</p>}
      {linkError && <p className="mt-4 text-sm font-semibold text-black">That sign-in link is invalid or has expired. Request a new one.</p>}
      {unconfigured && (
        <p className="mt-4 rounded-md border border-black bg-white p-4 text-sm font-medium text-black">{SIGNIN_UNCONFIGURED_MESSAGE}</p>
      )}
      {methods.magicLink && (
        <MagicLinkForm callbackUrl={callbackUrl} />
      )}
      {methods.google && (
        <form
          className="mt-4"
          action={async () => {
            "use server";
            await signInWithGoogle(callbackUrl);
          }}
        >
          <button type="submit" className="w-full rounded-md border border-black bg-white px-3 py-2 text-sm font-semibold text-black">
            Sign in with Google
          </button>
        </form>
      )}
    </div>
  );
}
