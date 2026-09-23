import { redirect } from "next/navigation";

// /universe is kept as a compatibility alias for /startup/discover — preserves
// any old bookmarked links/filters.
export default async function UniverseRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(qs ? `/startup/discover?${qs}` : "/startup/discover");
}
