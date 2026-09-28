"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DRF_SIGNIN_MESSAGE, safeCallbackUrl } from "@/lib/auth/access";
import { SIGNIN_UNCONFIGURED_MESSAGE } from "@/lib/auth/required-env";

export function VerifyMagicLink() {
  const params = useSearchParams();
  const token = params.get("token");
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const [message, setMessage] = useState(token ? "Signing in…" : "This sign-in link is missing a token.");

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    fetch("/api/auth/health")
      .then((res) => res.json() as Promise<{ signIn?: string }>)
      .then(async (health) => {
        if (cancel) return;
        if (health.signIn !== "ready") {
          setMessage(SIGNIN_UNCONFIGURED_MESSAGE);
          return;
        }
        let result: Awaited<ReturnType<typeof signIn>> | undefined;
        try {
          result = await signIn("magic", { token, redirect: false, callbackUrl });
        } catch {
          if (!cancel) setMessage("This sign-in link is invalid or has expired.");
          return;
        }
        if (cancel) return;
        if (!result || result.error || !result.ok) {
          if (!result || result.error === "Configuration") {
            setMessage(SIGNIN_UNCONFIGURED_MESSAGE);
            return;
          }
          setMessage(result.error === "AccessDenied" ? DRF_SIGNIN_MESSAGE : "This sign-in link is invalid or has expired.");
          return;
        }
        // Stay on this page's host. Auth.js often returns an absolute URL on a
        // different host (localhost vs 127.0.0.1), which drops the session cookie.
        window.location.assign(callbackUrl);
      })
      .catch(() => {
        if (!cancel) setMessage(SIGNIN_UNCONFIGURED_MESSAGE);
      });
    return () => {
      cancel = true;
    };
  }, [token, callbackUrl]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 text-black">
      <p className="text-base font-medium">{message}</p>
    </div>
  );
}
