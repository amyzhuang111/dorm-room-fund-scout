import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GlobeFoldSkeleton } from "@/components/globe-fold-skeleton";
import { GlobeBoot } from "@/components/map-boot";
import { SampleHome, type Feed } from "@/components/sample-home";
import { loadDirectory } from "@/lib/domain/directory";
import { loadHeroStats } from "@/lib/domain/hero-stats";

function feedOf(value: string | undefined): Feed {
  if (value === "leaderboard" || value === "world") return value;
  return "directory";
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.view === "table") {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value && key !== "view") qs.set(key, value);
    }
    const query = qs.toString();
    redirect(query ? `/companies?${query}` : "/companies");
  }
  if (sp.view === "network") redirect("/map/network");
  // Browse feeds live under /companies; keep ?sample=1 as a harmless alias.
  if (sp.feed === "directory" || sp.feed === "leaderboard") {
    const qs = new URLSearchParams();
    if (sp.sample === "1") qs.set("sample", "1");
    for (const key of ["feed", "sector", "kind", "campus", "q", "sort", "more"] as const) {
      const value = sp[key];
      if (value) qs.set(key, value);
    }
    redirect(`/companies?${qs.toString()}`);
  }
  const feed = feedOf(sp.feed);
  const stats = loadHeroStats();
  const directory = loadDirectory();
  let foundersListed = 0;
  for (const card of directory.cards) foundersListed += card.founders.length;
  const plotted = stats.universities.filter((university) => university.lat != null && university.lon != null);
  const top = [...plotted].sort((a, b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name))[0];
  return (
    <>
      <GlobeBoot />
      <Suspense
        fallback={
          <div className="sample-paper">
            <GlobeFoldSkeleton
              companyCount={directory.cards.length}
              foundersListed={foundersListed}
              campusesOnMap={plotted.length}
              dataThrough={stats.updatedAt}
              topName={top?.name ?? ""}
              topFounders={top?.founderCount ?? 0}
              topSignals={top?.signalCount ?? 0}
            />
          </div>
        }
      >
        <SampleHome feed={feed} sector={sp.sector} kind={sp.kind} campus={sp.campus} more={sp.more} q={sp.q} sort={sp.sort} stats={stats} />
      </Suspense>
    </>
  );
}
