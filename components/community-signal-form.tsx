import { setCommunitySignal, clearCommunitySignal } from "@/lib/actions/community-signal";
import {
  COMMUNITY_SIGNAL_CATEGORY_LABEL,
  type CommunityConfidence,
  type CommunitySignal,
  type CommunitySignalCategory,
} from "@/lib/domain/community-signal";

const CONFIDENCE_OPTIONS: CommunityConfidence[] = ["high", "medium", "low", "insufficient"];
const CATEGORIES = Object.keys(COMMUNITY_SIGNAL_CATEGORY_LABEL) as CommunitySignalCategory[];

export function CommunitySignalForm({ sourceId, current }: { sourceId: string; current: CommunitySignal | null }) {
  return (
    <details className="rounded-md border border-border-c">
      <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted">
        {current ? "Update community signal" : "Record community signal"}
      </summary>
      <form action={setCommunitySignal} className="space-y-2.5 border-t border-border-c p-2.5">
        <input type="hidden" name="sourceId" value={sourceId} />
        <p className="text-[11px] text-muted">
          Enter what you actually read · real threads, real commenters. Never a guess to fill a gap; use &quot;Insufficient&quot; if that&apos;s
          honestly what the search turned up.
        </p>
        <div>
          <label className="block text-xs font-medium text-muted">Confidence</label>
          <select
            name="confidence"
            defaultValue={current?.confidence ?? "insufficient"}
            className="mt-0.5 rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
          >
            {CONFIDENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Categories (what the community describes this source as)</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1 text-[11px] text-foreground">
                <input type="checkbox" name="categories" value={c} defaultChecked={current?.categories.includes(c)} />
                {COMMUNITY_SIGNAL_CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="block text-[11px] text-muted">Total mentions</label>
            <input
              type="number"
              min={0}
              name="mentionCount"
              defaultValue={current?.mentionCount ?? ""}
              className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted">Independent mentions</label>
            <input
              type="number"
              min={0}
              name="independentMentions"
              defaultValue={current?.independentMentions ?? ""}
              className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted">Positive</label>
            <input
              type="number"
              min={0}
              name="positiveMentions"
              defaultValue={current?.positiveMentions ?? ""}
              className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted">Negative</label>
            <input
              type="number"
              min={0}
              name="negativeMentions"
              defaultValue={current?.negativeMentions ?? ""}
              className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-1.5 py-1 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">
            Rationale (required) · cite real threads/comments; note if a claim came from a club officer/member rather than an independent
            commenter
          </label>
          <textarea
            name="rationale"
            rows={3}
            required
            defaultValue={current?.rationale ?? ""}
            className="mt-0.5 w-full rounded-md border border-border-c bg-surface px-2 py-1 text-xs"
          />
        </div>
        <button type="submit" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
          Save
        </button>
      </form>
      {current && (
        <form action={clearCommunitySignal} className="border-t border-border-c p-2">
          <input type="hidden" name="sourceId" value={sourceId} />
          <button type="submit" className="text-xs text-muted underline">
            Clear community signal
          </button>
        </form>
      )}
    </details>
  );
}
