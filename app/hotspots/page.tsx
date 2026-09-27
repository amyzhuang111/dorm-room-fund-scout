import { Suspense } from "react";
import { HotspotsApp } from "@/components/hotspots-app";
import { loadFounderSignals } from "@/lib/domain/founder-signals";
import { loadHotspotEvents } from "@/lib/domain/hotspot-dates";
import { hotspotCards } from "@/lib/domain/hotspots";

export default async function HotspotsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const initial = await searchParams;
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1100px] px-4 py-5 text-sm text-foreground">Loading hotspots…</div>}>
      <HotspotsApp cards={hotspotCards()} events={loadHotspotEvents()} signals={loadFounderSignals()} initial={initial} />
    </Suspense>
  );
}
