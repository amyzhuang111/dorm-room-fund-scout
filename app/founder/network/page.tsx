import Link from "next/link";
import { getNetworkNodeDetail, listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { FilterSidebar } from "@/components/filter-sidebar";
import { NetworkView } from "@/components/network-view";

function NodeDetail({ node }: { node: NonNullable<ReturnType<typeof getNetworkNodeDetail>> }) {
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{node.kind === "company" ? "Company" : "Project"}</p>
        <h2 className="text-lg font-semibold text-foreground">{node.name}</h2>
        <p className="mt-1 text-sm text-foreground">
          {node.team.length > 0 ? node.team.map((t) => `${t.name} (${t.role.replace(/_/g, " ")})`).join(", ") : "No team members identified yet"}
        </p>
      </div>
      {node.linkedCompanyId && (
        <Link href={`/startup/discover?project=${node.linkedCompanyId}`} className="inline-block text-xs font-medium text-accent hover:underline">
          Open in Startup Scout →
        </Link>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence ({node.claims.length})</p>
        <ul className="mt-1.5 space-y-2">
          {node.claims.map((c, i) => (
            <li key={i} className="rounded-md border border-border-c p-2 text-xs">
              <p className="text-foreground">{c.excerpt}</p>
              <p className="mt-1 text-muted">
                retrieved {c.retrievedAt.slice(0, 10)} ·{" "}
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  source
                </a>
              </p>
            </li>
          ))}
          {node.claims.length === 0 && <li className="text-sm text-muted">No claims on record yet.</li>}
        </ul>
      </div>
    </div>
  );
}

export default async function FounderNetworkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const basePath = "/founder/network";
  const universities = listUniversities();
  const review = await readReviewState();
  const node = sp.project ? getNetworkNodeDetail(sp.project) : null;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath={basePath} current={sp} mode="founder" />
      <div className="flex-1 border-r border-border-c">
        <NetworkView universityId={sp.university} basePath={basePath} current={sp} universities={universities} feedback={review.records} />
      </div>
      <div className="w-full sm:w-96 sm:shrink-0">
        {node ? <NodeDetail node={node} /> : <div className="p-4 text-sm text-muted">Select a founder or project node to see its evidence here.</div>}
      </div>
    </div>
  );
}
