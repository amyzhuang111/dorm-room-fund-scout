"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NewsListItem } from "@/lib/domain/news-types";
import { NewsStory } from "./news-story";

export function InTheNews({ items, personId, moreHref }: { items?: NewsListItem[]; personId?: string; moreHref?: string }) {
  const [stories, setStories] = useState<NewsListItem[] | null>(items ?? null);

  useEffect(() => {
    if (items || !personId) return;
    let cancel = false;
    fetch(`/api/news?person=${encodeURIComponent(personId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: NewsListItem[] } | null) => {
        if (!cancel) setStories(data?.items ?? []);
      })
      .catch(() => {
        if (!cancel) setStories([]);
      });
    return () => {
      cancel = true;
    };
  }, [items, personId]);

  if (!stories || stories.length === 0) return null;
  const founderName = stories[0]?.founders.find((founder) => founder.id === personId)?.name;
  const more = moreHref ?? (personId && founderName ? `/news?q=${encodeURIComponent(founderName)}` : "/news");

  return (
    <section className="rounded-md border border-black bg-white p-3 text-black">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-black">In the news</h3>
        <Link href={more} className="text-xs font-semibold text-black underline">
          All news
        </Link>
      </div>
      <div className="mt-1">
        {stories.map((item) => (
          <NewsStory key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
