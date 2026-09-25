// Optional durable store. Campus Scout has no login, and the SQLite file on
// Vercel is copied into /tmp per lambda, so reviewer feedback cannot live
// there. With zero env vars the UI uses localStorage (see the provider).
//
// To sync one reviewer's likes and hides across browsers, create a free
// Upstash Redis database and set these on Vercel (and locally if you want):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   FEEDBACK_REVIEWER_TOKEN   a passphrase you type once in the feedback panel
// The API rejects any request whose token does not match, so a public deploy
// does not share Amy's review state with anonymous visitors.

const KEY = "scout-feedback";

export function feedbackStoreConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.FEEDBACK_REVIEWER_TOKEN);
}

export function reviewerTokenOk(header: string | null): boolean {
  const expected = process.env.FEEDBACK_REVIEWER_TOKEN;
  return !!expected && !!header && header === expected;
}

async function command(args: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function readRemoteFeedback(): Promise<string | null> {
  const result = await command(["GET", KEY]);
  return typeof result === "string" ? result : null;
}

export async function writeRemoteFeedback(json: string): Promise<void> {
  await command(["SET", KEY, json]);
}
