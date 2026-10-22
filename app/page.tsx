import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GlobeBoot } from "@/components/map-boot";
import { GlobeHero } from "@/components/globe-hero";
import { loadHeroStats } from "@/lib/domain/hero-stats";

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
  const stats = loadHeroStats();
  return (
    <>
      <GlobeBoot />
      <Suspense fallback={null}>
        <GlobeHero stats={stats} />
      </Suspense>
    </>
  );
}
