import type { StartupCard } from "./startup-card";
import type { FounderPreview } from "./founder-preview";
import type { UserStartup } from "./user-pipeline";

function httpUrl(value: string | null): string | null {
  try { const url = new URL(value ?? ""); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
}

export function userStartupPreview(startup: UserStartup): StartupCard {
  const website = httpUrl(startup.websiteUrl);
  const source = httpUrl(startup.verificationUrl);
  return {
    id: startup.id, name: startup.name, websiteUrl: website, logoUrl: null,
    subtitle: startup.fundingStage, sector: null, links: website ? [{ kind: "website", url: website, confirmed: false }] : [],
    description: startup.description || null, region: null, teamSize: null, status: null,
    campuses: startup.campusName ? [startup.campusName] : [], verifiedOn: null, verifiedSource: null,
    verificationStatus: "user-added", sourceLink: source ? { label: "Source added by you", url: source } : null,
    founders: startup.founders.map(founder => ({
      id: founder.id, name: founder.name, role: founder.role || "Founder", program: null, school: startup.campusName || null,
      linkedinUrl: httpUrl(founder.linkedinUrl), linkedinConfidence: founder.linkedinUrl ? "unverified" : null,
      photoUrl: null, linkedinFollowers: null, yearsExperience: null,
    })),
  };
}

export function userFounderPreview(id: string, startups: UserStartup[]): FounderPreview | null {
  const matches = startups.filter(startup => startup.founders.some(founder => founder.id === id));
  const founder = matches[0]?.founders.find(founder => founder.id === id);
  if (!founder) return null;
  const linkedin = httpUrl(founder.linkedinUrl);
  return {
    id, name: founder.name, subtitle: founder.role || "Founder",
    schools: [...new Set(matches.map(startup => startup.campusName).filter(Boolean))],
    classYear: founder.classYear, classYearSource: null, verifiedOn: null, verificationStatus: "user-added",
    links: linkedin ? [{ kind: "linkedin", label: "LinkedIn (user-added)", url: linkedin }] : [],
    companies: matches.map(startup => ({ id: startup.id, name: startup.name, role: founder.role || "Founder",
      description: startup.description || null, logoUrl: null, websiteUrl: httpUrl(startup.websiteUrl) })),
    recordHref: `/startup/${encodeURIComponent(matches[0].id)}`,
  };
}
