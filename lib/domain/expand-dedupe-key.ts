import { normalizeCompanyName, websiteIdentity } from "./dedupe";

/** Stable set key for campus affiliations (affiliated_with universities). */
export function campusSetKey(campusIds: string[]): string {
  return [...new Set(campusIds.filter(Boolean))].sort().join("|");
}

/** Stable set key for founder person ids. */
export function founderSetKey(founderIds: string[]): string {
  return [...new Set(founderIds.filter(Boolean))].sort().join("|");
}

/**
 * Dedupe bucket after planDedupe:
 * - non-portal domain identity when present
 * - else normalized name + campus set + founder set
 * Never name alone.
 */
export function expandDedupeBucket(input: {
  name: string;
  websiteUrl: string | null | undefined;
  primaryLink: string | null | undefined;
  campusIds: string[];
  founderIds: string[];
  isSharedPortalHost: (host: string | null | undefined) => boolean;
}): { kind: "domain" | "name-campus-founders"; key: string } {
  const web = websiteIdentity(input.websiteUrl) || websiteIdentity(input.primaryLink);
  if (web && !input.isSharedPortalHost(web)) {
    return { kind: "domain", key: `domain:${web}` };
  }
  const norm = normalizeCompanyName(input.name);
  const campuses = campusSetKey(input.campusIds);
  const founders = founderSetKey(input.founderIds);
  return {
    kind: "name-campus-founders",
    key: `ncf:${norm}::${campuses}::${founders}`,
  };
}
