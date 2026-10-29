"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  BarRow,
  Board,
  emptyFacets,
  FacetRail,
  recentSignals,
  sectorMix,
  topFounders,
  type FacetState,
} from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

export function SampleCompanyShell({
  children,
  companies,
  campuses,
}: {
  children: ReactNode;
  companies: FacetCompany[];
  campuses: { id: string; name: string; country: string; founders: number }[];
}) {
  const router = useRouter();
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const filtered = useMemo(() => applyFacets(companies, facets), [companies, facets]);
  const mix = useMemo(() => sectorMix(filtered), [filtered]);
  const recent = useMemo(() => recentSignals(filtered), [filtered]);
  const founders = useMemo(() => topFounders(filtered), [filtered]);

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto grid w-full max-w-[1280px] gap-3 px-3 py-3 sm:px-5 lg:grid-cols-[240px_minmax(0,1fr)_236px]">
        <div className="hidden h-[min(70vh,720px)] lg:block">
          <FacetRail
            companies={companies}
            campuses={campuses}
            facets={facets}
            onChange={(next) => {
              setFacets(next);
              const params = new URLSearchParams({ sample: "1" });
              if (next.sector) params.set("sector", next.sector);
              if (next.kind) params.set("kind", next.kind);
              if (next.campus) params.set("campus", next.campus);
              if (next.query.trim()) params.set("q", next.query.trim());
              // Facet clicks on company page jump back to directory with the same filters.
              if (next.sector || next.kind || next.campus || next.query.trim()) {
                router.push(`/?${params.toString()}#browse`);
              }
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="mb-2 border-b border-[#f0d9c6] pb-2">
            <Link href="/?sample=1#browse" className="text-[12px] font-medium text-[#E05612] hover:underline">
              All startups
            </Link>
          </div>
          <div className="company-instrument rounded-xl border border-[#f0d9c6] bg-white/94 p-1">{children}</div>
        </div>
        <div className="hidden space-y-2 lg:block">
          <Board title="Recent signals" unit="date">
            <ol className="space-y-1.5">
              {recent.slice(0, 5).map((company, index) => (
                <li key={company.id}>
                  <Link href={`/startup/${company.id}`} className="block text-[11px] hover:text-[#FB651E]">
                    <span className="font-bold tabular-nums text-[#E05612]">{index + 1}</span> {company.name}
                  </Link>
                </li>
              ))}
            </ol>
          </Board>
          <Board title="Sector mix" unit="companies">
            <ol className="space-y-1.5">
              {mix.map((item, index) => (
                <li key={item.id}>
                  <BarRow rank={index + 1} label={item.label} value={item.count} max={mix[0]?.count || 1} href={`/?sample=1&sector=${encodeURIComponent(item.id)}#browse`} />
                </li>
              ))}
            </ol>
          </Board>
          <Board title="Top founders" unit="signals">
            <ol className="space-y-1.5">
              {founders.map((person, index) => (
                <li key={person.key}>
                  <Link href={`/startup/${person.companyId}`} className="block text-[11px] hover:text-[#FB651E]">
                    <span className="font-bold tabular-nums text-[#E05612]">{index + 1}</span> {person.name}
                  </Link>
                </li>
              ))}
            </ol>
          </Board>
        </div>
      </div>
    </div>
  );
}
