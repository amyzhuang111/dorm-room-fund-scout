import Link from "next/link";
import { listCandidateProjects, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewCompanies, reviewMode } from "@/lib/domain/review-view";
import { QUEUE_LABELS, type Queue } from "@/lib/domain/queue";
import { FilterSidebar } from "@/components/filter-sidebar";
import { CandidateTable } from "@/components/candidate-table";
import { companyMatchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";

const QUEUE_ORDER: Queue[] = ["top_prospects", "exploration", "watch", "reference_outside_brief"];

const QUEUE_NOTE: Record<Queue, string> = {
  top_prospects: "Passes current screening gates, has enough evidence for comparison, and there's a specific reason to meet.",
  exploration: "Meaningful positive signal, but eligibility or evidence gaps are still unresolved.",
  watch: "An explicit milestone or revisit date is on record.",
  reference_outside_brief: "Existing DRF investments and out-of-scope opportunities, kept for reference only.",
};

function EmptyQueue({ queue, needsResearchCount }: { queue: Queue; needsResearchCount: number }) {
  if (queue === "top_prospects") {
    return (
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
    );
  }
  return <p className="p-4 text-sm text-muted">Nothing here yet.</p>;
}

export default async function StartupShortlistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const focus = selectedEnrollment(sp.enroll);
  const candidates = reviewCompanies(
    listCandidateProjects({ universityId: sp.university, sector: sp.sector }),
    review.records,
    review.likes,
    reviewMode(sp.feedback)
  ).filter((company) => companyMatchesEnrollment(company.founderLinks, focus));

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/startup/shortlist" current={sp} mode="startup" />
      <div className="flex-1 space-y-8 p-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Startup shortlist</h1>
          <p className="mt-1 text-sm text-muted">
            Only justified recommendations appear here — queues aren&apos;t padded to a fixed count. Ties and score bands are normal when the
            evidence doesn&apos;t support a finer ranking.
          </p>
        </div>
        {QUEUE_ORDER.map((q) => {
          const list = candidates.filter((c) => c.queue === q);
          return (
            <section key={q}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {QUEUE_LABELS[q]} <span className="font-normal text-muted">({list.length})</span>
                </h2>
              </div>
              <p className="mb-2 text-xs text-muted">{QUEUE_NOTE[q]}</p>
              <div className="rounded-md border border-border-c">
                {list.length === 0 ? (
                  <EmptyQueue queue={q} needsResearchCount={candidates.filter((c) => c.queue === "exploration").length} />
                ) : (
                  <CandidateTable candidates={list} basePath="/startup/shortlist" current={sp} />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
