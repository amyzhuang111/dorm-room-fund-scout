import { redirect } from "next/navigation";

// /shortlist is kept as a compatibility alias for /startup/shortlist.
export default async function ShortlistRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(qs ? `/startup/shortlist?${qs}` : "/startup/shortlist");
}
