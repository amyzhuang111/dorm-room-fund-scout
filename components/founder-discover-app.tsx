"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildHref } from "@/lib/domain/url";
import { foundersInView } from "@/lib/domain/candidate-filter";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { matchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";
import type { FeedbackRecord, FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom, reviewFounders, reviewMode } from "@/lib/domain/review-view";
import type { FounderRow, UniversitySummary } from "@/lib/domain/queries";
import { FilterSidebar } from "./filter-sidebar";
import { FounderCard } from "./founder-card";
import { ScoutLink, ScoutNav, useScoutNav } from "./scout-nav";
import { useFeedbackRecords } from "./feedback-provider";
import { EnrollmentChips } from "./enrollment-chips";

export function FounderDiscoverApp({
  initial,
  universities,
  founders,
  enrollment,
  records,
  likes,
  totalFounders,
  totalResolved,
}: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  founders: FounderRow[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
  totalFounders: number;
  totalResolved: number;
}) {
  return (
    <ScoutNav basePath="/founder/discover" initial={initial}>
      <FounderBody
        universities={universities}
        founders={founders}
        enrollment={enrollment}
        initialRecords={records}
        initialLikes={likes}
        totalFounders={totalFounders}
        totalResolved={totalResolved}
      />
    </ScoutNav>
  );
}

function FounderBody({
  universities,
  founders,
  enrollment,
  initialRecords,
  initialLikes,
  totalFounders,
  totalResolved,
}: {
  universities: UniversitySummary[];
  founders: FounderRow[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialLikes: FeedbackTarget[];
  totalFounders: number;
  totalResolved: number;
}) {
  const { current } = useScoutNav()!;
  const filters = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const liveLikes = useMemo(() => likeTargetsFrom(records, [], founders, initialLikes), [records, founders, initialLikes]);
  const visible = useMemo(() => {
    const matched = foundersInView(founders, { universityId: filters.university, search: filters.q });
    return reviewFounders(matched, records, liveLikes, reviewMode(filters.feedback)).filter((founder) =>
      matchesEnrollment(founder.enrollmentStatus, selectedEnrollment(filters.enroll))
    );
  }, [founders, filters, records, liveLikes]);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const [query, setQuery] = useState(current.q ?? "");
  const [syncedQ, setSyncedQ] = useState(current.q);
  if (current.q !== syncedQ) {
    setSyncedQ(current.q);
    setQuery(current.q ?? "");
  }
  const nav = useScoutNav()!;

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      if ((current.q ?? "") === next) return;
      nav.navigate({ q: next || null });
    }, 100);
    return () => window.clearTimeout(handle);
  }, [query, current.q, nav]);

  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/founder/discover" current={current} mode="founder" />
      <div className="flex-1">
        <div className="border-b border-border-c px-4 py-3">
          <EnrollmentChips basePath="/founder/discover" current={current} counts={counts} />
          <div className="mb-2 mt-3 flex items-center gap-1">
            <ScoutLink href={buildHref("/startup/discover", { university: current.university, q: current.q, view: "globe", enroll: current.enroll }, {})} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2">
              Companies
            </ScoutLink>
            <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">Founders</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Founder Scout</h1>
          <p className="text-sm text-muted">
            {totalFounders} founder candidates · {universities.filter((u) => u.sourcesConfigured > 0).length} campuses monitored
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Promoted from {totalResolved} resolved people — most resolved people stay raw records until they show real building
            evidence (see Methodology).
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search founders…"
            className="mt-2 w-full max-w-sm rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
          />
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((founder) => (
            <FounderCard key={founder.id} founder={founder} feedbackView={filters.feedback} open={filters.founder === founder.id} basePath="/founder/discover" current={filters} />
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-muted">No founders match. Student and New grad are on — turn on Alumni or Unknown to widen the list.</p>
          )}
        </div>
        {current.university && (
          <p className="px-4 pb-4 text-xs text-muted">
            <ScoutLink href={buildHref("/founder/discover", current, { university: null })} className="text-link underline">
              Clear campus filter
            </ScoutLink>
          </p>
        )}
      </div>
    </div>
  );
}
