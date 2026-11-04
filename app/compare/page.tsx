import type { Metadata } from "next";
import { Suspense } from "react";
import { CompanyWorkspace } from "@/components/company-workspace";

export const metadata: Metadata = { title: "Compare companies" };
export default function ComparePage() {
  return <Suspense fallback={<p role="status" className="p-6">Loading comparison…</p>}><CompanyWorkspace mode="compare" /></Suspense>;
}
