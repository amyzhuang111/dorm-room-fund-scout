import type { Metadata } from "next";
import { NetworksApp } from "@/components/networks-app";

export const metadata: Metadata = { title: "Founder networks" };

export const dynamic = "force-dynamic";

export default function NetworksPage() {
  return <NetworksApp />;
}
