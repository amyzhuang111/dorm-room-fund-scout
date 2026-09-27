import { Suspense } from "react";
import { PipelineApp } from "@/components/pipeline-app";
import { requireMemberPage } from "@/lib/auth/guard";
import { listUniversities } from "@/lib/domain/queries";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["outreach", "referrer", "edit", "add"] as const) {
    const value = sp[key];
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  await requireMemberPage(suffix ? `/startup/pipeline?${suffix}` : "/startup/pipeline");
  const campuses = listUniversities()
    .map((university) => ({ id: university.id, name: university.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Suspense fallback={<p className="p-6 text-sm text-neutral-700">Loading pipeline…</p>}>
      <PipelineApp campuses={campuses} />
    </Suspense>
  );
}
