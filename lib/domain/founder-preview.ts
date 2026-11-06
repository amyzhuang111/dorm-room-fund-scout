import { getDb } from "../db/client";
import { survivorId } from "./entity-redirects";
import { ownWebsite } from "./company-link";
import { confirmedLinkedIn, readLinkedInCandidate } from "./person-link";
import { assembleProfileLinks, profileLabel } from "./profile-links";
import { canonicalPersonLinkedIn, formatVerifiedDate, founderRoleLabel } from "./startup-card";
import { localCompanyLogoUrl } from "./local-logos";
import { isDirectoryBoilerplate } from "./sectors";

export interface FounderPreviewLink {
  kind: string;
  label: string;
  url: string;
}

export interface FounderPreviewCompany {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
}

export interface FounderPreview {
  id: string;
  name: string;
  subtitle: string | null;
  schools: string[];
  classYear: string | null;
  classYearSource: string | null;
  verifiedOn: string | null;
  verificationStatus: string | null;
  links: FounderPreviewLink[];
  companies: FounderPreviewCompany[];
  recordHref: string;
}

/** All recorded founding roles, regardless of investment eligibility or current filters. */
export function getFounderPreview(id: string): FounderPreview | null {
  const db = getDb();
  const resolved = survivorId("person", id) ?? id;
  const person = db.prepare(`SELECT id, name, aliases_json, founder_status, enrollment_grad_year,
    enrollment_basis, enrollment_source_url, verification_status, last_verified_at FROM people WHERE id = ?`).get(resolved) as {
    id: string; name: string; aliases_json: string; founder_status: string | null;
    enrollment_grad_year: number | null; enrollment_basis: string | null; enrollment_source_url: string | null;
    verification_status: string | null; last_verified_at: string | null;
  } | undefined;
  if (!person) return null;
  const schools = (db.prepare(`SELECT DISTINCT u.name FROM affiliations a JOIN universities u ON u.id = a.university_id
    WHERE a.person_id = ? ORDER BY u.name`).all(person.id) as { name: string }[]).map(row => row.name);
  const roles = db.prepare(`SELECT p.id, p.name, p.description, p.website_url, r.role FROM person_project_roles r
    JOIN projects p ON p.id = r.project_id WHERE r.person_id = ? AND p.kind = 'company' AND r.role LIKE '%founder%'
    ORDER BY p.name, r.role`).all(person.id) as { id: string; name: string; description: string | null; website_url: string | null; role: string }[];
  const companies = [...new Map(roles.map(row => [row.id, {
    id: row.id, name: row.name, role: founderRoleLabel(row.role),
    description: row.description && !isDirectoryBoilerplate(row.description) ? row.description : null,
    websiteUrl: ownWebsite(row.website_url), logoUrl: localCompanyLogoUrl(row.id),
  }])).values()];
  const links: FounderPreviewLink[] = [];
  const linkedin = canonicalPersonLinkedIn(confirmedLinkedIn(person.aliases_json));
  if (linkedin) links.push({ kind: "linkedin", label: "LinkedIn", url: linkedin });
  else {
    const claims = db.prepare(`SELECT value_json, verification_state FROM claims WHERE entity_type = 'person'
      AND entity_id = ? AND claim_type = 'linkedin_candidate' ORDER BY CASE verification_state WHEN 'likely' THEN 0 ELSE 1 END, rowid`).all(person.id) as { value_json: string; verification_state: string }[];
    for (const claim of claims) {
      const candidate = readLinkedInCandidate(claim.value_json, claim.verification_state);
      const url = canonicalPersonLinkedIn(candidate?.url);
      if (url && candidate) {
        links.push({ kind: "linkedin", label: `LinkedIn (${candidate.confidence === "likely" ? "likely match" : "unverified"})`, url });
        break;
      }
    }
  }
  const claims = (db.prepare(`SELECT value_json, excerpt, source_url FROM claims WHERE entity_type = 'person'
    AND entity_id = ? AND claim_type = 'profile_link'`).all(person.id) as { value_json: string; excerpt: string; source_url: string | null }[])
    .map(row => ({ valueJson: row.value_json, excerpt: row.excerpt, sourceUrl: row.source_url }));
  for (const link of assembleProfileLinks(person.aliases_json, claims).profileLinks) {
    links.push({ kind: link.type, label: `${profileLabel(link.type)}${link.status === "unverified" ? " (unverified)" : ""}`, url: link.url });
  }
  const params = new URLSearchParams({ founder: person.id, enroll: "current_student,recent_grad,older_alumni" });
  if (person.founder_status === "potential") params.set("pool", "potential");
  return {
    id: person.id, name: person.name, schools, companies, links,
    subtitle: companies.length ? "Founder" : person.founder_status === "potential" ? "Potential founder" : null,
    classYear: person.enrollment_grad_year ? `${person.enrollment_grad_year}${person.enrollment_basis === "inferred" ? " (estimated)" : ""}` : null,
    classYearSource: person.enrollment_source_url,
    verifiedOn: person.verification_status === "confirmed" ? formatVerifiedDate(person.last_verified_at) : null,
    verificationStatus: person.verification_status,
    recordHref: `/founder/discover?${params}`,
  };
}
