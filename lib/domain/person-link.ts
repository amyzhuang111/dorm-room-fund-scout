// A public profile URL already stored on the person. LinkedIn must be a
// captured linkedin.com/in path. GitHub handles are stored as `github:<handle>`
// by the GitHub ingests; the profile URL is that handle's own page.

export interface PersonLinkTarget {
  url: string;
  label: string;
  kind: "linkedin" | "unverified" | "website" | "github" | "devpost";
}

const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

function aliasesOf(aliasesJson?: string | null): string[] {
  try {
    const parsed = JSON.parse(aliasesJson || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

export function confirmedLinkedIn(aliasesJson?: string | null): string | null {
  const li = aliasesOf(aliasesJson).find((a) => a.startsWith("linkedin:") && a.includes("linkedin.com/in/"));
  return li ? li.slice("linkedin:".length) : null;
}

export function bestPersonLink(input: {
  aliasesJson?: string | null;
  linkedinCandidates?: { url: string }[];
  websiteUrl?: string | null;
}): PersonLinkTarget | null {
  const aliases = aliasesOf(input.aliasesJson);
  const confirmed = aliases.find((a) => a.startsWith("linkedin:") && a.includes("linkedin.com/in/"));
  if (confirmed) return { url: confirmed.slice("linkedin:".length), label: "LinkedIn", kind: "linkedin" };

  const candidate = input.linkedinCandidates?.find((c) => c.url.includes("linkedin.com/in/"));
  if (candidate) return { url: candidate.url, label: "LinkedIn (unverified)", kind: "unverified" };

  if (input.websiteUrl && /^https?:\/\//.test(input.websiteUrl)) {
    return { url: input.websiteUrl, label: "Website", kind: "website" };
  }
  const site = aliases.find((a) => a.startsWith("site:http://") || a.startsWith("site:https://"));
  if (site) return { url: site.slice("site:".length), label: "Website", kind: "website" };

  const github = aliases.find((a) => a.startsWith("github:"));
  if (github) {
    const handle = github.slice("github:".length).replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (GITHUB_HANDLE.test(handle)) return { url: `https://github.com/${handle}`, label: "GitHub", kind: "github" };
  }

  const devpost = aliases.find((a) => a.startsWith("devpost:http://") || a.startsWith("devpost:https://"));
  if (devpost) {
    const url = devpost.slice("devpost:".length);
    if (url.includes("devpost.com")) return { url, label: "Devpost", kind: "devpost" };
  }
  return null;
}
