import { redirect } from "next/navigation";
import { GlobeBoot, NetworkBoot } from "@/components/map-boot";
import { HomeMap } from "@/components/home-map";
import { NewsStrip } from "@/components/news-strip";
import { NetworkAnalysis } from "@/components/network-analysis";
import { buildNetworkAnalysis } from "@/lib/domain/network-analysis";

// `/` is the campus globe. `?view=network` shows the founder network on the
// same URL. The table bookmark still belongs to Startup Discover. The globe
// shell does not wait on the database, and the network chunk loads only then.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.view === "table") {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (value) qs.set(key, value);
    }
    redirect(`/startup/discover?${qs.toString()}`);
  }
  const network = sp.view === "network";
  return (
    <>
      {network ? <NetworkBoot /> : <GlobeBoot />}
      {network ? null : <NewsStrip />}
      <HomeMap initial={sp} network={network} />
      {network ? <NetworkAnalysis data={buildNetworkAnalysis()} /> : null}
    </>
  );
}
