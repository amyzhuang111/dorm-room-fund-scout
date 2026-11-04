// How a public URL is labeled when it is not the company's own product site.
// Official product sites stay in projects.website_url. Everything else is
// primary_link + primary_link_kind.

const KIND_BY_HOST: { test: (host: string) => boolean; kind: string; label: string }[] = [
  { test: (h) => h.includes("devpost.com"), kind: "devpost", label: "Devpost" },
  { test: (h) => h.includes("thedp.com"), kind: "press", label: "Press" },
  { test: (h) => h.includes("github.com"), kind: "github", label: "GitHub" },
  { test: (h) => h.includes("crunchbase.com"), kind: "crunchbase", label: "Crunchbase" },
  { test: (h) => h.includes("ycombinator.com"), kind: "accelerator", label: "YC page" },
  { test: (h) => h.includes("sequoiacap.com") || h.includes("a16z.com") || h.includes("andreessenhorowitz.com"), kind: "accelerator", label: "Investor page" },
  { test: (h) => h.includes("venturelab.upenn.edu") || h.includes("velocityincubator.com") || h.includes("skydeck.berkeley.edu") || h.includes("healthtech.upenn.edu") || h.includes("speedrun.a16z.com"), kind: "accelerator", label: "Accelerator page" },
  { test: (h) => h.endsWith(".edu"), kind: "directory", label: "University page" },
  { test: (h) => ["linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "google.com", "tiktok.com"].some((d) => h === d || h.endsWith(`.${d}`)), kind: "social", label: "Social profile" },
];

export function linkKind(url: string): { kind: string; label: string } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host.includes("venturelab.upenn.edu") && /press|-pr(?:\/|$)/i.test(parsed.pathname)) {
      return { kind: "press", label: "Press" };
    }
    for (const row of KIND_BY_HOST) {
      if (row.test(host)) return { kind: row.kind, label: row.label };
    }
  } catch {
    return { kind: "other", label: hostLabel(url) };
  }
  return { kind: "other", label: hostLabel(url) };
}

/** A readable name for a link that is not a known directory, press, or social host. */
function hostLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "news.google.com" || host.endsWith(".news.google.com")) return "News";
    if (!host) return "Source";
    return host;
  } catch {
    return "Source";
  }
}

export function isOfficialProductHost(url: string): boolean {
  const { kind } = linkKind(url);
  return kind === "other";
}

export interface PublicLink {
  url: string;
  kind: string;
  label: string;
}

export function publicLink(websiteUrl: string | null | undefined, primaryLink: string | null | undefined, primaryKind: string | null | undefined): PublicLink | null {
  const site = ownWebsite(websiteUrl);
  if (site) return { url: site, kind: "official", label: "Website" };
  const stored = [websiteUrl, primaryLink].find((url) => url && url.startsWith("http"));
  if (!stored) return null;
  const known = linkKind(stored);
  const kind = stored === primaryLink && primaryKind ? primaryKind : known.kind;
  return { url: stored, kind, label: known.label };
}

function urlKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function isCompanyLinkedIn(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "linkedin.com" || host.endsWith(".linkedin.com")) && parsed.pathname.toLowerCase().includes("/company/");
  } catch {
    return false;
  }
}

function isPersonLinkedIn(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "linkedin.com" || host.endsWith(".linkedin.com")) && parsed.pathname.toLowerCase().includes("/in/");
  } catch {
    return false;
  }
}

/** The company's own site, only when `website_url` is a product host we stored. */
export function ownWebsite(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("http")) return null;
  if (!isOfficialProductHost(url)) return null;
  return url;
}

export interface LabeledLink {
  url: string;
  label: string;
}

export interface StoredCompanyLinks {
  website: string | null;
  linkedin: string | null;
  /** Shown when there is no own-site URL. A source page we already stored. */
  fallback: LabeledLink | null;
  extras: LabeledLink[];
}

export function storedCompanyLinks(input: {
  websiteUrl?: string | null;
  primaryLink?: string | null;
  sourceUrls?: (string | null | undefined)[];
}): StoredCompanyLinks {
  const website = ownWebsite(input.websiteUrl);
  const seen = new Set<string>();
  if (website) seen.add(urlKey(website));
  let linkedin: string | null = null;
  const pages: LabeledLink[] = [];

  const ordered = [input.websiteUrl, input.primaryLink, ...(input.sourceUrls ?? [])];
  for (const raw of ordered) {
    if (!raw || !raw.startsWith("http")) continue;
    if (isPersonLinkedIn(raw)) continue;
    const key = urlKey(raw);
    if (seen.has(key)) continue;
    if (isCompanyLinkedIn(raw)) {
      if (!linkedin) linkedin = raw;
      seen.add(key);
      continue;
    }
    if (website && key === urlKey(website)) continue;
    seen.add(key);
    pages.push({ url: raw, label: linkKind(raw).label });
  }

  const fallback = website ? null : (pages[0] ?? null);
  const extras = (website ? pages : pages.slice(1)).slice(0, 6);
  return { website, linkedin, fallback, extras };
}
