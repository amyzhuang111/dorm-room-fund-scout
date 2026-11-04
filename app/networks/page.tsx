import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { NetworksApp } from "@/components/networks-app";
import type { FounderNetworksPage } from "@/lib/domain/founder-networks-model";

export const metadata: Metadata = { title: "Founder networks" };

function readNetworksPage(): FounderNetworksPage | null {
  try {
    const file = path.join(process.cwd(), "public", "data", "founder-networks-page.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as FounderNetworksPage;
  } catch {
    return null;
  }
}

export default function NetworksPage() {
  return (
    <>
      <link rel="preload" as="fetch" href="/data/network-atlas.json" />
      <NetworksApp initial={readNetworksPage()} />
    </>
  );
}
