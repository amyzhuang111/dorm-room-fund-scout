"use server";

import { signIn, signOut } from "@/auth";
import { safeCallbackUrl } from "./access";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function signInWithGoogle(callbackUrl: string) {
  await signIn("google", { redirectTo: safeCallbackUrl(callbackUrl) });
}
