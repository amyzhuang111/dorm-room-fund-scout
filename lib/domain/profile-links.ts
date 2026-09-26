// Public profile links other than LinkedIn. Confirmed links are also stored
// as aliases (`github:`, `site:`, `devpost:`, and the newer prefixes).
// Unverified links stay on profile_link claims and never become aliases.

export const PROFILE_ICON_TYPES = ["github", "scholar", "website", "twitter", "substack", "huggingface", "devpost"] as const;
export type ProfileIconType = (typeof PROFILE_ICON_TYPES)[number];

export interface ProfileIconLink {
  type: ProfileIconType;
  url: string;
  status: "confirmed" | "unverified";
}

export interface OtherSourceLink {
  url: string;
  status: "confirmed" | "unverified";
  excerpt: string;
  evidenceUrl: string | null;
}

export function isIconType(type: string): type is ProfileIconType {
  return (PROFILE_ICON_TYPES as readonly string[]).includes(type);
}

export function profileLabel(type: ProfileIconType): string {
  switch (type) {
    case "github":
      return "GitHub";
    case "scholar":
      return "Scholar";
    case "website":
      return "Website";
    case "twitter":
      return "X";
    case "substack":
      return "Substack";
    case "huggingface":
      return "Hugging Face";
    case "devpost":
      return "Devpost";
  }
}

function aliasesOf(aliasesJson?: string | null): string[] {
  try {
    const parsed = JSON.parse(aliasesJson || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function githubUrl(raw: string): string | null {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(raw)) return `https://github.com/${raw}`;
  return null;
}

export function iconsFromAliases(aliasesJson?: string | null): ProfileIconLink[] {
  const links: ProfileIconLink[] = [];
  for (const alias of aliasesOf(aliasesJson)) {
    if (alias.startsWith("github:")) {
      const url = githubUrl(alias.slice("github:".length));
      if (url) links.push({ type: "github", url, status: "confirmed" });
    } else if (alias.startsWith("devpost:http://") || alias.startsWith("devpost:https://")) {
      links.push({ type: "devpost", url: alias.slice("devpost:".length), status: "confirmed" });
    } else if (alias.startsWith("site:http://") || alias.startsWith("site:https://")) {
      links.push({ type: "website", url: alias.slice("site:".length), status: "confirmed" });
    } else if (alias.startsWith("scholar:http")) {
      links.push({ type: "scholar", url: alias.slice("scholar:".length), status: "confirmed" });
    } else if (alias.startsWith("twitter:http")) {
      links.push({ type: "twitter", url: alias.slice("twitter:".length), status: "confirmed" });
    } else if (alias.startsWith("substack:http")) {
      links.push({ type: "substack", url: alias.slice("substack:".length), status: "confirmed" });
    } else if (alias.startsWith("huggingface:http")) {
      links.push({ type: "huggingface", url: alias.slice("huggingface:".length), status: "confirmed" });
    }
  }
  return links;
}

export function assembleProfileLinks(
  aliasesJson: string | null | undefined,
  claims: { valueJson: string; excerpt: string; sourceUrl: string | null }[],
): { profileLinks: ProfileIconLink[]; otherLinks: OtherSourceLink[] } {
  const icons = new Map<string, ProfileIconLink>();
  for (const icon of iconsFromAliases(aliasesJson)) {
    icons.set(linkKey(icon.type, icon.url), icon);
  }
  const other: OtherSourceLink[] = [];
  const otherSeen = new Set<string>();
  for (const claim of claims) {
    let value: { type?: string; url?: string; status?: string };
    try {
      value = JSON.parse(claim.valueJson) as { type?: string; url?: string; status?: string };
    } catch {
      continue;
    }
    const type = value.type ?? "";
    const url = value.url ?? "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    const status = value.status === "confirmed" ? "confirmed" : "unverified";
    if (type === "other") {
      const key = linkKey("other", url);
      if (otherSeen.has(key)) continue;
      otherSeen.add(key);
      other.push({
        url,
        status,
        excerpt: (claim.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 240),
        evidenceUrl: claim.sourceUrl,
      });
      continue;
    }
    if (!isIconType(type)) continue;
    const key = linkKey(type, url);
    const next: ProfileIconLink = { type, url, status };
    const prev = icons.get(key);
    if (!prev || (prev.status !== "confirmed" && next.status === "confirmed")) icons.set(key, next);
  }
  const profileLinks = [...icons.values()].sort((a, b) => {
    const byType = PROFILE_ICON_TYPES.indexOf(a.type) - PROFILE_ICON_TYPES.indexOf(b.type);
    if (byType !== 0) return byType;
    if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
    return a.url.localeCompare(b.url);
  });
  return { profileLinks, otherLinks: other };
}

export function linkKey(type: string, url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "scholar.google.com" || host.endsWith(".scholar.google.com")) {
      return `${type}|scholar:${parsed.searchParams.get("user") || parsed.pathname}`;
    }
    if (host === "x.com" || host === "twitter.com") {
      const handle = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
      return `${type}|x:${handle}`;
    }
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${type}|${host}${path}`;
  } catch {
    return `${type}|${url.trim().toLowerCase()}`;
  }
}
