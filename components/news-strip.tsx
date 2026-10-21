import Link from "next/link";
import { listNews } from "@/lib/domain/news";

export function NewsStrip() {
  const items = listNews({ limit: 5 });
  if (items.length === 0) return null;
  return (
    <section className="border-t border-border-c">
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 overflow-x-auto px-6 py-4 text-sm">
        <Link href="/news" className="ui-label shrink-0 text-foreground">
          In the news
        </Link>
        {items.map((item) => (
          <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="max-w-[280px] shrink-0 truncate text-muted underline decoration-border-c hover:text-foreground">
            {item.headline}
          </a>
        ))}
      </div>
    </section>
  );
}
