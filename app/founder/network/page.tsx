import Link from "next/link";
import { getNetworkNodeDetail, getProjectDetail, listUniversities } from "@/lib/domain/queries";
import { publicLink } from "@/lib/domain/company-link";
import { readReviewState } from "@/lib/domain/review-server";
import { FilterSidebar } from "@/components/filter-sidebar";
import { NetworkView } from "@/components/network-view";
import { EnrollmentChips } from "@/components/enrollment-chips";
import { CompanyDetail } from "@/components/company-detail";
import { PersonLinkButton } from "@/components/person-link";
import { EnrollmentBadge } from "@/components/badges";

function NodeDetail({ node }: { node: NonNullable<ReturnType<typeof getNetworkNodeDetail>> }) {
  const link = publicLink(node.websiteUrl, node.primaryLink, node.primaryLinkKind);
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{node.kind === "company" ? "Company" : "Project"}</p>
        <h2 className="text-lg font-semibold text-foreground">{node.name}</h2>
        {node.description && <p className="mt-1 text-sm text-foreground">{node.description}</p>}
        {link && (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            {link.kind === "official" ? "Visit website" : `Open ${link.label}`}
          </a>
        )}
        <ul className="mt-2 space-y-1.5">
          {node.team.length === 0 && <li className="text-sm text-muted">No team members identified yet</li>}
          {node.team.map((t) => (
            <li key={t.personId} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-foreground">{t.name}</span>
              <span className="text-xs text-muted">{t.role.replaceAll("_", " ")}</span>
              <EnrollmentBadge status={t.enrollmentStatus} label={t.enrollmentLabel} />
              <PersonLinkButton link={t.link} name={t.name} />
              {t.school && <span className="text-xs text-muted">{t.school}</span>}
            </li>
          ))}
        </ul>
      </div>
      {node.linkedCompanyId && (
        <Link href={`/startup/discover?project=${node.linkedCompanyId}`} className="inline-block text-xs font-medium text-link hover:underline">
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
  const company = sp.project ? getProjectDetail(sp.project) : null;
  const node = sp.project && !company ? getNetworkNodeDetail(sp.project) : null;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath={basePath} current={sp} mode="founder" />
      <div className="flex-1 border-r border-border-c">
        <div className="border-b border-border-c px-3 py-3">
          <EnrollmentChips basePath={basePath} current={sp} />
        </div>
        <NetworkView universityId={sp.university} basePath={basePath} current={sp} universities={universities} feedback={review.records} />
      </div>
      <div className="w-full sm:w-96 sm:shrink-0">
        {company ? (
          <CompanyDetail project={company} />
        ) : node ? (
          <NodeDetail node={node} />
        ) : (
          <div className="p-4 text-sm text-muted">Select a company or project node to open it here. A person&apos;s LinkedIn, GitHub, or Devpost link is on the node list beside the graph.</div>
        )}
      </div>
    </div>
  );
}
