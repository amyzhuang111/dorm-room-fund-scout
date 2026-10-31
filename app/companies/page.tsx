import Discover from "../startup/discover/page";
import { SampleHome } from "@/components/sample-home";
import { loadHeroStats } from "@/lib/domain/hero-stats";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (sp.sample === "1") {
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
  return <Discover searchParams={Promise.resolve(sp)} />;
}
