// Minimal RSS item parser for Google News, TechCrunch, and campus paper feeds.

export interface RssItem {
  title: string;
  link: string;
  publishedAt: string | null;
  snippet: string;
  sourceName: string | null;
}

export function plainText(value: string): string {
  return decode(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const n = Number.parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
}

function stripTags(value: string): string {
  return decode(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function sourceFrom(block: string): string | null {
  const match = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i);
  const name = match ? stripTags(match[1]) : "";
  return name || null;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function atomLink(block: string): string {
  const hrefs: { href: string; rel: string }[] = [];
  for (const match of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = match[1] ?? "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] ?? "";
    if (href.startsWith("http")) hrefs.push({ href: decode(href), rel });
  }
  return (hrefs.find((link) => link.rel === "alternate") ?? hrefs.find((link) => link.rel !== "self") ?? hrefs[0])?.href ?? "";
}

function pushItem(items: RssItem[], title: string, link: string, publishedRaw: string, snippetRaw: string, sourceName: string | null) {
  if (!title || !link.startsWith("http")) return;
  let snippet = snippetRaw;
  const same = snippet.toLowerCase() === title.toLowerCase();
  const prefixed = snippet.toLowerCase().startsWith(title.toLowerCase());
  if (same || prefixed) {
    const rest = prefixed ? snippet.slice(title.length).replace(/^[\s\-–—:|]+/, "").trim() : "";
    snippet = rest.length > 40 ? rest : "";
  }
  items.push({
    title: title.slice(0, 300),
    link,
    publishedAt: toIso(publishedRaw),
    snippet: snippet.slice(0, 400),
    sourceName,
  });
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const block = match[1];
    const title = tag(block, "title");
    const link = tag(block, "link") || tag(block, "guid");
    pushItem(items, title, link, tag(block, "pubDate") || tag(block, "published") || tag(block, "updated"), tag(block, "description"), sourceFrom(block));
  }
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((match = entryRe.exec(xml))) {
    const block = match[1];
    pushItem(items, tag(block, "title"), atomLink(block), tag(block, "published") || tag(block, "updated"), tag(block, "content") || tag(block, "summary"), sourceFrom(block));
  }
  return items;
}
