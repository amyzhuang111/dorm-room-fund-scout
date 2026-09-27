import { FounderSignalsTable } from "@/components/founder-signals-table";
import { HotspotsApp } from "@/components/hotspots-app";
import { loadFounderSignals } from "@/lib/domain/founder-signals";
import { hotspotCards } from "@/lib/domain/hotspots";

export default async function HotspotsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const initial = await searchParams;
  return (
    <>
      <FounderSignalsTable rows={loadFounderSignals()} />
      <HotspotsApp cards={hotspotCards()} initial={initial} />
    </>
  );
}
