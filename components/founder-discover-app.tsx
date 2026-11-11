"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildHref } from "@/lib/domain/url";
import { foundersInView } from "@/lib/domain/candidate-filter";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import { selectedEnrollment } from "@/lib/domain/founder-status";
import { matchesPrecollegeFilter, precollegeRankBoost } from "@/lib/domain/precollege";
import { userFounderPassesEnrollment } from "@/lib/domain/user-pipeline";
import { isSignalTier, signalTierRank } from "@/lib/domain/signal-tier";
import type { FeedbackRecord, FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom, reviewFounders, reviewMode } from "@/lib/domain/review-view";
import type { FounderRow, UniversitySummary } from "@/lib/domain/queries";
import { FilterSidebar } from "./filter-sidebar";
import { FounderCard } from "./founder-card";
import { ScoutLink, ScoutNav, useScoutNav } from "./scout-nav";
import { useFeedbackRecords } from "./feedback-provider";
import { useMergedCatalog } from "./user-pipeline-provider";
import { EnrollmentChips } from "./enrollment-chips";
import { PageHeader } from "./page-header";

export function FounderDiscoverApp({
  initial,
  universities,
  founders,
  potentialFounders,
  enrollment,
  records,
  likes,
  totalFounders,
  totalResolved,
}: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  founders: FounderRow[];
  potentialFounders: FounderRow[];
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
        potentialFounders={potentialFounders}
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
  potentialFounders,
  enrollment,
  initialRecords,
  initialLikes,
  totalFounders,
  totalResolved,
}: {
  universities: UniversitySummary[];
  founders: FounderRow[];
  potentialFounders: FounderRow[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialLikes: FeedbackTarget[];
  totalFounders: number;
  totalResolved: number;
}) {
  const { current } = useScoutNav()!;
  const filters = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const catalog = useMergedCatalog(universities, [], founders);
  const showingPotential = filters.pool === "potential";
  const pool = showingPotential ? potentialFounders : catalog.founders;
  const liveLikes = useMemo(() => likeTargetsFrom(records, [], pool, initialLikes), [records, pool, initialLikes]);
  const visible = useMemo(() => {
    // A full-record link must show the selected founder even if directory filters
    // would otherwise exclude them (for example, an older graduation year).
    if (filters.founder) return pool.filter((founder) => founder.id === filters.founder);
    const matched = foundersInView(pool, { universityId: filters.university, search: filters.q, confirmed: filters.confirmed === "1" });
    const reviewed = reviewFounders(matched, records, liveLikes, reviewMode(filters.feedback)).filter((founder) =>
      userFounderPassesEnrollment(founder, selectedEnrollment(filters.enroll))
    );
    const tiered = isSignalTier(filters.tier) ? reviewed.filter((founder) => founder.signalTier === filters.tier) : reviewed;
    const precollege = tiered.filter((founder) => matchesPrecollegeFilter(founder.precollegeSignals, filters.precollege));
    if (showingPotential) {
      return [...precollege].sort(
        (a, b) =>
          precollegeRankBoost(b.precollegeSignals) - precollegeRankBoost(a.precollegeSignals) ||
          signalTierRank(a.signalTier) - signalTierRank(b.signalTier) ||
          a.name.localeCompare(b.name)
      );
    }
    if (filters.sort === "tier") {
      return [...precollege].sort((a, b) => signalTierRank(a.signalTier) - signalTierRank(b.signalTier) || a.name.localeCompare(b.name));
    }
    return precollege;
  }, [pool, filters, records, liveLikes, showingPotential]);
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

  const monitored = universities.filter((u) => u.sourcesConfigured > 0).length;
  if (filters.founder) {
    const founder = visible[0];
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <nav aria-label="Founder record navigation" className="mb-5 flex gap-5 text-sm">
          <Link href="/founders" className="text-link underline">← All founders</Link>
          <Link href="/networks" className="text-link underline">Network map ↗</Link>
        </nav>
        <h1 className="page-title mb-5">{founder?.name ?? "Founder not found"}</h1>
        {founder ? (
          <FounderCard founder={founder} feedbackView={filters.feedback} open basePath="/founder/discover" current={filters} />
        ) : (
          <p>This founder is no longer in the current index. Use All founders to find an updated record.</p>
        )}
      </div>
    );
  }
  return (
    <div data-scout-live="" className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
      <PageHeader
        eyebrow="Founder scout"
        title="Founder candidates promoted once they show real building evidence."
        subtitle={`${totalFounders} founder candidates · ${monitored} campuses monitored. Promoted from ${totalResolved} resolved people · most resolved people stay raw records until they show real building evidence.`}
        stats={[
          { n: totalFounders, label: "founders" },
          { n: visible.length, label: "shown" },
          { n: monitored, label: "monitored" },
        ]}
      />
      <div className="mt-8 flex min-h-[70vh] flex-col gap-6 sm:flex-row">
      <FilterSidebar universities={catalog.universities} basePath="/founder/discover" current={current} mode="founder" />
      <div className="min-w-0 flex-1">
        <div className="pb-4">
          <EnrollmentChips basePath="/founder/discover" current={current} counts={counts} />
          <div className="segmented mb-2 mt-3">
            <ScoutLink href={buildHref("/startup/discover", { university: current.university, q: current.q, view: "globe", enroll: current.enroll, tier: current.tier, sort: current.sort }, {})} className="text-muted">
              Companies
            </ScoutLink>
            <ScoutLink href={buildHref("/founder/discover", current, { pool: null, founder: null })} className={showingPotential ? "" : "is-active"}>
              Founders
            </ScoutLink>
            <ScoutLink
              href={buildHref("/founder/discover", current, { pool: "potential", founder: null, sort: "tier", enroll: "current_student,recent_grad,older_alumni" })}
              className={showingPotential ? "is-active" : ""}
            >
              Potential founders
            </ScoutLink>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
            Sort
            <ScoutLink href={buildHref("/founder/discover", current, { sort: null })} className={!current.sort || current.sort === "name" ? "text-link" : "hover:text-foreground"}>
              name
            </ScoutLink>
            <ScoutLink href={buildHref("/founder/discover", current, { sort: "tier" })} className={showingPotential || current.sort === "tier" ? "text-link" : "hover:text-foreground"}>
              signal tier
            </ScoutLink>
            <span className="text-muted">· {visible.length} shown</span>
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search founders…"
            className="mt-2 w-full max-w-sm rounded-full border border-border-c bg-surface px-4 py-1.5 text-sm placeholder:text-muted"
          />
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((founder) => (
            <FounderCard key={founder.id} founder={founder} feedbackView={filters.feedback} open={filters.founder === founder.id} basePath="/founder/discover" current={filters} />
          ))}
          {visible.length === 0 && (
            <p className="text-sm text-muted">No founders match. Student and New grad are on · turn on Alumni to widen the list.</p>
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
    </div>
  );
}
