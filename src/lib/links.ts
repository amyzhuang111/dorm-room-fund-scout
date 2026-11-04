export type FounderPerson = {
  id: string;
  name: string;
  href: string | null;
  label: string | null;
};

export type FounderRow = {
  id: string;
  name: string;
  tier: string | null;
  tierBasis: string | null;
  campus: string | null;
  signal: string;
  website: string | null;
  source: { url: string; kind: string } | null;
  people: FounderPerson[];
};

const sourceLabels: Record<string, string> = {
  accelerator: "Accelerator",
  directory: "Directory",
  press: "Press",
  social: "Social",
  github: "GitHub",
  devpost: "Devpost",
  crunchbase: "Crunchbase",
  website: "Website",
  other: "Source",
  link: "Source",
};

export function sourceLabel(kind: string | null | undefined) {
  if (!kind) return "Source";
  return sourceLabels[kind] ?? "Source";
}

export function safeHref(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}
