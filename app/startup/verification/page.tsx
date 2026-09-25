import Link from "next/link";
import { listCandidateProjects, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewCompanies, reviewMode } from "@/lib/domain/review-view";
import { primaryBlocker } from "@/lib/screening/gates";
import { FilterSidebar } from "@/components/filter-sidebar";
import { companyMatchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";

const BLOCKER_ORDER = ["Confirm student status", "Confirm stage", "Confirm funding", "Confirm company", "Confirm portfolio status"];

export default async function VerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const focus = selectedEnrollment(sp.enroll);
  const candidates = reviewCompanies(
    listCandidateProjects({ universityId: sp.university, sector: sp.sector, search: sp.q }),
    review.records,
    review.likes,
    reviewMode(sp.feedback)
  ).filter((company) => companyMatchesEnrollment(company.founderLinks, focus));

  const grouped = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const blocker = primaryBlocker(c.gateOutcomes);
    if (!blocker) continue;
    grouped.set(blocker, [...(grouped.get(blocker) ?? []), c]);
  }
  const clear = candidates.filter((c) => !primaryBlocker(c.gateOutcomes));
  const orderedBlockers = [...BLOCKER_ORDER.filter((b) => grouped.has(b)), ...[...grouped.keys()].filter((b) => !BLOCKER_ORDER.includes(b))];

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/startup/verification" current={sp} mode="startup" />
      <div className="flex-1 p-4">
        <h1 className="text-lg font-semibold text-foreground">Verification</h1>
        <p className="mt-1 text-sm text-muted">
          Companies grouped by the single most important thing blocking them from clearing eligibility — resolve the blocker to move a
          company forward, rather than treating every gap as generic &quot;needs research&quot;.
        </p>

        <div className="mt-5 space-y-6">
          {orderedBlockers.map((blocker) => {
            const list = grouped.get(blocker)!;
            return (
              <section key={blocker}>
                <h2 className="text-sm font-semibold text-foreground">
                  {blocker} <span className="font-normal text-muted">({list.length})</span>
                </h2>
                <div className="mt-1.5 divide-y divide-border-c rounded-md border border-border-c">
                  {list.map((c) => {
                    const blockerOutcome = c.gateOutcomes.find((g) => g.result !== "pass");
                    return (
                      <Link key={c.id} href={`/startup/discover?project=${c.id}`} className="block px-3 py-2 text-sm hover:bg-surface-2">
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {c.universities.join(", ") || "University unknown"}
                          {blockerOutcome ? ` · ${blockerOutcome.rationale}` : ""}
                        </p>
                      </Link>
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
              {clear.map((c) => (
                <Link key={c.id} href={`/startup/discover?project=${c.id}`} className="block px-3 py-2 text-sm hover:bg-surface-2">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.universities.join(", ") || "University unknown"}</p>
                </Link>
              ))}
              {clear.length === 0 && <p className="px-3 py-3 text-sm text-muted">None yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
