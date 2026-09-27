import { DrfPresenceTable } from "@/components/drf-presence-table";
import { FounderSignalsTable } from "@/components/founder-signals-table";
import { HotspotsApp } from "@/components/hotspots-app";
import { loadDrfPresence } from "@/lib/domain/drf-presence";
import { loadFounderSignals } from "@/lib/domain/founder-signals";
import { loadHotspotEvents } from "@/lib/domain/hotspot-dates";
import { hotspotCards } from "@/lib/domain/hotspots";
import { listUniversities } from "@/lib/domain/queries";

export default async function HotspotsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const initial = await searchParams;
  const universities = listUniversities().map((university) => ({ id: university.id, name: university.name }));
  return (
    <>
      <DrfPresenceTable rows={loadDrfPresence()} />
      <FounderSignalsTable rows={loadFounderSignals()} />
      <HotspotsApp cards={hotspotCards()} events={loadHotspotEvents()} initial={initial} universities={universities} />
    </>
  );
}
