import { bestEnrollmentBoost, enrollmentBoost } from "./founder-status";
import { boostFor, isHidden, matchesFeedback, type FeedbackRecord, type FeedbackTarget } from "./feedback";
import type { CandidateSummary, FounderRow } from "./queries";
import { domainKey } from "./feedback";

export type ReviewMode = "default" | "liked" | "hidden" | "passed";

export function reviewMode(value: string | undefined): ReviewMode {
  if (value === "liked" || value === "hidden" || value === "passed") return value;
  return "default";
}

function companyTarget(c: CandidateSummary): FeedbackTarget {
  return {
    entityType: "project",
    entityId: c.id,
    name: c.name,
    domain: domainKey(c.websiteUrl || c.primaryLink),
    sectors: c.sectorTags,
    universityIds: c.universityIds,
    sourceIds: c.sourceIds,
    personIds: c.founderIds,
  };
}

function founderTarget(f: FounderRow): FeedbackTarget {
  return {
    entityType: "person",
    entityId: f.id,
    name: f.name,
    domain: null,
    sectors: f.sectorTags,
    universityIds: f.universityId ? [f.universityId] : [],
    sourceIds: f.sourceIds,
    personIds: f.personIds,
  };
}

function keep(mode: ReviewMode, records: FeedbackRecord[], target: FeedbackTarget): boolean {
  const hidden = isHidden(records, target);
  const liked = records.some((r) => r.action === "like" && matchesFeedback(r, target));
  const passed = records.some((r) => r.action === "pass" && matchesFeedback(r, target));
  if (mode === "hidden") return hidden;
  if (mode === "liked") return liked;
  if (mode === "passed") return passed;
  return !hidden;
}

export function reviewCompanies(items: CandidateSummary[], records: FeedbackRecord[], likes: FeedbackTarget[], mode: ReviewMode) {
  return items
    .map((item) => {
      const target = companyTarget(item);
      const boost = boostFor(target, likes);
      return {
        ...item,
        boostNote: boost?.note ?? null,
        boostScore: boost?.score ?? 0,
        enrollmentBoost: item.enrollmentBoost || bestEnrollmentBoost(item.founderLinks.map((founder) => founder.enrollmentStatus)),
      };
    })
    .filter((item) => keep(mode, records, companyTarget(item)))
    .sort((a, b) => b.enrollmentBoost - a.enrollmentBoost || b.boostScore - a.boostScore || a.name.localeCompare(b.name));
}

export function reviewFounders(items: FounderRow[], records: FeedbackRecord[], likes: FeedbackTarget[], mode: ReviewMode) {
  return items
    .map((item) => {
      const target = founderTarget(item);
      const boost = boostFor(target, likes);
      return { ...item, boostNote: boost?.note ?? null, boostScore: boost?.score ?? 0, enrollmentBoost: enrollmentBoost(item.enrollmentStatus) };
    })
    .filter((item) => keep(mode, records, founderTarget(item)))
    .sort((a, b) => b.enrollmentBoost - a.enrollmentBoost || b.boostScore - a.boostScore || a.name.localeCompare(b.name));
}
