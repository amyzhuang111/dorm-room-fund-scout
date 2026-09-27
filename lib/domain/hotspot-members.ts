// Parsers for public club and cohort pages. A person is returned only when the
// page prints a name next to a role, a cohort, or a team section. Shared nav
// text and advisor lists that are not the student team are left out.

import * as cheerio from "cheerio";

export interface RosterMember {
  name: string;
  role: string;
  classYears: string[];
  section: string | null;
  company: string | null;
  linkedin: string | null;
  line: string;
}

const CLASS_TOKEN = /\b(?:M&T|SEAS|WEMBA|GEng|[A-Z]{1,5}\d?)(?:'[A-Z]{1,4})?'\d{2}\b/g;
const PARTICLES = new Set(["de", "la", "del", "da", "di", "van", "von", "of"]);

function tidy(text: string): string {
  return text.replace(/[’‘ʼ]/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function wordOk(word: string): boolean {
  if (PARTICLES.has(word.toLowerCase())) return true;
  if (/^[\p{Lu}](?:\.[\p{Lu}])+\.?$/u.test(word)) return true;
  return /^[\p{Lu}][\p{L}'’-]*$/u.test(word);
}

function cleanName(raw: string): string | null {
  let name = raw.replace(CLASS_TOKEN, " ");
  name = name.replace(/\([^)]*\)/g, " ").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  name = name.replace(/^[\s,;:&+/.-]+|[\s,;:&+/.-]+$/g, "");
  if (!name) return null;
  const words = name.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;
  if (!words.every(wordOk)) return null;
  return name;
}

export function parsePersonList(blob: string): { name: string; classYears: string[] }[] {
  const text = tidy(blob).replace(/\s+&\s+/g, ", ").replace(/\s+\band\s+/g, ", ");
  if (!text) return [];
  const chunks = text.split(/\s*(?:,|;)\s*/).map((part) => part.trim()).filter(Boolean);
  const people: { name: string; classYears: string[] }[] = [];
  for (const chunk of chunks) {
    const classYears = [...chunk.matchAll(CLASS_TOKEN)].map((match) => match[0]);
    const name = cleanName(chunk);
    if (!name) {
      if (classYears.length && people.length) people[people.length - 1].classYears.push(...classYears);
      continue;
    }
    people.push({ name, classYears });
  }
  return people;
}

function pushPeople(
  people: { name: string; classYears: string[] }[],
  section: string | null,
  company: string | null,
  line: string,
  out: RosterMember[],
  seen: Set<string>
) {
  for (const person of people) {
    const key = person.name.toLowerCase();
    if (seen.has(key)) continue;
    if (company && key === company.toLowerCase()) continue;
    seen.add(key);
    out.push({
      name: person.name,
      role: section ? `VIP-X ${section} cohort` : "VIP-X cohort",
      classYears: person.classYears,
      section,
      company,
      linkedin: null,
      line: line.slice(0, 500),
    });
  }
}

function peelParentheses(source: string): { name: string; classYears: string[] }[] {
  const found: { name: string; classYears: string[] }[] = [];
  let text = source;
  for (let guard = 0; guard < 12; guard++) {
    const match = text.match(/\(([^()]*)\)/);
    if (!match || match.index == null) break;
    const inside = match[1];
    const people = parsePersonList(inside);
    if (people.length) found.push(...people);
    else {
      const years = [...inside.matchAll(CLASS_TOKEN)].map((item) => item[0]);
      const before = text.slice(0, match.index);
      const name = trailingName(before);
      if (name && years.length) found.push({ name, classYears: years });
    }
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  }
  return found;
}

function trailingName(before: string): string | null {
  const tokens = before.slice(Math.max(0, before.length - 80)).trim().split(/\s+/).filter(Boolean);
  const words: string[] = [];
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index].replace(/^[,;()]+|[,;()]+$/g, "");
    if (!token || /[.!?:]/.test(token)) break;
    if (!wordOk(token)) break;
    words.unshift(token);
    if (words.length >= 5) break;
  }
  return cleanName(words.join(" "));
}

function peopleFromLine(line: string, section: string | null, company: string | null): RosterMember[] {
  const cleaned = tidy(line);
  if (!cleaned || cleaned.length < 5) return [];
  const founder = cleaned.match(/\bfounders?\s*:\s*(.+)$/i);
  const source = founder ? founder[1] : cleaned;
  const seen = new Set<string>();
  const out: RosterMember[] = [];
  const peeled = peelParentheses(source);
  if (peeled.length) pushPeople(peeled, section, company, cleaned, out, seen);
  else if (cleaned.length <= 180 && !/[.!?]/.test(cleaned)) pushPeople(parsePersonList(source), section, company, cleaned, out, seen);
  return out;
}

function companyFromLine(line: string): string | null {
  const text = tidy(line);
  const bold = text.match(/^([^:(]{2,80}?)(?:\s*[:.]|\s+\()/);
  if (!bold) return null;
  const name = bold[1].replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return null;
  if (/^founders?$/i.test(name)) return null;
  return name;
}

export function parseVipXHtml(html: string): RosterMember[] {
  const $ = cheerio.load(html);
  const members: RosterMember[] = [];
  $(".PromoAccordion").each((_, accordion) => {
    const section = tidy($(accordion).find(".PromoAccordion-title").first().text());
    $(accordion).find("li").each((__, li) => {
      const line = tidy($(li).text());
      members.push(...peopleFromLine(line, section || null, companyFromLine(line)));
    });
  });
  $(".PromoEventWithImage").each((_, card) => {
    const company = tidy($(card).find(".PromoEventWithImage-title").first().text()) || null;
    const italic = tidy($(card).find("i").text());
    let section = "";
    let node = $(card);
    for (let depth = 0; depth < 10 && !section; depth++) {
      const header = node.prevAll().find("h2.ModuleHeader-title").last().text();
      section = tidy(header);
      node = node.parent();
    }
    section = section.replace(/\s+cohort$/i, "");
    if (!italic) return;
    members.push(...peopleFromLine(italic, section || null, company));
  });
  return members;
}

export function parseFreeVenturesTeam(source: string): RosterMember[] {
  const start = source.indexOf('name:"Om Gole"');
  if (start < 0) return [];
  const arrayStart = source.lastIndexOf("[{", start);
  const arrayEnd = source.indexOf("}]", start);
  if (arrayStart < 0 || arrayEnd < 0) return [];
  const chunk = source.slice(arrayStart, arrayEnd + 2);
  const members: RosterMember[] = [];
  const re = /\{name:"([^"]+)",position:"([^"]+)",linkedinUrl:"([^"]*)"/g;
  for (const match of chunk.matchAll(re)) {
    const name = tidy(match[1]);
    if (!cleanName(name)) continue;
    // "Ex-Director" is a past title. Keeping that word in the stored role
    // would read as a current officer.
    const position = match[2].replace(/,?\s*Ex-[^,]+/g, "").replace(/\s+,/g, ",").trim();
    members.push({
      name,
      role: `Free Ventures ${position || "team"}`,
      classYears: [],
      section: "team",
      company: null,
      linkedin: match[3] || null,
      line: `${name}, ${match[2]}`,
    });
  }
  return members;
}

const LAUNCHPAD_ROLE = /^(president|internal vp|external vp|vp of\b.*|head of\b.*|project leader|client project lead|internal project lead)$/i;

export function parseLaunchpadAbout(html: string): RosterMember[] {
  const broken = html.replace(/<\/(p|div|h1|h2|h3|li|section)>/gi, "\n</$1>");
  const $ = cheerio.load(broken);
  const lines = $("body")
    .text()
    .split("\n")
    .map((line) => tidy(line))
    .filter(Boolean);
  const start = lines.findIndex((line) => line === "F26 Team" || line.startsWith("F26 Team"));
  if (start < 0) return [];
  let section = "team";
  const members: RosterMember[] = [];
  let pending: string | null = null;
  const flush = (name: string, role: string) => {
    if (!cleanName(name)) return;
    members.push({
      name,
      role: `Cal Launchpad ${role}`,
      classYears: [],
      section,
      company: null,
      linkedin: null,
      line: `${name}, ${role}, F26 Team`,
    });
  };
  for (const line of lines.slice(start + 1)) {
    if (line === "Launchpad" || line.startsWith("©")) break;
    if (/^(executives|project leaders|members)$/i.test(line)) {
      if (pending) {
        const fallback = section === "project leaders" ? "project leader" : section === "members" ? "member" : "team";
        flush(pending, fallback);
        pending = null;
      }
      section = line.toLowerCase();
      continue;
    }
    if (/^email\b/i.test(line) || /^\d+$/.test(line) || line.endsWith("on LinkedIn")) continue;
    if (LAUNCHPAD_ROLE.test(line)) {
      if (pending) flush(pending, line);
      pending = null;
      continue;
    }
    const name = cleanName(line);
    if (!name) continue;
    if (pending) {
      const fallback = section === "project leaders" ? "project leader" : section === "members" ? "member" : "team";
      flush(pending, fallback);
    }
    pending = name;
  }
  if (pending) {
    const fallback = section === "project leaders" ? "project leader" : section === "members" ? "member" : "team";
    flush(pending, fallback);
  }
  return members;
}

export function parseSkyDeckTeam(html: string): RosterMember[] {
  const $ = cheerio.load(html);
  const members: RosterMember[] = [];
  $("h2").each((_, heading) => {
    const section = tidy($(heading).text());
    if (section !== "SkyDeck Team" && section !== "SkyDeck Board of Directors") return;
    let node = $(heading);
    let grid = node.nextAll(".team_peopleGrid").first();
    for (let depth = 0; depth < 6 && !grid.length; depth++) {
      node = node.parent();
      grid = node.nextAll(".team_peopleGrid").first();
    }
    grid.find("h4").each((__, nameNode) => {
      const name = tidy($(nameNode).text());
      if (!cleanName(name)) return;
      const card = $(nameNode).closest(".single_testimonial_content_inner");
      const title = tidy(card.find("p").first().text());
      const linkedin = card.find('a[href*="linkedin.com/in/"]').attr("href") ?? null;
      if (!title) return;
      members.push({
        name,
        role: "Berkeley SkyDeck team",
        classYears: [],
        section,
        company: null,
        linkedin,
        line: `${name}, ${title}`,
      });
    });
  });
  return members;
}

const UC_LAUNCH_ROLE = /^(co-chair|svp\b.*|vp\b.*)$/i;

export function parseUcLaunchTeam(html: string): RosterMember[] {
  const $ = cheerio.load(html);
  const texts: string[] = [];
  $("span").each((_, node) => {
    const text = tidy($(node).text());
    if (!text || text.length > 60) return;
    if (texts[texts.length - 1] === text) return;
    texts.push(text);
  });
  const start = texts.findIndex((line) => line === "Our Team.");
  const end = texts.findIndex((line, index) => index > start && line === "Our Faculty.");
  if (start < 0 || end < 0) return [];
  const members: RosterMember[] = [];
  let pending: string | null = null;
  for (const line of texts.slice(start + 1, end)) {
    if (UC_LAUNCH_ROLE.test(line)) {
      if (pending && cleanName(pending)) {
        members.push({
          name: pending,
          role: `UC LAUNCH ${line}`,
          classYears: [],
          section: "team",
          company: null,
          linkedin: null,
          line: `${pending}, ${line}`,
        });
      }
      pending = null;
      continue;
    }
    if (!cleanName(line)) continue;
    if (pending && cleanName(pending)) {
      members.push({
        name: pending,
        role: "UC LAUNCH team",
        classYears: [],
        section: "team",
        company: null,
        linkedin: null,
        line: pending,
      });
    }
    pending = line;
  }
  return members;
}

export function parseCenterCityFounders(html: string): RosterMember[] {
  const $ = cheerio.load(html);
  const members: RosterMember[] = [];
  let inFounders = false;
  $("h3, h4, .accordion-item__title").each((_, node) => {
    const text = tidy($(node).text());
    if (/^founding team$/i.test(text)) {
      inFounders = true;
      return;
    }
    if (/^investment team$/i.test(text)) {
      inFounders = false;
      return;
    }
    if (!inFounders || !$(node).hasClass("accordion-item__title")) return;
    const name = cleanName(text);
    if (!name) return;
    const role = tidy($(node).closest("li").find(".accordion-item__description strong").first().text());
    if (!/co-founder/i.test(role)) return;
    members.push({
      name,
      role: `Center City Ventures ${role}`,
      classYears: ["Class of 2026"],
      section: "founding team",
      company: null,
      linkedin: null,
      line: `${name}, ${role}`,
    });
  });
  return members;
}

export interface DrfPartner {
  name: string;
  region: string;
  school: string;
  universityId: "univ_penn" | "univ_berkeley";
  campusLabel: string;
}

export function parseDrfCampusPartners(html: string): DrfPartner[] {
  const $ = cheerio.load(html);
  const partners: DrfPartner[] = [];
  $(".partner-card").each((_, card) => {
    const name = tidy($(card).find(".partner-card_name").first().text());
    const region = ($(card).attr("data-region") ?? "").trim();
    const school = tidy($(card).find(".partner-card_school").last().text());
    if (!cleanName(name) || !school) return;
    if (/\bM\.E\.T\./.test(school)) {
      partners.push({ name, region, school, universityId: "univ_berkeley", campusLabel: "UC Berkeley" });
      return;
    }
    if (/\bM&T\b/.test(school)) {
      partners.push({ name, region, school, universityId: "univ_penn", campusLabel: "Penn" });
    }
  });
  return partners;
}
