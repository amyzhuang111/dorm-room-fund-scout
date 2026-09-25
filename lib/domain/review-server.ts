import { cookies } from "next/headers";
import { FEEDBACK_COOKIE, parseFeedbackCookie, type FeedbackRecord, type FeedbackTarget } from "./feedback";
import { loadLikeTargets } from "./queries";

export async function readReviewState(): Promise<{ records: FeedbackRecord[]; likes: FeedbackTarget[] }> {
  const jar = await cookies();
  const records = parseFeedbackCookie(jar.get(FEEDBACK_COOKIE)?.value);
  return { records, likes: loadLikeTargets(records) };
}
