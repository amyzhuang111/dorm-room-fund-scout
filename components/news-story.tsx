import Link from "next/link";
import type { NewsListItem } from "@/lib/domain/news-types";
import { CATEGORY_LABEL, SOURCE_TYPE_LABEL, newsShortDate } from "@/lib/domain/news-types";

export function NewsStory({ item }: { item: NewsListItem }) {
  return (
    <article className="border-b border-black/20 py-4">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-lg font-semibold leading-snug text-black underline decoration-black/30 underline-offset-2 hover:decoration-black"
        title={`${item.confidence} confidence match`}
      >
        {item.headline}
      </a>
      <p className="mt-1 text-sm text-black">
        {item.sourceName}
        <span className="px-1.5">·</span>
        {newsShortDate(item.publishedAt)}
      </p>
      {item.snippet && <p className="mt-1 line-clamp-2 text-sm text-black">{item.snippet}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex rounded-full border border-black px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
          {SOURCE_TYPE_LABEL[item.sourceType]}
        </span>
        <span className="inline-flex rounded-full border border-black px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
          {CATEGORY_LABEL[item.category]}
        </span>
        {item.startups.map((startup) => (
          <Link
            key={startup.id}
            href={`/startup/${startup.id}`}
            className="inline-flex max-w-[220px] items-center truncate rounded-full border border-black px-2 py-0.5 text-xs font-medium text-black hover:bg-black hover:text-white"
          >
            {startup.name}
            {startup.tier ? <span className="ml-1 font-semibold">{startup.tier}</span> : null}
          </Link>
        ))}
        {item.founders.map((founder) => (
          <Link
            key={founder.id}
            href={`/founder/discover?founder=${encodeURIComponent(founder.id)}&enroll=current_student,recent_grad,older_alumni`}
            className="inline-flex max-w-[220px] items-center truncate rounded-full border border-black bg-white px-2 py-0.5 text-xs font-medium text-black hover:bg-black hover:text-white"
          >
            {founder.name}
            {founder.tier ? <span className="ml-1 font-semibold">{founder.tier}</span> : null}
          </Link>
        ))}
      </div>
    </article>
  );
}
