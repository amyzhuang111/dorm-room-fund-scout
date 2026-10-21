"use client";

import { useState } from "react";

export function MagicLinkForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "The sign-in email could not be sent.");
        return;
      }
      setSent(true);
    } catch {
      setError("The sign-in email could not be sent.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-6 rounded-md border border-black bg-white p-4 text-sm font-medium text-black">
        Check {email} for a sign-in link. It expires in 15 minutes.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block text-sm font-semibold text-black" htmlFor="signin-email">
        Email
      </label>
      <input
        id="signin-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="w-full rounded-md border border-black bg-white px-3 py-2 text-sm text-black"
        placeholder="name@example.com"
      />
      {error && <p className="text-sm font-semibold text-black">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-md border border-black bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
