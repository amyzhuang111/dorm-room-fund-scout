import { cookies } from "next/headers";
import { feedbackRedirects } from "./entity-redirects";
import { applyEntityRedirects, FEEDBACK_COOKIE, parseFeedbackCookie, type FeedbackRecord, type FeedbackTarget } from "./feedback";
import { loadLikeTargets } from "./queries";

export async function readReviewState(): Promise<{ records: FeedbackRecord[]; likes: FeedbackTarget[] }> {
  const jar = await cookies();
  const records = applyEntityRedirects(parseFeedbackCookie(jar.get(FEEDBACK_COOKIE)?.value), feedbackRedirects());
  return { records, likes: loadLikeTargets(records) };
}
