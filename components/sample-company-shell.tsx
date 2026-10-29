"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import {
  applyFacets,
  emptyFacets,
  FacetRail,
  IntelligenceBoards,
  sectorMix,
  COUNT,
  PANEL,
  type FacetState,
} from "./sample-instrument";
import { SampleTheme } from "./sample-theme";

function MobileInstrumentStrip({ companies }: { companies: FacetCompany[] }) {
  const mix = useMemo(() => sectorMix(companies).slice(0, 5), [companies]);
  const signaled = companies.filter((c) => c.signals > 0).length;
  const total = mix.reduce((sum, item) => sum + item.count, 0) || 1;
  const dots = ["#7C8CF0", "#E8823A", "#3FB68B", "#F2B35B", "#B48CF2"];
  return (
    <div className={`${PANEL} relative mb-2 overflow-hidden p-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[color:var(--ember,#E8823A)]`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout pulse</p>
        <p className="text-[10px] text-[color:var(--fg-3,#6B7390)]">
          <span className={COUNT}>{signaled.toLocaleString("en-US")}</span> signaled ·{" "}
          <span className={COUNT}>{companies.length.toLocaleString("en-US")}</span> in view
        </p>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-sunken,#080A11)]">
        {mix.map((item, index) => (
          <div
            key={item.id}
            className="h-full"
            style={{ width: `${Math.max(3, Math.round((item.count / total) * 100))}%`, background: dots[index % dots.length] }}
            title={`${item.label}: ${item.count}`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {mix.slice(0, 4).map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-1 text-[9px] text-[color:var(--fg-2,#A3AAC0)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dots[index % dots.length] }} aria-hidden />
            {item.label}
            <span className={COUNT}>{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

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

  function onFacetChange(next: FacetState) {
    setFacets(next);
    const params = new URLSearchParams({ sample: "1" });
    if (next.sector) params.set("sector", next.sector);
    if (next.kind) params.set("kind", next.kind);
    if (next.campus) params.set("campus", next.campus);
    if (next.query.trim()) params.set("q", next.query.trim());
    if (next.hqRegion) params.set("hq", next.hqRegion);
    if (
      next.sector ||
      next.kind ||
      next.campus ||
      next.query.trim() ||
      next.foundedYear ||
      next.status ||
      next.flag ||
      next.hqRegion
    ) {
      router.push(`/?${params.toString()}#browse`);
    }
  }

  return (
    <div className="sample-paper min-h-[calc(100dvh-48px)]">
      <SampleTheme />
      <div className="mx-auto w-full max-w-[1280px] px-3 py-3 sm:px-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line,#1F2536)] pb-2">
          <Link href="/?sample=1#browse" className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--ember,#E8823A)] hover:underline">
            ← Company ledger
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout dossier</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside className="hidden min-w-0 lg:block">
            <div className={`${PANEL} sticky top-14 h-[min(70vh,640px)] overflow-hidden p-2`}>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Scout filters</p>
              <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} />
            </div>
          </aside>
          <div className="min-w-0">
            <MobileInstrumentStrip companies={filtered} />
            <div className="company-instrument relative overflow-hidden rounded-md border border-[color:var(--line,#1F2536)] border-l-2 border-l-[color:var(--ember,#E8823A)] bg-[color:var(--bg-raised,#121726)] p-2 sm:p-3 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[color:var(--cobalt,#2F4FD8)]">{children}</div>
            <details className={`${PANEL} mt-3 px-2.5 py-2 lg:hidden`}>
              <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--fg,#ECEEF4)]">Scout filters</summary>
              <div className="mt-2 h-[min(45vh,360px)]">
                <FacetRail companies={companies} campuses={campuses} facets={facets} onChange={onFacetChange} />
              </div>
            </details>
          </div>
          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-14">
              <IntelligenceBoards companies={filtered} compact />
            </div>
          </aside>
          <div className="lg:hidden">
            <IntelligenceBoards companies={filtered} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
