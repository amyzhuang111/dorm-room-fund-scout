"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { publicLink } from "@/lib/domain/company-link";
import { domainKey, isHidden, type FeedbackRecord } from "@/lib/domain/feedback";
import type { EnrollmentStatus } from "@/lib/domain/founder-status";
import type { NetworkGraph } from "@/lib/domain/network";
import type { NetworkNodeDetail, ProjectDetail, UniversitySummary } from "@/lib/domain/queries";
import { EnrollmentBadge, LeftSchoolBadge } from "./badges";
import { CompanyDetail } from "./company-detail";
import { EnrollmentChips } from "./enrollment-chips";
import { useFeedbackRecords } from "./feedback-provider";
import { FilterSidebar } from "./filter-sidebar";
import { PersonLinkButton } from "./person-link";
import { CompanyNameLink } from "./company-website";
import { ScoutNav, useScoutNav } from "./scout-nav";
import { useProjectDetail } from "./use-project-detail";

const NetworkCanvas = dynamic(() => import("./network-canvas").then((mod) => mod.NetworkCanvas), { ssr: false });

function NodeDetail({ node }: { node: NetworkNodeDetail }) {
  const link = publicLink(node.websiteUrl, node.primaryLink, node.primaryLinkKind);
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{node.kind === "company" ? "Company" : "Project"}</p>
        <h2 className="text-lg font-semibold text-foreground">
          {node.kind === "company" ? (
            <CompanyNameLink id={node.linkedCompanyId || node.id} name={node.name} websiteUrl={node.websiteUrl} className="text-foreground hover:text-link" />
          ) : (
            node.name
          )}
        </h2>
        {node.description && <p className="mt-1 text-sm text-foreground">{node.description}</p>}
        {link && (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            {link.kind === "official" ? "Visit website" : `Open ${link.label}`}
          </a>
        )}
        <ul className="mt-2 space-y-1.5">
          {node.team.length === 0 && <li className="text-sm text-muted">No team members identified yet</li>}
          {node.team.map((member) => (
            <li key={member.personId} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-foreground">{member.name}</span>
              <span className="text-xs text-muted">{member.role.replaceAll("_", " ")}</span>
              <EnrollmentBadge status={member.enrollmentStatus} label={member.enrollmentLabel} />
              <LeftSchoolBadge leftSchool={member.leftSchool} />
              <PersonLinkButton link={member.link} name={member.name} />
              {member.school && <span className="text-xs text-muted">{member.school}</span>}
            </li>
          ))}
        </ul>
      </div>
      {node.linkedCompanyId && (
        <Link href={`/startup/${node.linkedCompanyId}`} className="inline-block text-xs font-medium text-link hover:underline">
          Open company details
        </Link>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence ({node.claims.length})</p>
        <ul className="mt-1.5 space-y-2">
          {node.claims.map((claim, index) => (
            <li key={index} className="rounded-md border border-border-c p-2 text-xs">
              <p className="text-foreground">{claim.excerpt}</p>
              <p className="mt-1 text-muted">
                retrieved {claim.retrievedAt.slice(0, 10)} ·{" "}
                <a href={claim.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
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

export function FounderNetworkApp({
  initial,
  universities,
  enrollment,
  records,
  initialGraph,
  initialCompany,
  initialNode,
}: {
  initial: Record<string, string | undefined>;
  universities: UniversitySummary[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  records: FeedbackRecord[];
  initialGraph: NetworkGraph;
  initialCompany: ProjectDetail | null;
  initialNode: NetworkNodeDetail | null;
}) {
  return (
    <ScoutNav basePath="/founder/network" initial={initial}>
      <NetworkBody
        universities={universities}
        enrollment={enrollment}
        initialRecords={records}
        initialGraph={initialGraph}
        initialCompany={initialCompany}
        initialNode={initialNode}
      />
    </ScoutNav>
  );
}

function NetworkBody({
  universities,
  enrollment,
  initialRecords,
  initialGraph,
  initialCompany,
  initialNode,
}: {
  universities: UniversitySummary[];
  enrollment: { all: Record<EnrollmentStatus, number>; byUniversity: Record<string, Record<EnrollmentStatus, number>> };
  initialRecords: FeedbackRecord[];
  initialGraph: NetworkGraph;
  initialCompany: ProjectDetail | null;
  initialNode: NetworkNodeDetail | null;
}) {
  const { current } = useScoutNav()!;
  const records = useFeedbackRecords(initialRecords);
  const counts = (current.university && enrollment.byUniversity[current.university]) || enrollment.all;
  const company = useProjectDetail(current.project, initialCompany);
  const [node, setNode] = useState<NetworkNodeDetail | null>(initialNode);
  const [nodeFor, setNodeFor] = useState(current.project);
  if (current.project !== nodeFor) {
    setNodeFor(current.project);
    setNode(null);
  }
  const key = `${current.university ?? ""}|${current.enroll ?? ""}`;
  const [graph, setGraph] = useState(initialGraph);
  const [loadedKey, setLoadedKey] = useState(key);

  useEffect(() => {
    if (!current.project) return;
    let cancel = false;
    fetch(`/api/node/${encodeURIComponent(current.project)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { node: NetworkNodeDetail | null } | null) => {
        if (!cancel) setNode(data?.node ?? null);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [current.project]);

  useEffect(() => {
    if (loadedKey === key) return;
    const params = new URLSearchParams();
    if (current.university) params.set("university", current.university);
    if (current.enroll) params.set("enroll", current.enroll);
    let cancel = false;
    fetch(`/api/network?${params.toString()}`)
      .then((res) => res.json())
      .then((data: NetworkGraph) => {
        if (cancel) return;
        setGraph(data);
        setLoadedKey(key);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [key, loadedKey, current.university, current.enroll]);

  const visible = useMemo(() => {
    const hiddenMode = current.feedback === "hidden";
    const nodes = graph.nodes.filter((item) => {
      if (item.type === "university") return true;
      const entityType = item.type === "person" ? "person" : "project";
      const hidden = isHidden(records, { entityType, entityId: item.id, name: item.label, domain: domainKey(item.linkUrl) });
      return hiddenMode ? hidden : !hidden;
    });
    const keep = new Set(nodes.map((item) => item.id));
    return { ...graph, nodes, edges: graph.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)) };
  }, [graph, records, current.feedback]);

  const campusName = current.university ? (universities.find((u) => u.id === current.university)?.name ?? "campus") : "All campuses";
  const shell = company;

  return (
    <div data-scout-live="" className="flex min-h-[calc(100vh-3.5rem-2.25rem)] flex-col sm:flex-row">
      <FilterSidebar universities={universities} basePath="/founder/network" current={current} mode="founder" />
      <div className="flex-1 border-r border-border-c">
        <div className="border-b border-border-c px-3 py-3">
          <EnrollmentChips basePath="/founder/network" current={current} counts={counts} />
        </div>
        {visible.nodes.length === 0 ? (
          <p className="p-6 text-sm text-muted">No evidence-backed connections on record for this campus yet.</p>
        ) : (
          <NetworkCanvas graph={visible} basePath="/founder/network" current={current} campusName={campusName} />
        )}
      </div>
      <div className="w-full sm:w-96 sm:shrink-0">
        {shell && shell.id === current.project ? (
          <CompanyDetail project={shell} />
        ) : node && current.project ? (
          <NodeDetail node={node} />
        ) : (
          <div className="p-4 text-sm text-muted">Select a company or project node to open it here. A person&apos;s LinkedIn, GitHub, or Devpost link is on the node list beside the graph.</div>
        )}
      </div>
    </div>
  );
}
