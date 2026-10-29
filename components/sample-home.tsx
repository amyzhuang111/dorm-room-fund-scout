import Link from "next/link";
import { GlobeHero, WorldMap } from "@/components/globe-hero";
import {
  directoryPage,
  directorySortOf,
  filterDirectory,
  leaderboardPage,
  loadDirectory,
  searchDirectory,
  sortDirectory,
  type DirectoryCard,
  type DirectoryFilter,
  type DirectorySort,
} from "@/lib/domain/directory";
import type { HeroStats } from "@/lib/domain/hero-stats";

export type Feed = "directory" | "leaderboard" | "world";

function browseHref(opts: {
  feed?: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort?: DirectorySort;
  more?: number;
}): string {
  const query = new URLSearchParams();
  query.set("sample", "1");
  if (opts.feed && opts.feed !== "directory") query.set("feed", opts.feed);
  if (opts.sector) query.set("sector", opts.sector);
  if (opts.kind) query.set("kind", opts.kind);
  if (opts.campus) query.set("campus", opts.campus);
  const q = opts.q?.trim();
  if (q) query.set("q", q);
  if (opts.sort && opts.sort !== "recent") query.set("sort", opts.sort);
  if (opts.more && opts.more > 1) query.set("more", String(opts.more));
  return `/?${query.toString()}#browse`;
}

export function SampleHome({
  feed,
  sector,
  kind,
  campus,
  more,
  q,
  sort,
  stats,
}: {
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  more?: string;
  q?: string;
  sort?: string;
  stats: HeroStats;
}) {
  const pages = Math.max(1, Math.floor(Number(more)) || 1);
  const query = q?.trim() ?? "";
  const order = directorySortOf(sort);
  const campusRow = campus ? stats.universities.find((university) => university.id === campus) : undefined;
  const campusId = campusRow?.id;
  const listed = feed === "directory" || feed === "leaderboard";
  const data = loadDirectory();
  const tiles = data.cards.map((card) => ({ id: card.id, name: card.name, schoolId: card.schoolId, signals: card.signals, logoUrl: card.logoUrl }));
  const matched = searchDirectory(filterDirectory(data.cards, sector, kind, campusId), query);
  const campusTotal = campusId ? filterDirectory(data.cards, undefined, undefined, campusId).length : null;
  const ordered = feed === "directory" ? sortDirectory(matched, order) : matched;
  const shown = feed === "leaderboard" ? leaderboardPage(ordered, pages) : directoryPage(ordered, pages);
  const total = feed === "leaderboard" ? matched.filter((card) => card.signals > 0).length : matched.length;

  return (
    <div className="hero-night bg-bg text-fg">
      <GlobeHero stats={stats} showGlobe={feed !== "world"} companies={tiles} />
      <section id="browse" className="scroll-mt-20 border-t border-line px-6 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[880px]">
          <div className="flex flex-wrap items-center gap-x-1 border-b border-line" role="tablist" aria-label="Views">
            <Tab href={browseHref({ feed: "directory", sector, kind, campus: campusId, q: query, sort: order })} active={feed === "directory"}>Directory</Tab>
            <Tab href={browseHref({ feed: "leaderboard", sector, kind, campus: campusId, q: query })} active={feed === "leaderboard"}>Leaderboard</Tab>
            <Tab href={browseHref({ feed: "world", campus: campusId })} active={feed === "world"}>World</Tab>
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
              {data ? <Filters sectors={data.sectors} kinds={data.kinds} feed={feed} sector={sector} kind={kind} campus={campusId} q={query} sort={order} /> : null}
            </>
          ) : null}
        </div>
        {feed === "world" ? (
          <div className="mx-auto mt-5 w-full max-w-[1200px]">
            <WorldMap stats={stats} companies={tiles} />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[880px] pt-4">
            <p className="mb-3 text-[14px] text-fg-2">
              Showing <span className="num font-medium text-fg">{total.toLocaleString("en-US")}</span>{" "}
              {total === 1 ? "company" : "companies"}
              {campusRow ? (
                <>
                  {" · "}
                  {campusRow.name}
                  {" · "}
                  <Link href={browseHref({ feed, sector, kind, q: query, sort: feed === "directory" ? order : undefined })} className="text-fg hover:underline">Clear</Link>
                </>
              ) : null}
            </p>
            {shown.length === 0 ? (
              <p className="text-[14px] text-fg-2">
                {query
                  ? `No companies match "${query}".`
                  : campusRow && campusTotal === 0
                    ? `No companies are stored for ${campusRow.name}.`
                    : "No companies in this category."}
              </p>
            ) : null}
            <ol className="flex flex-col gap-3">
              {shown.map((card, index) => (
                <Card key={card.id} card={card} rank={feed === "leaderboard" ? index + 1 : null} />
              ))}
            </ol>
            {shown.length < total ? (
              <Link href={browseHref({ feed, sector, kind, campus: campusId, q: query, sort: feed === "directory" ? order : undefined, more: pages + 1 })} className="mt-4 inline-flex h-10 items-center rounded border border-line px-4 text-[14px] font-medium text-fg hover:bg-raised">
                Show more
              </Link>
            ) : null}
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
  q,
  sort,
}: {
  sectors: DirectoryFilter[];
  kinds: DirectoryFilter[];
  feed: Feed;
  sector?: string;
  kind?: string;
  campus?: string;
  q?: string;
  sort: DirectorySort;
}) {
  const chip = "inline-flex h-8 items-center rounded-full border px-3 text-[13px]";
  const quiet = `${chip} border-line text-fg-2 hover:text-fg`;
  const on = `${chip} border-link text-fg`;
  const keep = { feed, sector, kind, campus, q, sort: feed === "directory" ? sort : undefined };
  const sorts: { id: DirectorySort; label: string }[] = [
    { id: "name", label: "Name" },
    { id: "recent", label: "Recent signal" },
    { id: "stage", label: "Stage" },
  ];
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/#browse" method="get" className="flex h-8 items-center gap-1" role="search">
          <input type="hidden" name="sample" value="1" />
          {feed !== "directory" ? <input type="hidden" name="feed" value={feed} /> : null}
          {sector ? <input type="hidden" name="sector" value={sector} /> : null}
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          {campus ? <input type="hidden" name="campus" value={campus} /> : null}
          {feed === "directory" && sort !== "recent" ? <input type="hidden" name="sort" value={sort} /> : null}
          <label htmlFor="directory-q" className="sr-only">Search companies, founders, and one-liners</label>
          <input
            id="directory-q"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Company, founder, or one-liner"
            className="h-8 w-44 rounded-full border border-line bg-raised px-3 text-[13px] text-fg outline-none placeholder:text-fg-3 sm:w-56"
          />
          <button type="submit" className="inline-flex h-8 items-center rounded-full border border-line px-3 text-[13px] text-fg">Search</button>
        </form>
        <Link href={browseHref({ ...keep, sector: undefined, kind: undefined })} className={!sector && !kind ? on : quiet}>All</Link>
        {sectors.map((item) => (
          <Link key={item.id} href={browseHref({ ...keep, sector: sector === item.id ? undefined : item.id })} className={sector === item.id ? on : quiet}>
            {item.label}
          </Link>
        ))}
        {kinds.map((item) => (
          <Link key={item.id} href={browseHref({ ...keep, kind: kind === item.id ? undefined : item.id })} className={kind === item.id ? on : quiet}>
            {item.label}
          </Link>
        ))}
      </div>
      {feed === "directory" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-2">Sort</span>
          {sorts.map((item) => (
            <Link key={item.id} href={browseHref({ feed, sector, kind, campus, q, sort: item.id })} className={sort === item.id ? on : quiet}>
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
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
        {card.founders.length > 0 ? (
          <p className="mt-1 text-[13px] leading-5 text-fg-3">
            {card.founders.slice(0, 3).join(", ")}
            {card.founders.length > 3 ? ` +${card.founders.length - 3}` : ""}
          </p>
        ) : null}
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
