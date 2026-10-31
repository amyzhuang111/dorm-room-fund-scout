import Discover from "../startup/discover/page";
import { SampleHome } from "@/components/sample-home";
import { loadHeroStats } from "@/lib/domain/hero-stats";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // Real corpus is the default. ?sample=1 stays a harmless alias.
  // Legacy Discover UI only when explicitly requested.
  if (sp.discover === "1") {
    return <Discover searchParams={Promise.resolve(sp)} />;
  }
  return (
    <SampleHome
      place="explore"
      feed={sp.feed === "leaderboard" ? "leaderboard" : "directory"}
      sector={sp.sector}
      kind={sp.kind}
      campus={sp.campus}
      more={sp.more}
      q={sp.q}
      sort={sp.sort}
      stats={loadHeroStats()}
    />
  );
}
