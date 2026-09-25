"use client";

import { useDeferredValue, useMemo } from "react";
import { foundersInView } from "@/lib/domain/candidate-filter";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { matchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";
import type { FeedbackRecord, FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom, reviewFounders, reviewMode } from "@/lib/domain/review-view";
import type { FounderRow, UniversitySummary } from "@/lib/domain/queries";
import { EnrollmentChips } from "./enrollment-chips";
import { FilterSidebar } from "./filter-sidebar";
import { FounderCard } from "./founder-card";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { useFeedbackRecords } from "./feedback-provider";

export function FounderShortlistApp({
  initial,
  universities,
  founders,
  enrollment,
  records,
  likes,
}: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  founders: FounderRow[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
}) {
  return (
    <ScoutNav basePath="/founder/shortlist" initial={initial}>
      <ShortlistBody universities={universities} founders={founders} enrollment={enrollment} initialRecords={records} initialLikes={likes} />
    </ScoutNav>
  );
}

function ShortlistBody({
  universities,
  founders,
  enrollment,
  initialRecords,
  initialLikes,
}: {
  universities: UniversitySummary[];
  founders: FounderRow[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialLikes: FeedbackTarget[];
}) {
  const { current } = useScoutNav()!;
  const query = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const liveLikes = useMemo(() => likeTargetsFrom(records, [], founders, initialLikes), [records, founders, initialLikes]);
  const visible = useMemo(() => {
    const matched = foundersInView(founders, { universityId: query.university, search: query.q });
    return reviewFounders(matched, records, liveLikes, reviewMode(query.feedback)).filter((founder) =>
      matchesEnrollment(founder.enrollmentStatus, selectedEnrollment(query.enroll))
    );
  }, [founders, query, records, liveLikes]);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const withEvidence = visible.filter((founder) => founder.strongestEvidence);
  const withoutEvidence = visible.filter((founder) => !founder.strongestEvidence);
  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/founder/shortlist" current={current} mode="founder" />
      <div className="flex-1 p-4">
        <EnrollmentChips basePath="/founder/shortlist" current={current} counts={counts} />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Founder shortlist</h1>
        <p className="mt-1 text-sm text-muted">
          Sorted by whether there&apos;s an attached claim, not a score — there&apos;s no per-founder scoring model yet. Read the evidence
          directly rather than trusting a rank.
        </p>
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-foreground">
            Has direct evidence <span className="font-normal text-muted">({withEvidence.length})</span>
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {withEvidence.map((founder) => (
              <FounderCard key={founder.id} founder={founder} open={query.founder === founder.id} basePath="/founder/shortlist" current={query} />
            ))}
            {withEvidence.length === 0 && <p className="text-sm text-muted">None yet.</p>}
          </div>
        </section>
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-foreground">
            Affiliation only, no claim yet <span className="font-normal text-muted">({withoutEvidence.length})</span>
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {withoutEvidence.map((founder) => (
              <FounderCard key={founder.id} founder={founder} open={query.founder === founder.id} basePath="/founder/shortlist" current={query} />
            ))}
            {withoutEvidence.length === 0 && <p className="text-sm text-muted">None.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
