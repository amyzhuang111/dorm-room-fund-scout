import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth/actions";
import { SIGNIN_MESSAGE, safeCallbackUrl } from "@/lib/auth/access";
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
    <div className="mx-auto w-full max-w-md px-5 py-16 text-fg">
      <p className="micro">student founder intelligence</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-4 rounded-md border border-line bg-raised p-4 text-base font-medium leading-snug">{SIGNIN_MESSAGE}</p>
      <p className="mt-3 text-sm text-fg-2">
        Discover, News, Hotspots, Verification, Signals, Sources, the globe, the network map, and Ask stay open without an account.
      </p>
      {denied && <p className="mt-4 text-sm font-semibold text-fg">That email is not on the member list.</p>}
      {linkError && <p className="mt-4 text-sm font-semibold text-fg">That sign-in link is invalid or has expired. Request a new one.</p>}
      {unconfigured && (
        <p className="mt-4 rounded-md border border-line bg-raised p-4 text-sm font-medium text-fg">{SIGNIN_UNCONFIGURED_MESSAGE}</p>
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
