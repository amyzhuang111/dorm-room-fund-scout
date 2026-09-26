import { HotspotsApp } from "@/components/hotspots-app";
import { hotspotCards } from "@/lib/domain/hotspots";

export default async function HotspotsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const initial = await searchParams;
  return <HotspotsApp cards={hotspotCards()} initial={initial} />;
}
