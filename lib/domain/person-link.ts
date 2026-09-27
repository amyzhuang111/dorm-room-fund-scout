// A public profile URL already stored on the person. LinkedIn must be a
// captured linkedin.com/in path. GitHub handles are stored as `github:<handle>`
// by the GitHub ingests; the profile URL is that handle's own page.

export interface PersonLinkTarget {
  url: string;
  label: string;
  kind: "linkedin" | "likely" | "unverified" | "website" | "github" | "devpost";
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

export interface LinkedInAction {
  url: string;
  status: "confirmed" | "likely" | "unverified" | "search";
  label: "Open LinkedIn" | "LinkedIn (unverified)" | "Search LinkedIn";
}

export function readLinkedInCandidate(
  valueJson: string,
  verificationState?: string | null
): { url: string; reason: string; confidence: "likely" | "unverified" } | null {
  try {
    const value = JSON.parse(valueJson) as { linkedin?: unknown; reason?: unknown; confidence?: unknown };
    if (typeof value.linkedin !== "string" || !value.linkedin.includes("linkedin.com/in/")) return null;
    const confidence = verificationState === "likely" || value.confidence === "likely" ? "likely" : "unverified";
    const reason =
      typeof value.reason === "string" && value.reason.trim()
        ? value.reason
        : confidence === "likely"
          ? "Name plus one of school, startup, or program"
          : "Unverified candidate";
    return { url: value.linkedin, reason, confidence };
  } catch {
    return null;
  }
}

export function linkedinSearchUrl(parts: Array<string | null | undefined>): string {
  const keywords = parts
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

export function linkedinAction(input: {
  name: string;
  aliasesJson?: string | null;
  candidateUrl?: string | null;
  candidateConfidence?: "likely" | "unverified" | null;
  school?: string | null;
  company?: string | null;
}): LinkedInAction {
  const confirmed = confirmedLinkedIn(input.aliasesJson);
  if (confirmed) return { url: confirmed, status: "confirmed", label: "Open LinkedIn" };
  if (input.candidateUrl?.includes("linkedin.com/in/")) {
    if (input.candidateConfidence === "likely") return { url: input.candidateUrl, status: "likely", label: "Open LinkedIn" };
    return { url: input.candidateUrl, status: "unverified", label: "LinkedIn (unverified)" };
  }
  return {
    url: linkedinSearchUrl([input.name, input.school, input.company]),
    status: "search",
    label: "Search LinkedIn",
  };
}

export function linkedinActionFromStored(input: {
  name: string;
  linkedinUrl?: string | null;
  linkedinStatus?: "confirmed" | "likely" | "unverified" | null;
  school?: string | null;
  company?: string | null;
}): LinkedInAction {
  if (input.linkedinUrl && input.linkedinStatus === "confirmed") {
    return { url: input.linkedinUrl, status: "confirmed", label: "Open LinkedIn" };
  }
  if (input.linkedinUrl && input.linkedinStatus === "likely") {
    return { url: input.linkedinUrl, status: "likely", label: "Open LinkedIn" };
  }
  if (input.linkedinUrl && input.linkedinStatus === "unverified") {
    return { url: input.linkedinUrl, status: "unverified", label: "LinkedIn (unverified)" };
  }
  return {
    url: linkedinSearchUrl([input.name, input.school, input.company]),
    status: "search",
    label: "Search LinkedIn",
  };
}

export function bestPersonLink(input: {
  aliasesJson?: string | null;
  linkedinCandidates?: { url: string; confidence?: "likely" | "unverified" }[];
  websiteUrl?: string | null;
}): PersonLinkTarget | null {
  const aliases = aliasesOf(input.aliasesJson);
  const confirmed = aliases.find((a) => a.startsWith("linkedin:") && a.includes("linkedin.com/in/"));
  if (confirmed) return { url: confirmed.slice("linkedin:".length), label: "LinkedIn", kind: "linkedin" };

  const likely = input.linkedinCandidates?.find((c) => c.confidence === "likely" && c.url.includes("linkedin.com/in/"));
  if (likely) return { url: likely.url, label: "LinkedIn", kind: "likely" };

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
