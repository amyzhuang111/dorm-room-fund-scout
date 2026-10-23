import Link from "next/link";
import { GlobeHero, WorldMap } from "@/components/globe-hero";
import {
  DIRECTORY_PAGE_SIZE,
  LEADERBOARD_PAGE_SIZE,
  directoryPage,
  filterDirectory,
  leaderboardPage,
  loadDirectory,
  type DirectoryCard,
  type DirectoryFilter,
} from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";

export type Feed = "directory" | "leaderboard" | "world";

function feedHref(feed: Feed, sector?: string, kind?: string, campus?: string): string {
  const query = new URLSearchParams();
  query.set("sample", "1");
  if (feed !== "directory") query.set("feed", feed);
  if (sector) query.set("sector", sector);
  if (kind) query.set("kind", kind);
  if (campus) query.set("campus", campus);
  return `/?${query.toString()}#browse`;
}

export function SampleHome({
  feed,
  sector,
  kind,
  campus,
  stats,
}: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  stats: HeroStats;
}) {
  const campusRow = campus ? stats.universities.find((university) => university.id === campus) : undefined;
  const campusId = campusRow?.id;
  const listed = feed === "directory" || feed === "leaderboard";
  const data = listed ? loadDirectory() : null;
  const matched = data ? filterDirectory(data.cards, sector, kind, campusId) : [];
  const campusTotal = data && campusId ? filterDirectory(data.cards, undefined, undefined, campusId).length : null;
  const shown = feed === "leaderboard" ? leaderboardPage(matched) : directoryPage(matched);
  const total = feed === "leaderboard" ? matched.filter((card) => card.signals > 0).length : matched.length;
  const pageSize = feed === "leaderboard" ? LEADERBOARD_PAGE_SIZE : DIRECTORY_PAGE_SIZE;

  return (
    <div className="hero-night bg-bg text-fg">
      <GlobeHero stats={stats} showGlobe={feed !== "world"} />
      <section id="browse" className="scroll-mt-20 border-t border-line px-6 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[880px]">
          <div className="flex flex-wrap items-center gap-x-1 border-b border-line" role="tablist" aria-label="Views">
            <Tab href={feedHref("directory", sector, kind, campusId)} active={feed === "directory"}>Directory</Tab>
            <Tab href={feedHref("leaderboard", sector, kind, campusId)} active={feed === "leaderboard"}>Leaderboard</Tab>
            <Tab href={feedHref("world", undefined, undefined, campusId)} active={feed === "world"}>World</Tab>
          </div>
          {listed ? (
            <>
              <h2 className="display mt-5 max-w-[18ch] text-[36px] leading-[40px]">
                {feed === "leaderboard" ? "Leaderboard" : "Student companies"}
              </h2>
              <p className="mt-3 max-w-[36rem] text-[16px] leading-6 text-fg-2">
                {feed === "leaderboard"
                  ? "Companies ranked by how many signals are on record."
                  : "The number on each card is how many signals are on record for that company."}
              </p>
              {data ? <Filters sectors={data.sectors} kinds={data.kinds} feed={feed} sector={sector} kind={kind} campus={campusId} /> : null}
            </>
          ) : null}
        </div>
        {feed === "world" ? (
          <div className="mx-auto mt-5 w-full max-w-[1200px]">
            <WorldMap stats={stats} />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[880px] pt-4">
            <p className="mb-3 text-[14px] text-fg-2">
              <span className="num text-fg">{Math.min(shown.length, total).toLocaleString("en-US")}</span>
              {total > pageSize ? ` of ${total.toLocaleString("en-US")}` : ""} companies
              {campusRow ? (
                <>
                  {" · "}
                  {campusRow.name}
                  {" · "}
                  <Link href={feedHref(feed, sector, kind)} className="text-fg hover:underline">Clear</Link>
                </>
              ) : null}
            </p>
            {shown.length === 0 ? (
              <p className="text-[14px] text-fg-2">
                {campusRow && campusTotal === 0 ? `No companies are stored for ${campusRow.name}.` : "No companies in this category."}
              </p>
            ) : null}
            <ol className="flex flex-col gap-3">
              {shown.map((card, index) => (
                <Card key={card.id} card={card} rank={feed === "leaderboard" ? index + 1 : null} />
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} role="tab" aria-selected={active} className={`grid h-10 place-items-center border-b-2 px-3 text-[14px] font-medium ${active ? "border-link text-fg" : "border-transparent text-fg-2"}`}>
      {children}
    </Link>
  );
}

function Filters({
  sectors,
  kinds,
  feed,
  sector,
  kind,
  campus,
}: {
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
}) {
  const chip = "inline-flex h-8 items-center rounded-full border px-3 text-[13px]";
  const quiet = `${chip} border-line text-fg-2 hover:text-fg`;
  const on = `${chip} border-link text-fg`;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={feedHref(feed, undefined, undefined, campus)} className={!sector && !kind ? on : quiet}>All</Link>
      {sectors.map((item) => (
        <Link key={item.id} href={feedHref(feed, sector === item.id ? undefined : item.id, kind, campus)} className={sector === item.id ? on : quiet}>
          {item.label}
        </Link>
      ))}
      {kinds.map((item) => (
        <Link key={item.id} href={feedHref(feed, sector, kind === item.id ? undefined : item.id, campus)} className={kind === item.id ? on : quiet}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function signalClass(label: DirectoryCard["signalLabel"]): string {
  if (label === "Funding") return "sig-chip sig-funding";
  if (label === "Launch") return "sig-chip sig-launch";
  if (label === "Award") return "sig-chip sig-award";
  if (label === "Acquisition") return "sig-chip sig-acquisition";
  return "border border-line text-fg-2";
}

function Card({ card, rank }: { card: DirectoryCard; rank: number | null }) {
  return (
    <li className="flex items-start gap-4 rounded-lg border border-line bg-raised px-4 py-4">
      {rank != null ? <span className="display w-8 shrink-0 pt-0.5 text-[22px] leading-7 text-fg-2">{rank}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-medium leading-6">
          <Link href={`/startup/${card.id}`} className="hover:underline">{card.name}</Link>
        </h2>
        {card.description ? <p className="mt-1 text-[14px] leading-5 text-fg-2">{card.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.school && card.schoolSlug ? (
            <Link href={`/campuses/${card.schoolSlug}`} className="inline-flex h-6 items-center rounded-full border border-line px-2 text-[13px] text-fg-2 hover:text-fg">{card.school}</Link>
          ) : null}
          {card.sector ? <span className="inline-flex h-6 items-center rounded-full border border-line px-2 text-[13px] text-fg-2">{card.sector}</span> : null}
          {card.stage ? <span className="inline-flex h-6 items-center rounded-full border border-line px-2 text-[13px] text-fg-2">{card.stage}</span> : null}
          {card.signalLabel ? <span className={`inline-flex h-6 items-center rounded-full px-2 text-[13px] ${signalClass(card.signalLabel)}`}>{card.signalLabel}</span> : null}
        </div>
      </div>
      <div className="flex w-16 shrink-0 flex-col items-center rounded-md border border-line bg-bg px-1 py-2" title="Signals on record">
        <span className="num text-[20px] font-semibold leading-none">{card.signals.toLocaleString("en-US")}</span>
        <span className="mt-1 text-[13px] leading-4 text-fg-2">signals</span>
      </div>
    </li>
  );
}
