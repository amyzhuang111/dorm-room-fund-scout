import { NetworkAnalysis } from "@/components/network-analysis";
import { NetworkMapApp } from "@/components/network-map-app";
import { buildNetworkAnalysis } from "@/lib/domain/network-analysis";

export default function FounderNetworkPage() {
  const analysis = buildNetworkAnalysis();
  return (
    <>
      <NetworkMapApp />
      <NetworkAnalysis data={analysis} />
    </>
  );
}
