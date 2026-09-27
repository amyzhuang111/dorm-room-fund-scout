import { Suspense } from "react";
import { PipelineApp } from "@/components/pipeline-app";
import { listUniversities } from "@/lib/domain/queries";

export default function PipelinePage() {
  const campuses = listUniversities()
    .map((university) => ({ id: university.id, name: university.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Suspense fallback={<p className="p-6 text-sm text-neutral-700">Loading pipeline…</p>}>
      <PipelineApp campuses={campuses} />
    </Suspense>
  );
}
