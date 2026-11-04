import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyWorkspace } from "@/components/company-workspace";
import { DirectoryBoot } from "@/components/map-boot";

export const metadata: Metadata = { title: "Shortlist" };

function ShortlistFallback() {
  return (
    <div className="company-workspace">
      <p className="workspace-kicker">Your research workspace</p>
      <h1>A shortlist worth following.</h1>
      <p role="status">Loading company records…</p>
    </div>
  );
}

export default function ShortlistPage() {
  return (
    <>
      <DirectoryBoot />
      <Suspense fallback={<ShortlistFallback />}>
        <CompanyWorkspace mode="saved" />
      </Suspense>
    </>
  );
}
