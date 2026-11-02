import { NetworksApp } from "@/components/networks-app";
import { buildFounderNetworksPage } from "@/lib/domain/founder-networks";

export const dynamic = "force-dynamic";

export default function NetworksPage() {
  const data = buildFounderNetworksPage();
  return <NetworksApp data={data} />;
}
