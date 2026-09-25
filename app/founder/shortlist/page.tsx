import { listFounders, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewFounders, reviewMode } from "@/lib/domain/review-view";
import { FilterSidebar } from "@/components/filter-sidebar";
import { FounderCard } from "@/components/founder-card";
import { matchesEnrollment, selectedEnrollment } from "@/lib/domain/founder-status";
import { EnrollmentChips } from "@/components/enrollment-chips";

export default async function FounderShortlistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const focus = selectedEnrollment(sp.enroll);
  const founders = reviewFounders(listFounders({ universityId: sp.university, search: sp.q }), review.records, review.likes, reviewMode(sp.feedback)).filter((founder) =>
    matchesEnrollment(founder.enrollmentStatus, focus)
  );

  const withEvidence = founders.filter((f) => f.strongestEvidence);
  const withoutEvidence = founders.filter((f) => !f.strongestEvidence);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/founder/shortlist" current={sp} mode="founder" />
      <div className="flex-1 p-4">
        <EnrollmentChips basePath="/founder/shortlist" current={sp} />
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
            {withEvidence.map((f) => (
              <FounderCard key={f.id} founder={f} open={sp.founder === f.id} basePath="/founder/shortlist" current={sp} />
            ))}
            {withEvidence.length === 0 && <p className="text-sm text-muted">None yet.</p>}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-foreground">
            Affiliation only, no claim yet <span className="font-normal text-muted">({withoutEvidence.length})</span>
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {withoutEvidence.map((f) => (
              <FounderCard key={f.id} founder={f} open={sp.founder === f.id} basePath="/founder/shortlist" current={sp} />
            ))}
            {withoutEvidence.length === 0 && <p className="text-sm text-muted">None.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
