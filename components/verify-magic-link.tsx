"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DRF_SIGNIN_MESSAGE, safeCallbackUrl } from "@/lib/auth/access";

export function VerifyMagicLink() {
  const params = useSearchParams();
  const token = params.get("token");
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const [message, setMessage] = useState(token ? "Signing in…" : "This sign-in link is missing a token.");

  useEffect(() => {
    if (!token) return;
    let cancel = false;
    signIn("magic", { token, redirect: false, callbackUrl })
      .then((result) => {
        if (cancel) return;
        if (!result || result.error) {
          setMessage(result?.error === "AccessDenied" ? DRF_SIGNIN_MESSAGE : "This sign-in link is invalid or has expired.");
          return;
        }
        window.location.assign(result.url || callbackUrl);
      })
      .catch(() => {
        if (!cancel) setMessage("This sign-in link is invalid or has expired.");
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
