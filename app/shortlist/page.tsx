import { redirect } from "next/navigation";
import { requireMemberPage } from "@/lib/auth/guard";

// /shortlist is kept as a compatibility alias for /startup/shortlist.
export default async function ShortlistRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireMemberPage("/startup/shortlist");
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]).toString();
  redirect(qs ? `/startup/shortlist?${qs}` : "/startup/shortlist");
}
