import Link from "next/link";
import { listNews } from "@/lib/domain/news";

export function NewsStrip() {
  const items = listNews({ limit: 5 });
  if (items.length === 0) return null;
  return (
    <section className="border-b border-black bg-white text-black">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 overflow-x-auto px-4 py-2 text-sm sm:px-6">
        <Link href="/news" className="shrink-0 font-semibold text-black underline">
          In the news
        </Link>
        {items.map((item) => (
          <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="max-w-[280px] shrink-0 truncate text-black underline decoration-black/30 hover:decoration-black">
            {item.headline}
          </a>
        ))}
      </div>
    </section>
  );
}
