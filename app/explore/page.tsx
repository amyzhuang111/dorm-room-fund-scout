import { redirect } from "next/navigation";

// /explore is kept as a compatibility alias for /startup/discover (split
// into Founder Scout / Startup Scout per the nav restructure) — preserves
// any old bookmarked links/filters.
export default async function ExploreRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(qs ? `/startup/discover?${qs}` : "/startup/discover");
}
