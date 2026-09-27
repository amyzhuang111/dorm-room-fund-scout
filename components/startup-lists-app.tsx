"use client";

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { companiesInView } from "@/lib/domain/live-view";
import { sectorsForUniversity } from "@/lib/domain/candidate-filter";
import type { FeedbackRecord, FeedbackTarget } from "@/lib/domain/feedback";
import { likeTargetsFrom } from "@/lib/domain/review-view";
import { QUEUE_LABELS, type Queue } from "@/lib/domain/queue";
import { primaryBlocker } from "@/lib/screening/gates";
import type { CandidateSummary, ProjectDetail, SectorCount, UniversitySummary } from "@/lib/domain/queries";
import { FilterSidebar } from "./filter-sidebar";
import { CandidateTable } from "./candidate-table";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { useFeedbackRecords } from "./feedback-provider";
import { projectShell, useProjectDetail } from "./use-project-detail";
import { formatCampusList } from "@/lib/domain/campuses";
import { CompanyNameLink } from "./company-website";

const QUEUE_ORDER: Queue[] = ["top_prospects", "exploration", "watch", "reference_outside_brief"];

const QUEUE_NOTE: Record<Queue, string> = {
  top_prospects: "Passes current screening gates, has enough evidence for comparison, and there's a specific reason to meet.",
  exploration: "Meaningful positive signal, but eligibility or evidence gaps are still unresolved.",
  watch: "An explicit milestone or revisit date is on record.",
  reference_outside_brief: "Existing DRF investments and out-of-scope opportunities, kept for reference only.",
};

function useCompanies(
  candidates: CandidateSummary[],
  initialRecords: FeedbackRecord[],
  initialLikes: FeedbackTarget[]
) {
  const { current } = useScoutNav()!;
  const query = useDeferredValue(current);
  const records = useFeedbackRecords(initialRecords);
  const likes = useMemo(() => likeTargetsFrom(records, candidates, [], initialLikes), [records, candidates, initialLikes]);
  const visible = useMemo(() => companiesInView(candidates, records, likes, query), [candidates, records, likes, query]);
  return { current, query, visible };
}

export function StartupShortlistApp(props: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  sectors: SectorCount[];
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
  initialDetail: ProjectDetail | null;
}) {
  return (
    <ScoutNav basePath="/startup/shortlist" initial={props.initial}>
      <ShortlistBody {...props} />
    </ScoutNav>
  );
}

function ShortlistBody({
  universities,
  candidates,
  sectors,
  records,
  likes,
  initialDetail,
}: {
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  sectors: SectorCount[];
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
  initialDetail: ProjectDetail | null;
}) {
  const { current, query, visible } = useCompanies(candidates, records, likes);
  const fetched = useProjectDetail(current.project, initialDetail);
  const visibleSectors = sectorsForUniversity(sectors, current.university);
  const byQueue = useMemo(() => {
    const grouped = Object.fromEntries(QUEUE_ORDER.map((queue) => [queue, [] as typeof visible])) as Record<Queue, typeof visible>;
    for (const company of visible) grouped[company.queue]?.push(company);
    return grouped;
  }, [visible]);
  const selected = visible.find((company) => company.id === query.project) ?? candidates.find((company) => company.id === query.project);
  const open = useMemo(() => {
    if (!selected || !query.project) return null;
    return projectShell(selected, fetched && fetched.id === query.project ? fetched : null);
  }, [selected, query.project, fetched]);
  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/startup/shortlist" current={current} mode="startup" sectors={visibleSectors} />
      <div className="flex-1 space-y-8 p-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Startup shortlist</h1>
          <p className="mt-1 text-sm text-muted">
            Only justified recommendations appear here — queues aren&apos;t padded to a fixed count. Ties and score bands are normal when the
            evidence doesn&apos;t support a finer ranking.
          </p>
        </div>
        {QUEUE_ORDER.map((queue) => {
          const list = byQueue[queue];
          const needsResearchCount = byQueue.exploration.length;
          return (
            <section key={queue}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {QUEUE_LABELS[queue]} <span className="font-normal text-muted">({list.length})</span>
                </h2>
              </div>
              <p className="mb-2 text-xs text-muted">{QUEUE_NOTE[queue]}</p>
              <div className="rounded-md border border-border-c">
                {list.length === 0 ? (
                  queue === "top_prospects" ? (
                    <div className="p-4 text-sm text-muted">
                      <p className="font-medium text-foreground">No companies ready for review yet.</p>
                      {needsResearchCount > 0 ? (
                        <p className="mt-1">
                          {needsResearchCount} candidate{needsResearchCount === 1 ? "" : "s"} in Needs research could get there with more evidence.{" "}
                          <Link href="/startup/discover?queue=exploration" className="text-link underline">
                            Investigate them
                          </Link>
                          .
                        </p>
                      ) : (
                        <p className="mt-1">
                          No candidates on record at all yet.{" "}
                          <Link href="/sources?from=startup" className="text-link underline">
                            Pick a source to scan
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="p-4 text-sm text-muted">Nothing here yet.</p>
                  )
                ) : (
                  <CandidateTable
                    candidates={list}
                    basePath="/startup/shortlist"
                    current={query}
                    detail={open}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const BLOCKER_ORDER = ["Confirm student status", "Confirm stage", "Confirm funding", "Confirm company", "Confirm portfolio status"];

export function VerificationApp(props: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  sectors: SectorCount[];
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
}) {
  return (
    <ScoutNav basePath="/startup/verification" initial={props.initial}>
      <VerificationBody {...props} />
    </ScoutNav>
  );
}

function VerificationBody({
  universities,
  candidates,
  sectors,
  records,
  likes,
}: {
  universities: UniversitySummary[];
  candidates: CandidateSummary[];
  sectors: SectorCount[];
  records: FeedbackRecord[];
  likes: FeedbackTarget[];
}) {
  const { current, visible } = useCompanies(candidates, records, likes);
  const visibleSectors = sectorsForUniversity(sectors, current.university);
  const grouped = new Map<string, typeof visible>();
  for (const company of visible) {
    const blocker = primaryBlocker(company.gateOutcomes);
    if (!blocker) continue;
    grouped.set(blocker, [...(grouped.get(blocker) ?? []), company]);
  }
  const clear = visible.filter((company) => !primaryBlocker(company.gateOutcomes));
  const ordered = [...BLOCKER_ORDER.filter((blocker) => grouped.has(blocker)), ...[...grouped.keys()].filter((blocker) => !BLOCKER_ORDER.includes(blocker))];
  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/startup/verification" current={current} mode="startup" sectors={visibleSectors} />
      <div className="flex-1 p-4">
        <h1 className="text-lg font-semibold text-foreground">Verification</h1>
        <p className="mt-1 text-sm text-muted">
          Companies grouped by the single most important thing blocking them from clearing eligibility — resolve the blocker to move a
          company forward, rather than treating every gap as generic &quot;needs research&quot;.
        </p>
        <div className="mt-5 space-y-6">
          {ordered.map((blocker) => {
            const list = grouped.get(blocker) ?? [];
            return (
              <section key={blocker}>
                <h2 className="text-sm font-semibold text-foreground">
                  {blocker} <span className="font-normal text-muted">({list.length})</span>
                </h2>
                <div className="mt-1.5 divide-y divide-border-c rounded-md border border-border-c">
                  {list.map((company) => {
                    const blockerOutcome = company.gateOutcomes.find((gate) => gate.result !== "pass");
                    return (
                      <div key={company.id} className="px-3 py-2 text-sm hover:bg-surface-2">
                        <CompanyNameLink id={company.id} name={company.name} websiteUrl={company.websiteUrl} />
                        <p className="mt-0.5 text-xs text-muted">
                          {formatCampusList(company.universities) || "University unknown"}
                          {blockerOutcome ? ` · ${blockerOutcome.rationale}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <section>
            <h2 className="text-sm font-semibold text-foreground">
              No open blocker <span className="font-normal text-muted">({clear.length})</span>
            </h2>
            <div className="mt-1.5 divide-y divide-border-c rounded-md border border-border-c">
              {clear.map((company) => (
                <div key={company.id} className="px-3 py-2 text-sm hover:bg-surface-2">
                  <CompanyNameLink id={company.id} name={company.name} websiteUrl={company.websiteUrl} />
                  <p className="mt-0.5 text-xs text-muted">{formatCampusList(company.universities) || "University unknown"}</p>
                </div>
              ))}
              {clear.length === 0 && <p className="px-3 py-3 text-sm text-muted">None yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
