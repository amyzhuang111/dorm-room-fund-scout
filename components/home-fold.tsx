"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { CorpusCountStrip } from "@/components/corpus-count-strip";
import { MapCredit } from "@/components/map-credit";
import { GlobeHero } from "@/components/globe-hero";
import type { CampusLead } from "@/lib/domain/campus-record";
import { campusRecordHref } from "@/lib/domain/campus-record";
import { shortCampusLabel } from "@/lib/domain/campuses";
import { LEAD_COMPANY_RANKING, type EligibilityExamples } from "@/lib/domain/counted-hrefs";
import type { HeroStats, WeekItem } from "@/lib/domain/hero-stats";
import type { HomeProgram, HomeSector } from "@/lib/domain/home-panels";
import { updatedAgo } from "@/lib/domain/relative-time";
import type { TileCompany } from "@/components/tile-globe";

function signalTitle(item: WeekItem): string {
  const title = (item.event || item.detail || "").replace(/\s+/g, " ").trim();
  return title;
}

export function HomeFold({
  stats,
  programs,
  leads,
  companies,
  companyCount,
  foundersListed,
  foundersIndexed,
  campusesOnMap,
  campusesWithFounders,
  sectors,
  examples = null,
  highlightCampusIds = null,
}: {
  stats: HeroStats;
  programs: HomeProgram[];
  leads: CampusLead[];
  companies: TileCompany[];
  companyCount: number;
  foundersListed: number;
  foundersIndexed: number;
  campusesOnMap: number;
  campusesWithFounders: number;
  sectors: HomeSector[];
  examples?: EligibilityExamples | null;
  highlightCampusIds?: Set<string> | null;
}) {
  useEffect(() => {
    const chrome = document.querySelector("[data-site-chrome]");
    const apply = () => {
      const height = chrome?.getBoundingClientRect().height ?? 96;
      document.documentElement.style.setProperty("--home-chrome", `${Math.ceil(height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    if (chrome) observer.observe(chrome);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const leadByCampus = useMemo(() => {
    const map = new Map<string, CampusLead>();
    for (const lead of leads) map.set(lead.campusId, lead);
    return map;
  }, [leads]);

  const campuses = useMemo(() => {
    return [...stats.universities]
      .filter((university) => university.lat != null && university.lon != null && university.founderCount > 0)
      .sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [stats.universities]);

  const signals = useMemo(() => {
    return stats.week.filter((item) => signalTitle(item).length > 0).slice(0, 4);
  }, [stats.week]);

  const hrefFor = (id: string, slug: string | null | undefined) => campusRecordHref(id, leadByCampus.get(id), slug);

  const campusList = (extraClass: string) => (
    <section className={`home-panel ${extraClass}`} data-home-campuses="" aria-label="Top campuses">
      <h2 className="home-panel-label">Top campuses</h2>
      <p className="home-panel-note">{LEAD_COMPANY_RANKING} The number beside the campus is promoted founders, a different count.</p>
      <ol className="home-panel-list">
        {campuses.map((campus, index) => {
          const lead = leadByCampus.get(campus.id);
          const href = hrefFor(campus.id, campus.slug);
          const label = shortCampusLabel(campus.id, campus.name);
          return (
              <li key={campus.id} className={index >= 5 ? "home-campus-extra" : undefined}>
              <Link href={href} className="home-panel-row" data-home-campus={campus.id}>
                <span className="home-rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="home-panel-copy">
                  <span className="home-panel-name">{label}</span>
                  {lead ? <span className="home-panel-meta">{lead.companyName}</span> : null}
                </span>
                <span className="home-panel-count">
                  {campus.founderCount.toLocaleString("en-US")}
                  <span className="home-panel-unit"> founders</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );

  return (
    <div data-home-fold="" data-fold-root="">
      <div data-home-fold-screen="">
        <div data-home-counts="">
          <CorpusCountStrip
            companies={companyCount}
            foundersListed={foundersListed}
            foundersIndexed={foundersIndexed}
            campusesOnMap={campusesOnMap}
            campusesWithFounders={campusesWithFounders}
            updatedAt={stats.updatedAt}
            examples={examples}
          />
          <p className="home-map-credit" data-map-credit="">
            <MapCredit />
          </p>
        </div>
        <div data-home-map-well="" data-fold-globe-col="">
          <GlobeHero
            stats={stats}
            showGlobe
            companies={companies}
            companyCount={companyCount}
            foundersListed={foundersListed}
            foundersIndexed={foundersIndexed}
            highlightCampusIds={highlightCampusIds}
            layout="fold"
            campusHref={(id) => {
              const campus = stats.universities.find((university) => university.id === id);
              return hrefFor(id, campus?.slug);
            }}
          />
        </div>
        {campusList("lg:hidden")}
      </div>
      <aside data-home-rail="" aria-label="Campus panels">
        {campusList("hidden lg:block")}
        {programs.length > 0 ? (
          <section className="home-panel" data-home-programs="" aria-label="Top programs">
            <h2 className="home-panel-label">Top programs</h2>
            <p className="home-panel-note">People linked to the program. A company name search is a different list.</p>
            <ol className="home-panel-list">
              {programs.map((program) => (
                <li key={program.id}>
                  <Link href={program.href} className="home-panel-row" data-home-program={program.id}>
                    <span className="home-panel-copy">
                      <span className="home-panel-name">{program.name}</span>
                    </span>
                    <span className="home-panel-count">
                      {program.people.toLocaleString("en-US")}
                      <span className="home-panel-unit"> people</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {sectors.length > 0 ? (
          <section className="home-panel" data-home-sectors="" aria-label="Sectors by people">
            <h2 className="home-panel-label">Sectors</h2>
            <p className="home-panel-note">People on eligible companies, by the company primary sector. A person in two sectors is listed in both.</p>
            <ol className="home-panel-list">
              {sectors.map((sector) => (
                <li key={sector.id}>
                  <Link href={sector.href} className="home-panel-row" data-home-sector={sector.id}>
                    <span className="home-panel-copy">
                      <span className="home-panel-name">{sector.label}</span>
                    </span>
                    <span className="home-panel-count">
                      {sector.people.toLocaleString("en-US")}
                      <span className="home-panel-unit"> people</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {signals.length > 0 ? (
          <section className="home-panel" data-home-signals="" aria-label="Recent signals">
            <h2 className="home-panel-label">Recent signals</h2>
            <ul className="home-panel-list">
              {signals.map((item) => {
                const title = signalTitle(item);
                const body = (
                  <>
                    <span className="home-panel-copy">
                      <span className="home-panel-name">{title}</span>
                      {item.campus ? <span className="home-panel-meta">{item.campus}</span> : null}
                    </span>
                    {item.at ? <span className="home-panel-count">{updatedAgo(item.at)}</span> : null}
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.url ? (
                      <a href={item.url} className="home-panel-row" target="_blank" rel="noreferrer">
                        {body}
                      </a>
                    ) : (
                      <Link href="/signals" className="home-panel-row">
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
