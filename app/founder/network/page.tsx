import { NetworkBoot } from "@/components/map-boot";
import { NetworkAnalysis } from "@/components/network-analysis";
import { NetworkMapApp } from "@/components/network-map-app";
import { buildNetworkAnalysis } from "@/lib/domain/network-analysis";

export default function FounderNetworkPage() {
  const analysis = buildNetworkAnalysis();
  return (
    <>
      <NetworkBoot />
      <NetworkMapApp />
      <NetworkAnalysis data={analysis} />
    </>
  );
}
