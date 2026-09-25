import Link from "next/link";
import { listFounders, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { reviewFounders, reviewMode } from "@/lib/domain/review-view";
import { FilterSidebar } from "@/components/filter-sidebar";
import { FounderCard } from "@/components/founder-card";
import { buildHref } from "@/lib/domain/url";

export default async function FounderDiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const basePath = "/founder/discover";
  const universities = listUniversities();
  const review = await readReviewState();
  const founders = reviewFounders(listFounders({ universityId: sp.university, search: sp.q }), review.records, review.likes, reviewMode(sp.feedback));
  const totalFounders = universities.reduce((sum, u) => sum + u.founderCount, 0);
  const totalResolved = universities.reduce((sum, u) => sum + u.resolvedPersonCount, 0);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath={basePath} current={sp} mode="founder" />
      <div className="flex-1">
        <div className="border-b border-border-c px-4 py-3">
          <div className="mb-2 flex items-center gap-1">
            <Link href={buildHref("/startup/discover", { university: sp.university, q: sp.q, view: "globe" }, {})} className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2">
              Companies
            </Link>
            <span className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">Founders</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Founder Scout</h1>
          <p className="text-sm text-muted">
            {totalFounders} founder candidates · {universities.filter((u) => u.sourcesConfigured > 0).length} campuses monitored
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Promoted from {totalResolved} resolved people — most resolved people stay raw records until they show real building
            evidence (see Methodology).
          </p>
          <form action={basePath} method="get" className="mt-2">
            {Object.entries(sp)
              .filter(([k, v]) => k !== "q" && v)
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search founders…"
              className="w-full max-w-sm rounded-md border border-border-c bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
            />
          </form>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {founders.map((f) => (
            <FounderCard key={f.id} founder={f} feedbackView={sp.feedback} />
          ))}
          {founders.length === 0 && <p className="text-sm text-muted">No founders match yet.</p>}
        </div>

        {sp.university && (
          <p className="px-4 pb-4 text-xs text-muted">
            <Link href={buildHref(basePath, sp, { university: null })} className="text-accent underline">
              Clear campus filter
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
