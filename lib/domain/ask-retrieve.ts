// Keyword and filter retrieval for Ask AI. The browser model only sees
// these rows. An empty list means the question is not in the data.

import { CAMPUSES } from "./campuses";
import { normHotspotName } from "./hotspot-model";
import { directoryLabel, hotspotGroups } from "./hotspots";
import { searchInvestors, searchOrganizations, searchPeople, searchStartups, type PeopleQuery } from "./ask-query";
import type { AskHit } from "./ask-types";

const LIMIT = 30;

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "which",
  "who",
  "are",
  "was",
  "has",
  "have",
  "most",
  "top",
  "tier",
  "building",
  "backed",
  "recent",
  "grads",
  "grad",
  "founders",
  "founder",
  "clubs",
  "club",
  "students",
  "student",
  "people",
  "startup",
  "startups",
  "campus",
  "show",
]);

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(question: string, phrase: string): boolean {
  if (phrase.length < 3) return false;
  return new RegExp(`\\b${escapeReg(phrase)}\\b`, "i").test(question);
}

function campusIn(question: string): string | undefined {
  const names = CAMPUSES.flatMap((campus) => [campus.shortLabel, campus.name, ...campus.aliases].map((name) => ({ name, label: campus.shortLabel })));
  names.sort((a, b) => b.name.length - a.name.length);
  return names.find((item) => mentions(question, item.name))?.label;
}

function organizationIn(question: string): string | undefined {
  if (/\bm\s*&\s*t\b|\bm and t\b/i.test(question)) return "M&T";
  const normQ = ` ${normHotspotName(question)} `;
  const campusPhrases = new Set(
    CAMPUSES.flatMap((campus) => [campus.shortLabel, campus.name, ...campus.aliases].map((name) => normHotspotName(name))).filter((phrase) => phrase.length >= 4)
  );
  let best = "";
  let bestLen = 0;
  for (const group of hotspotGroups()) {
    const phrases = [group.placeKey, ...group.phrases];
    for (const phrase of phrases) {
      if (phrase.length < 6 || campusPhrases.has(phrase)) continue;
      if (!normQ.includes(` ${phrase} `)) continue;
      if (phrase.length > bestLen) {
        best = directoryLabel(group.cards);
        bestLen = phrase.length;
      }
    }
  }
  return best || undefined;
}

function addHits(into: AskHit[], seen: Set<string>, rows: AskHit[]) {
  for (const row of rows) {
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push(row);
    if (into.length >= LIMIT) return;
  }
}

export function retrieveAsk(question: string): AskHit[] {
  const q = question.trim();
  if (!q) return [];
  const hits: AskHit[] = [];
  const seen = new Set<string>();
  const campus = campusIn(q);
  const organization = organizationIn(q);
  const standing: PeopleQuery["standing"] = /\bjuniors?\b/i.test(q)
    ? "junior"
    : /\bseniors?\b/i.test(q)
      ? "senior"
      : /\bsophomores?\b/i.test(q)
        ? "sophomore"
        : /\bfreshm(?:an|en)\b/i.test(q)
          ? "freshman"
          : undefined;
  const enrollment: PeopleQuery["enrollment"] = /\brecent grads?\b/i.test(q)
    ? "recent_grad"
    : /\balumni\b/i.test(q)
      ? "older_alumni"
      : /\bcurrent students?\b/i.test(q)
        ? "current_student"
        : undefined;
  const sector = /\bhealthcare\b|\bhealthtech\b|\bbiotech\b|\bmedtech\b/i.test(q)
    ? "healthcare"
    : /\bartificial intelligence\b|\bai\b/i.test(q)
      ? "AI"
      : /\bfintech\b/i.test(q)
        ? "fintech"
        : undefined;
  const city = /\bnyc\b|\bnew york\b/i.test(q) ? "NYC" : /\bsan francisco\b|\bsf\b/i.test(q) ? "San Francisco" : undefined;
  const investor = /\ba16z speedrun\b/i.test(q)
    ? "a16z speedrun"
    : /\ba16z\b|\bandreessen\b/i.test(q)
      ? "a16z"
      : /\by combinator\b|\byc\b/i.test(q)
        ? "Y Combinator"
        : undefined;
  const founderOnly = /\bfounders?\b/i.test(q);
  const building = /\bbuilding\b/i.test(q);
  const clubRank = /\bclubs?\b/i.test(q) && /\b(top|most|tier)\b/i.test(q);

  if (clubRank) {
    addHits(hits, seen, searchOrganizations({ typeIncludes: "club", limit: 15, minFounders: 1 }).matches);
    return hits.slice(0, LIMIT);
  }

  const personFiltered = Boolean(campus || standing || enrollment || sector || city || investor || organization || founderOnly || building);
  if (personFiltered) {
    addHits(
      hits,
      seen,
      searchPeople({
        campus,
        standing,
        enrollment,
        sector,
        city,
        investor,
        organization,
        founderOnly: founderOnly || undefined,
        building: building || undefined,
        limit: 20,
      }).matches
    );
  }

  const personOnly = Boolean(standing || enrollment || organization);
  if (!personOnly && (sector || city || investor || campus)) {
    addHits(hits, seen, searchStartups({ campus, sector, city, investor, limit: 15 }).matches);
  }
  if (investor) addHits(hits, seen, searchInvestors({ name: investor, limit: 3 }).matches);

  if (!personFiltered && !clubRank) {
    const tokens = q
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !STOP.has(token));
    for (const token of tokens.slice(0, 3)) {
      if (hits.length >= LIMIT) break;
      addHits(hits, seen, searchPeople({ name: token, limit: 5 }).matches);
      addHits(hits, seen, searchStartups({ name: token, limit: 5 }).matches);
    }
  }
  return hits.slice(0, LIMIT);
}
