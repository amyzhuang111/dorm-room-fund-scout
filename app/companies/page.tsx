import type { Metadata } from "next";
import Discover from "../startup/discover/page";
import { SampleHome } from "@/components/sample-home";
import { CompanySetToggle, UnverifiedCompaniesView, unverifiedTotal } from "@/components/unverified-companies";
import { loadDirectory } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";
import { facetsFromSearchParams } from "@/lib/domain/facet-url";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (sp.discover === "1") {
    return <Discover searchParams={Promise.resolve(sp)} />;
  }
  const vettedCount = loadDirectory().cards.length;
  if (sp.unverified === "1") {
    return (
      <>
        <CompanySetToggle vetted={vettedCount} unverified={unverifiedTotal()} active="unverified" />
        <UnverifiedCompaniesView sp={sp} />
      </>
    );
  }
  const facets = facetsFromSearchParams(sp);
  return (
    <>
    <CompanySetToggle vetted={vettedCount} unverified={unverifiedTotal()} active="vetted" />
    <h1 className="sr-only">Companies</h1>
    <SampleHome
      place="explore"
      feed={sp.feed === "leaderboard" ? "leaderboard" : "directory"}
      sector={facets.sector ?? sp.sector}
      kind={facets.kind ?? sp.kind}
      campus={facets.campus ?? sp.campus}
      more={sp.more}
      q={facets.query || sp.q}
      sort={sp.sort}
      stats={loadHeroStats()}
      facetExtras={{
        stage: facets.stage,
        network: facets.network,
        missing: facets.missing,
        status: facets.status,
        flag: facets.flag,
        foundedYear: facets.foundedYear,
        yearMissing: facets.yearMissing,
        hqRegion: facets.hqRegion,
        country: facets.country,
        recency: facets.recency,
        sectorMissing: facets.sectorMissing,
        c: sp.c,
      }}
    />
    </>
  );
}
