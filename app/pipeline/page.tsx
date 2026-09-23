import { redirect } from "next/navigation";

// /pipeline is kept as a compatibility alias for /startup/pipeline.
export default async function PipelineRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(qs ? `/startup/pipeline?${qs}` : "/startup/pipeline");
}
