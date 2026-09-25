"use client";

import { useFeedback } from "./feedback-provider";

export function FeedbackSync() {
  const { token, setToken, remote } = useFeedback();
  return (
    <label className="mt-4 block text-[11px] text-muted">
      Sync token
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Optional, matches Vercel env"
        className="mt-1 w-full rounded-md border border-border-c bg-surface px-2 py-1 text-[11px] text-foreground"
      />
      <span className="mt-1 block">
        {remote === "on" ? "Syncing to Upstash." : remote === "rejected" ? "Token does not match the server." : "Saved in this browser until a sync token is set."}
      </span>
    </label>
  );
}
