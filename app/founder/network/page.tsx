import type { Metadata } from "next";
import { NetworkBoot } from "@/components/map-boot";
import { NetworkAnalysis } from "@/components/network-analysis";
import { NetworkMapApp } from "@/components/network-map-app";
import { buildNetworkAnalysis } from "@/lib/domain/network-analysis";

export const metadata: Metadata = { title: "Founder network" };

export default function FounderNetworkPage() {
  const analysis = buildNetworkAnalysis();
  return (
    <>
      <h1 className="sr-only">Founder network map</h1>
      <NetworkBoot />
      <NetworkMapApp />
      <NetworkAnalysis data={analysis} />
    </>
  );
}
