// How a public URL is labeled when it is not the company's own product site.
// Official product sites stay in projects.website_url. Everything else is
// primary_link + primary_link_kind.

const KIND_BY_HOST: { test: (host: string) => boolean; kind: string; label: string }[] = [
  { test: (h) => h.includes("devpost.com"), kind: "devpost", label: "Devpost" },
  { test: (h) => h.includes("thedp.com"), kind: "press", label: "Press" },
  { test: (h) => h.includes("github.com"), kind: "github", label: "GitHub" },
  { test: (h) => h.includes("crunchbase.com"), kind: "crunchbase", label: "Crunchbase" },
  { test: (h) => h.includes("ycombinator.com"), kind: "accelerator", label: "YC page" },
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
    return { kind: "other", label: "Public page" };
  }
  return { kind: "other", label: "Public page" };
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
  if (websiteUrl && websiteUrl.startsWith("http")) {
    return { url: websiteUrl, kind: "official", label: "Website" };
  }
  if (primaryLink && primaryLink.startsWith("http")) {
    const known = linkKind(primaryLink);
    return { url: primaryLink, kind: primaryKind || known.kind, label: known.label };
  }
  return null;
}
