import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyHome } from "@/components/empty-home";
import { GlobeBoot } from "@/components/map-boot";
import { SampleHome, type Feed } from "@/components/sample-home";
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
  if (sp.sample !== "1") return <EmptyHome />;
  const feed = feedOf(sp.feed);
  const stats = loadHeroStats();
  return (
    <>
      <GlobeBoot />
      <Suspense fallback={null}>
        <SampleHome feed={feed} sector={sp.sector} kind={sp.kind} campus={sp.campus} stats={stats} />
      </Suspense>
    </>
  );
}
