"use client";

import Link from "next/link";
import { domainKey, matchesFeedback, nameKey } from "@/lib/domain/feedback";
import { useFeedback } from "./feedback-provider";

/** Use the existing review store so saves survive navigation and sync settings. */
export function CompanyReviewActions({ id, name, url, showCompare = true }: { id: string; name: string; url?: string | null; showCompare?: boolean }) {
  const { records, setAction, undo } = useFeedback();
  const target = { entityType: "project" as const, entityId: id, name, domain: domainKey(url) };
  const saved = records.some((record) => matchesFeedback(record, target) && record.action === "like");
  return (
    <div className="review-actions" data-company-review-actions="">
      <button type="button" aria-pressed={saved} aria-label={`${saved ? "Unsave" : "Save"} ${name}`} onClick={() => {
        if (saved) undo(target);
        else setAction({ entityType: "project", entityId: id, nameKey: nameKey(name), domainKey: domainKey(url), action: "like" });
      }}>{saved ? "✓ Saved" : "+ Save"}</button>
      {showCompare ? <Link href={`/compare?ids=${encodeURIComponent(id)}`} aria-label={`Compare ${name}`}>Compare</Link> : null}
    </div>
  );
}
