// Parsers for public hotspot rosters. A name or company is returned only when
// the page marks it as a person or a team. Shared nav text is not a roster.

import * as cheerio from "cheerio";

export interface SchoolHit {
  universityId: string;
  label: string;
  excerpt: string;
}

export const HOTSPOT_SCHOOLS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "univ_penn", label: "University of Pennsylvania", pattern: /\buniversity of pennsylvania\b|\bupenn\b|\bwharton\b/i },
  { id: "univ_berkeley", label: "UC Berkeley", pattern: /\buc berkeley\b|\bu\.c\. berkeley\b|\buniversity of california,?\s+berkeley\b|\bberkeley eecs\b|\bhaas school\b/i },
  { id: "univ_stanford", label: "Stanford University", pattern: /\bstanford university\b|\bstanford\b/i },
  { id: "univ_mit", label: "Massachusetts Institute of Technology", pattern: /\bmassachusetts institute of technology\b|\bmit\b/i },
  { id: "univ_harvard", label: "Harvard University", pattern: /\bharvard university\b|\bharvard college\b|\bharvard business school\b|\bhbs\b/i },
  { id: "univ_columbia", label: "Columbia University", pattern: /\bcolumbia university\b|\bcolumbia college\b|\bcolumbia engineering\b/i },
  { id: "univ_princeton", label: "Princeton University", pattern: /\bprinceton university\b/i },
  { id: "univ_cmu", label: "Carnegie Mellon University", pattern: /\bcarnegie mellon\b|\bcmu\b/i },
  { id: "univ_gatech", label: "Georgia Institute of Technology", pattern: /\bgeorgia tech\b|\bgeorgia institute of technology\b/i },
  { id: "univ_michigan", label: "University of Michigan", pattern: /\buniversity of michigan\b|\bumich\b/i },
  { id: "univ_waterloo", label: "University of Waterloo", pattern: /\buniversity of waterloo\b|\buwaterloo\b/i },
];

const AFFILIATION_CONTEXT =
  /\b(student|students|freshm\w*|sophomore|junior|senior|studied|studying|study|alumni|alums?\b|graduated|undergrad|undergraduate|phd|ph\.d|class of|backgrounds?|researchers from|engineers from|spin-?off|degree|mba|dropout|dropped out|left|fellow|founder)\b/i;
const CUSTOMER_CONTEXT =
  /\b(using|used by|customers?|partnership with|partnered with|researchers at leading|already using|payment option|hospitals?|launched at|including the)\b/i;

export function schoolHitsIn(text: string): SchoolHit[] {
  const hits: SchoolHit[] = [];
  for (const school of HOTSPOT_SCHOOLS) {
    const pattern = new RegExp(school.pattern.source, school.pattern.flags);
    const match = pattern.exec(text);
    if (!match) continue;
    const excerpt = text
      .slice(Math.max(0, match.index - 110), Math.min(text.length, match.index + match[0].length + 110))
      .replace(/\s+/g, " ")
      .trim();
    const customer = CUSTOMER_CONTEXT.test(excerpt);
    const affiliated = AFFILIATION_CONTEXT.test(excerpt);
    if (customer && !affiliated) continue;
    if (!affiliated && !/\b(at|from)\b/i.test(excerpt)) continue;
    // "stanford" alone inside "stanford-affiliated" on a directory intro is the org, not one person.
    if (/\bstanford-affiliated founders\b/i.test(excerpt) && !/\b(i |i'm|studied|student|alumni|class)\b/i.test(excerpt)) continue;
    hits.push({ universityId: school.id, label: school.label, excerpt });
  }
  return hits;
}

export interface CohortNames {
  year: number;
  names: string[];
}

function personName(raw: string): string | null {
  const name = raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length < 3 || name.length > 80) return null;
  if (!/^[A-ZÀ-ÖØ-Þ]/.test(name)) return null;
  if (/cohort|program|stanford|fellow|return to/i.test(name)) return null;
  const words = name.split(" ");
  if (words.length < 2 || words.length > 6) return null;
  return name;
}

export function parseMayfieldAlumni(html: string): CohortNames[] {
  const parts = html.split(/<h2\b[^>]*>/i);
  const out: CohortNames[] = [];
  for (const part of parts.slice(1)) {
    const heading = part.split(/<\/h2>/i)[0]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    const yearMatch = heading.match(/\b(20\d{2})\s+cohort\b/i);
    if (!yearMatch) continue;
    const body = part.split(/<\/h2>/i).slice(1).join("</h2>");
    const nextHeading = body.search(/<h2\b/i);
    const section = nextHeading >= 0 ? body.slice(0, nextHeading) : body;
    const names: string[] = [];
    const paragraphs = section.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [section];
    for (const paragraph of paragraphs) {
      for (const chunk of paragraph.split(/<br\s*\/?>/i)) {
        const name = personName(chunk);
        if (name && !names.includes(name)) names.push(name);
      }
    }
    if (names.length) out.push({ year: Number(yearMatch[1]), names });
  }
  return out;
}

export interface RosterCompany {
  name: string;
  website: string | null;
  description: string | null;
  year: number | null;
  session: string | null;
}

export function parseDeltaVPast(html: string, minYear: number): RosterCompany[] {
  const $ = cheerio.load(html);
  const out: RosterCompany[] = [];
  $(".fusion-builder-row").each((_, row) => {
    const yearText = $(row).find("h1 p").first().text().replace(/\s+/g, " ").trim();
    if (!/^\d{4}$/.test(yearText)) return;
    const year = Number(yearText);
    if (year < minYear) return;
    $(row)
      .find('ul li a[rel="noopener"]')
      .each((__, a) => {
        const name = $(a).text().replace(/\s+/g, " ").trim();
        const website = ($(a).attr("href") || "").trim() || null;
        if (!name || name.length > 80) return;
        out.push({ name, website, description: null, year, session: null });
      });
  });
  return out;
}

export function parseDeltaV2026(html: string): RosterCompany[] {
  const $ = cheerio.load(html);
  const out: RosterCompany[] = [];
  $("h1").each((_, el) => {
    const name = $(el).text().replace(/\s+/g, " ").trim();
    if (!name || name.length > 60) return;
    if (/delta v|demo day|newsletter|subscribe|impossible/i.test(name)) return;
    const tagline = $(el).next("h3").text().replace(/\s+/g, " ").trim();
    const description = $(el).parent().find("p").first().text().replace(/\s+/g, " ").trim();
    const website = $(el).parent().find("a[href^='http']").first().attr("href") ?? null;
    if (!tagline && !description) return;
    out.push({
      name,
      website,
      description: [tagline, description].filter(Boolean).join(" · ").slice(0, 500),
      year: 2026,
      session: "2026 delta v",
    });
  });
  return out;
}

export function parseStartXCommunity(html: string): RosterCompany[] {
  const $ = cheerio.load(html);
  const out: RosterCompany[] = [];
  const seen = new Set<string>();
  $("a.comn-list-info-title-link").each((_, el) => {
    const name = $(el).find('[fs-list-field="title"]').first().text().replace(/\s+/g, " ").trim();
    const website = ($(el).attr("href") || "").trim() || null;
    const card = $(el).closest(".comn-list-info-rgt");
    const description = card.find('[fs-list-field="description"]').first().text().replace(/\s+/g, " ").trim() || null;
    const session = card.find('[fs-list-field="session"]').first().text().replace(/\s+/g, " ").trim() || null;
    const yearText = card.find('[fs-list-field="year"]').first().text().trim();
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push({ name, website, description, year, session });
  });
  return out;
}
