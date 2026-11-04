import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyWorkspace } from "@/components/company-workspace";
import { DirectoryBoot } from "@/components/map-boot";

export const metadata: Metadata = { title: "Compare companies" };

function CompareFallback() {
  return (
    <div className="company-workspace">
      <p className="workspace-kicker">Your research workspace</p>
      <h1>Compare the evidence.</h1>
      <p role="status">Loading company records…</p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <>
      <DirectoryBoot />
      <Suspense fallback={<CompareFallback />}>
        <CompanyWorkspace mode="compare" />
      </Suspense>
    </>
  );
}
