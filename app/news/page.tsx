import Link from "next/link";
import { NewsStory } from "@/components/news-story";
import { listUniversities } from "@/lib/domain/queries";
import { listNews } from "@/lib/domain/news";
import { CATEGORY_LABEL, NEWS_CATEGORIES, NEWS_SOURCE_TYPES, SOURCE_TYPE_LABEL, isNewsCategory, isNewsSourceType, newsDayKey, newsDayLabel, type NewsCategory, type NewsSourceType } from "@/lib/domain/news-types";
import { buildHref } from "@/lib/domain/url";

const TIERS = ["S+", "S", "A", "B", "C", "D"];

export const metadata = {
  title: "News — Campus Scout",
  description: "Public news about startups and founders in Campus Scout.",
};

export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const campus = sp.campus || undefined;
  const tier = sp.tier || undefined;
  const category: NewsCategory | undefined = isNewsCategory(sp.category) ? sp.category : undefined;
  const sourceType: NewsSourceType | undefined = isNewsSourceType(sp.source) ? sp.source : undefined;
  const from = sp.from || undefined;
  const to = sp.to || undefined;
  const search = sp.q?.trim() || undefined;
  const items = listNews({ campusId: campus, tier, category, sourceType, from, to, search, limit: 400 });
  const universities = listUniversities();
  const current = { campus, tier, category, source: sourceType, from, to, q: search };
  const fundingOn = category === "funding";
  const groups: { label: string; items: typeof items }[] = [];
  for (const item of items) {
    const label = newsDayLabel(item.publishedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="min-h-full bg-white text-black">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-black">News</h1>
        <p className="mt-1 text-sm text-black">
          Public headlines about startups and founders in Campus Scout. A story is kept when the startup name appears with a founder, school, or company domain.
          News is sourcing context. It is not an input to Founder Signal, eligibility, or investment score.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={buildHref("/news", current, { category: null })}
            className={`rounded-full border border-black px-3 py-1 text-sm font-semibold ${category ? "bg-white text-black" : "bg-black text-white"}`}
            aria-pressed={!category}
          >
            All
          </Link>
          <Link
            href={buildHref("/news", current, { category: fundingOn ? null : "funding" })}
            className={`rounded-full border border-black px-3 py-1 text-sm font-semibold ${fundingOn ? "bg-black text-white" : "bg-white text-black"}`}
            aria-pressed={fundingOn}
          >
            Funding
          </Link>
          <span className="text-sm text-black">{items.length === 400 ? "Latest 400 stories" : `${items.length} ${items.length === 1 ? "story" : "stories"}`}</span>
        </div>

        <form
          key={[campus ?? "", tier ?? "", category ?? "", sourceType ?? "", from ?? "", to ?? "", search ?? ""].join("|")}
          method="get"
          action="/news"
          className="mt-4 grid gap-3 border border-black bg-white p-3 sm:grid-cols-2"
        >
          <label className="block text-sm font-semibold text-black">
            Search
            <input
              name="q"
              defaultValue={search ?? ""}
              placeholder="Startup, founder, or headline"
              className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-black">
            Campus
            <select name="campus" defaultValue={campus ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black">
              <option value="">All campuses</option>
              {universities.map((university) => (
                <option key={university.id} value={university.id}>
                  {university.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-black">
            Tier
            <select name="tier" defaultValue={tier ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black">
              <option value="">All tiers</option>
              {TIERS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-black">
            Category
            <select name="category" defaultValue={category ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black">
              <option value="">All categories</option>
              {NEWS_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-black">
            Source
            <select name="source" defaultValue={sourceType ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black">
              <option value="">All sources</option>
              {NEWS_SOURCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_TYPE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-black">
            From
            <input type="date" name="from" defaultValue={from ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black" />
          </label>
          <label className="block text-sm font-semibold text-black">
            To
            <input type="date" name="to" defaultValue={to ?? ""} className="mt-1 w-full rounded-md border border-black bg-white px-2 py-1.5 text-sm font-medium text-black" />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="rounded-md border border-black bg-black px-3 py-1.5 text-sm font-semibold text-white">
              Apply filters
            </button>
            <Link href="/news" className="rounded-md border border-black px-3 py-1.5 text-sm font-semibold text-black">
              Clear
            </Link>
          </div>
        </form>

        {items.length === 0 ? (
          <p className="mt-8 text-sm text-black">
            No stories match. Coverage comes from <code className="font-mono text-xs">npm run news:fetch</code>: press, campus papers, press releases, launches, Reddit, and public X search.
          </p>
        ) : (
          <div className="mt-6">
            {groups.map((group) => (
              <section key={group.label || "undated"}>
                <h2 className="mt-6 border-b border-black pb-1 text-sm font-semibold uppercase tracking-wide text-black">{group.label}</h2>
                {group.items.map((item) => (
                  <NewsStory key={item.id} item={item} />
                ))}
              </section>
            ))}
          </div>
        )}
        <p className="mt-6 text-xs text-black">Newest first. {newsDayKey(items[0]?.publishedAt) ? `Latest day ${newsDayKey(items[0]?.publishedAt)}.` : ""}</p>
      </div>
    </div>
  );
}
