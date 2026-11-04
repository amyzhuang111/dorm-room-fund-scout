import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyWorkspace } from "@/components/company-workspace";

export const metadata: Metadata = { title: "Shortlist" };

export default function ShortlistPage() {
  return <Suspense fallback={<p role="status" className="p-6">Loading saved companies…</p>}><CompanyWorkspace mode="saved" /></Suspense>;
}
