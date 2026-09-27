// Warm-intro paths from a DRF alum to a founder.
// Strong beats medium, and medium beats weak. Same school alone is weak and
// stays off the default list and off the map filter. Nothing is inferred
// beyond a four-year window ending at a stored graduation year.

import { yearsLabel, type DrfAlumRow } from "./drf-alumni";
import { loadIntroGraph, type IntroGraph, type IntroOrg } from "./intro-graph";

export interface PathEvidence {
  label: string;
  url: string;
}

export type PathTier = "strong" | "medium" | "weak";

export interface WarmPathView {
  alumId: string;
  founderId: string;
  founderName: string;
  hops: number;
  strength: number;
  strengthLabel: "Strong" | "Medium" | "Weak";
  via: string;
  sentence: string;
  evidence: PathEvidence[];
}

export interface AlumCard {
  personId: string;
  name: string;
  team: string | null;
  school: string | null;
  program: string | null;
  years: string | null;
  firm: string | null;
  role: string | null;
  confidence: "confirmed" | "likely";
  sourceUrl: string;
  firmSourceUrl: string | null;
  excerpt: string;
}

export interface WarmIntroView {
  alum: AlumCard | null;
  paths: WarmPathView[];
}

const TIGHT_CAP = 80;

export function orgScore(org: IntroOrg): { strength: number; label: string; tier: PathTier } {
  if (org.kind === "company") {
    if (org.members > 0 && org.members <= TIGHT_CAP) return { strength: 90, label: "Same startup", tier: "strong" };
    return { strength: 10, label: "Large company", tier: "weak" };
  }
  if (org.kind === "campus") return { strength: 10, label: "Same school", tier: "weak" };
  if (org.members > 0 && org.members <= TIGHT_CAP) {
    return org.cohort
      ? { strength: 90, label: "Cohort", tier: "strong" }
      : { strength: 90, label: "Small club", tier: "strong" };
  }
  return { strength: 10, label: "Program", tier: "weak" };
}

export function viaLabel(org: IntroOrg): string {
  const stripped = org.name.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (org.kind === "campus") return org.campusShort || stripped;
  if (org.kind === "company") return stripped.length > 42 ? `${stripped.slice(0, 40).trim()}…` : stripped;
  if (/^m&t\b/i.test(stripped) && org.campusShort) return `${org.campusShort} M&T`;
  if (org.campusShort && stripped.length <= 22 && !stripped.toLowerCase().includes(org.campusShort.toLowerCase())) {
    return `${org.campusShort} ${stripped}`;
  }
  return stripped.length > 42 ? `${stripped.slice(0, 40).trim()}…` : stripped;
}

function sentence(alum: DrfAlumRow, via: string, founderName: string): string {
  const at = alum.currentFirm ? ` at ${alum.currentFirm}` : "";
  return `Path: ${alum.name}${at}, via ${via}, to ${founderName}`;
}

function evidenceFor(alum: DrfAlumRow, extra: PathEvidence[]): PathEvidence[] {
  const items: PathEvidence[] = [{ label: "DRF record", url: alum.sourceUrl }];
  if (alum.firmSourceUrl && alum.firmSourceUrl !== alum.sourceUrl) items.push({ label: "Current role", url: alum.firmSourceUrl });
  for (const item of extra) {
    if (!item.url || items.some((existing) => existing.url === item.url)) continue;
    items.push(item);
  }
  return items;
}

interface Candidate {
  alum: DrfAlumRow;
  hops: number;
  strength: number;
  tier: PathTier;
  via: string;
  evidence: PathEvidence[];
}

function tierRank(tier: PathTier): number {
  if (tier === "strong") return 3;
  if (tier === "medium") return 2;
  return 1;
}

function better(next: Candidate, prev: Candidate): boolean {
  if (tierRank(next.tier) !== tierRank(prev.tier)) return tierRank(next.tier) > tierRank(prev.tier);
  if (next.hops !== prev.hops) return next.hops < prev.hops;
  if (next.strength !== prev.strength) return next.strength > prev.strength;
  return next.via.length < prev.via.length;
}

function yearSpan(alum: DrfAlumRow): { start: number; end: number } | null {
  const start = alum.yearStart ?? alum.yearEnd ?? alum.classYear;
  const end = alum.yearEnd ?? alum.yearStart ?? alum.classYear;
  if (start == null || end == null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function schoolYearsOverlap(graph: IntroGraph, leftId: string, rightId: string, universityId?: string): boolean {
  const left = graph.schoolYears?.get(leftId) ?? [];
  const right = graph.schoolYears?.get(rightId) ?? [];
  for (const a of left) {
    for (const b of right) {
      if (a.universityId !== b.universityId) continue;
      if (universityId && a.universityId !== universityId) continue;
      if (a.start <= b.end && b.start <= a.end) return true;
    }
  }
  return false;
}

function drfTeamOverlaps(left: DrfAlumRow, right: DrfAlumRow): boolean {
  if (!left.drfTeam || left.drfTeam !== right.drfTeam) return false;
  const a = yearSpan(left);
  const b = yearSpan(right);
  if (!a || !b) return false;
  return a.start <= b.end && b.start <= a.end;
}

export function rankWarmPaths(graph: IntroGraph, founderId: string, limit = 5, options?: { includeWeak?: boolean }): WarmPathView[] {
  const founder = graph.people.get(founderId);
  if (!founder) return [];
  const alumByPerson = new Map(graph.alumni.map((alum) => [alum.personId, alum]));
  const founderOrgs = graph.orgsByPerson.get(founderId) ?? [];
  const best = new Map<string, Candidate>();

  const consider = (candidate: Candidate) => {
    if (candidate.alum.personId === founderId) return;
    const prev = best.get(candidate.alum.personId);
    if (!prev || better(candidate, prev)) best.set(candidate.alum.personId, candidate);
  };

  for (const link of graph.cofounders.get(founderId) ?? []) {
    const alum = alumByPerson.get(link.personId);
    if (!alum) continue;
    consider({
      alum,
      hops: 1,
      strength: 100,
      tier: "strong",
      via: "co-founder",
      evidence: link.sourceUrl ? [{ label: "Co-founder", url: link.sourceUrl }] : [],
    });
  }

  const founderAlum = alumByPerson.get(founderId);
  for (const alum of graph.alumni) {
    if (alum.personId === founderId) continue;
    if (founderAlum && drfTeamOverlaps(alum, founderAlum)) {
      consider({
        alum,
        hops: 1,
        strength: 95,
        tier: "strong",
        via: `${alum.drfTeam} DRF`,
        evidence: [],
      });
    }
    const backed = alum.investorId ? graph.portfolioByInvestor?.get(alum.investorId) ?? [] : [];
    const startups = new Set(graph.startupsByPerson.get(founderId) ?? []);
    const hit = backed.find((item) => startups.has(item.projectId));
    if (hit && alum.currentFirm) {
      consider({
        alum,
        hops: 2,
        strength: 95,
        tier: "strong",
        via: `${alum.currentFirm} invested`,
        evidence: [{ label: alum.currentFirm, url: hit.sourceUrl }],
      });
    }
  }

  for (const membership of founderOrgs) {
    const org = graph.orgs.get(membership.orgId);
    if (!org) continue;
    const score = orgScore(org);
    for (const member of graph.peopleByOrg.get(org.id) ?? []) {
      if (member.personId === founderId) continue;
      const alum = alumByPerson.get(member.personId);
      if (!alum) continue;
      const extra: PathEvidence[] = [];
      if (membership.sourceUrl) extra.push({ label: viaLabel(org), url: membership.sourceUrl });
      if (member.sourceUrl) extra.push({ label: viaLabel(org), url: member.sourceUrl });
      else if (org.sourceUrl) extra.push({ label: viaLabel(org), url: org.sourceUrl });
      const overlappingSchool = org.kind === "campus" && schoolYearsOverlap(graph, alum.personId, founderId, org.id);
      const tier: PathTier = org.kind === "campus" ? (overlappingSchool ? "medium" : "weak") : score.tier;
      const via = org.kind === "campus" && overlappingSchool ? `${viaLabel(org)}, overlapping years` : viaLabel(org);
      consider({
        alum,
        hops: 2,
        strength: org.kind === "campus" ? (overlappingSchool ? 50 : 10) : score.strength,
        tier,
        via,
        evidence: extra,
      });
    }
  }

  const founderCofounders = graph.cofounders.get(founderId) ?? [];
  for (const cofounder of founderCofounders) {
    if (alumByPerson.has(cofounder.personId)) continue;
    for (const membership of graph.orgsByPerson.get(cofounder.personId) ?? []) {
      const org = graph.orgs.get(membership.orgId);
      if (!org || org.kind === "campus" || org.members > TIGHT_CAP) continue;
      const score = orgScore(org);
      if (score.tier === "weak") continue;
      for (const member of graph.peopleByOrg.get(org.id) ?? []) {
        const alum = alumByPerson.get(member.personId);
        if (!alum || alum.personId === founderId) continue;
        const extra: PathEvidence[] = [];
        if (cofounder.sourceUrl) extra.push({ label: "Co-founder", url: cofounder.sourceUrl });
        if (member.sourceUrl) extra.push({ label: viaLabel(org), url: member.sourceUrl });
        else if (org.sourceUrl) extra.push({ label: viaLabel(org), url: org.sourceUrl });
        const middle = graph.people.get(cofounder.personId)?.name;
        consider({
          alum,
          hops: 3,
          strength: score.strength,
          tier: score.tier,
          via: middle ? `${viaLabel(org)} · co-founder ${middle}` : viaLabel(org),
          evidence: extra,
        });
      }
    }
  }

  for (const membership of founderOrgs) {
    const org = graph.orgs.get(membership.orgId);
    if (!org || org.kind === "campus" || org.members > TIGHT_CAP) continue;
    const score = orgScore(org);
    if (score.tier === "weak") continue;
    for (const member of graph.peopleByOrg.get(org.id) ?? []) {
      if (member.personId === founderId || alumByPerson.has(member.personId)) continue;
      for (const cofounder of graph.cofounders.get(member.personId) ?? []) {
        const alum = alumByPerson.get(cofounder.personId);
        if (!alum || alum.personId === founderId) continue;
        const middle = graph.people.get(member.personId)?.name;
        const extra: PathEvidence[] = [];
        if (membership.sourceUrl) extra.push({ label: viaLabel(org), url: membership.sourceUrl });
        if (cofounder.sourceUrl) extra.push({ label: "Co-founder", url: cofounder.sourceUrl });
        else if (org.sourceUrl) extra.push({ label: viaLabel(org), url: org.sourceUrl });
        consider({
          alum,
          hops: 3,
          strength: 100,
          tier: "strong",
          via: middle ? `${viaLabel(org)} · co-founder ${middle}` : viaLabel(org),
          evidence: extra,
        });
      }
    }
  }

  const minTier = options?.includeWeak ? 1 : 2;
  return [...best.values()]
    .filter((candidate) => tierRank(candidate.tier) >= minTier)
    .sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || a.hops - b.hops || b.strength - a.strength || a.alum.name.localeCompare(b.alum.name))
    .slice(0, limit)
    .map((candidate) => ({
      alumId: candidate.alum.personId,
      founderId,
      founderName: founder.name,
      hops: candidate.hops,
      strength: candidate.strength,
      strengthLabel: candidate.tier === "strong" ? "Strong" : candidate.tier === "medium" ? "Medium" : "Weak",
      via: candidate.via,
      sentence: sentence(candidate.alum, candidate.via, founder.name),
      evidence: evidenceFor(candidate.alum, candidate.evidence),
    }));
}

function alumCard(alum: DrfAlumRow): AlumCard {
  return {
    personId: alum.personId,
    name: alum.name,
    team: alum.drfTeam,
    school: alum.schoolLabel,
    program: alum.programLabel,
    years: yearsLabel(alum),
    firm: alum.currentFirm,
    role: alum.currentRole,
    confidence: alum.confidence,
    sourceUrl: alum.sourceUrl,
    firmSourceUrl: alum.firmSourceUrl,
    excerpt: alum.excerpt,
  };
}

function founderIdsForProject(graph: IntroGraph, projectId: string): string[] {
  const ids: string[] = [];
  for (const [personId, startups] of graph.startupsByPerson) {
    if (startups.includes(projectId)) ids.push(personId);
  }
  return ids;
}

export function warmIntroForId(id: string): WarmIntroView {
  const graph = loadIntroGraph();
  const alum = graph.alumni.find((row) => row.personId === id) ?? null;
  const founderIds = graph.people.has(id) ? [id] : founderIdsForProject(graph, id);
  const paths: WarmPathView[] = [];
  const seen = new Set<string>();
  for (const founderId of founderIds) {
    for (const path of rankWarmPaths(graph, founderId, 8)) {
      const key = `${path.alumId}|${path.founderId}|${path.via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(path);
    }
  }
  paths.sort((a, b) => {
    const rank = (label: WarmPathView["strengthLabel"]) => (label === "Strong" ? 3 : label === "Medium" ? 2 : 1);
    return rank(b.strengthLabel) - rank(a.strengthLabel) || a.hops - b.hops || b.strength - a.strength || a.sentence.localeCompare(b.sentence);
  });
  return { alum: alum ? alumCard(alum) : null, paths: paths.slice(0, 5) };
}

function linkUndirected(adj: Map<string, string[]>, a: string, b: string) {
  if (a === b) return;
  const left = adj.get(a) ?? [];
  if (!left.includes(b)) left.push(b);
  adj.set(a, left);
  const right = adj.get(b) ?? [];
  if (!right.includes(a)) right.push(a);
  adj.set(b, right);
}

export function neighborhoodFromGraph(graph: IntroGraph): string[] {
  const strong = new Map<string, string[]>();
  for (const [personId, memberships] of graph.orgsByPerson) {
    for (const membership of memberships) {
      const org = graph.orgs.get(membership.orgId);
      if (!org || org.kind === "campus" || org.members <= 0 || org.members > TIGHT_CAP) continue;
      linkUndirected(strong, personId, org.id);
    }
  }
  for (const [personId, others] of graph.cofounders) {
    for (const other of others) {
      if (personId < other.personId) linkUndirected(strong, personId, other.personId);
    }
  }
  for (let i = 0; i < graph.alumni.length; i++) {
    for (let j = i + 1; j < graph.alumni.length; j++) {
      if (drfTeamOverlaps(graph.alumni[i], graph.alumni[j])) {
        linkUndirected(strong, graph.alumni[i].personId, graph.alumni[j].personId);
      }
    }
  }
  for (const alum of graph.alumni) {
    if (!alum.investorId) continue;
    linkUndirected(strong, alum.personId, alum.investorId);
    for (const backed of graph.portfolioByInvestor?.get(alum.investorId) ?? []) {
      linkUndirected(strong, alum.investorId, backed.projectId);
      for (const [personId, startups] of graph.startupsByPerson) {
        if (startups.includes(backed.projectId)) linkUndirected(strong, alum.investorId, personId);
      }
    }
  }

  const medium = new Map<string, string[]>();
  for (const alum of graph.alumni) {
    const campuses = graph.people.get(alum.personId)?.campuses ?? [];
    for (const campusId of campuses) {
      for (const member of graph.peopleByOrg.get(campusId) ?? []) {
        if (member.personId === alum.personId) continue;
        if (!schoolYearsOverlap(graph, alum.personId, member.personId, campusId)) continue;
        const list = medium.get(alum.personId) ?? [];
        if (!list.includes(member.personId)) list.push(member.personId);
        medium.set(alum.personId, list);
      }
    }
  }

  const keep = new Set<string>();
  const seen = new Set<string>();
  const queue: { id: string; depth: number; allowMedium: boolean }[] = [];
  for (const alum of graph.alumni) {
    if (seen.has(alum.personId)) continue;
    seen.add(alum.personId);
    queue.push({ id: alum.personId, depth: 0, allowMedium: true });
  }
  while (queue.length) {
    const item = queue.shift()!;
    keep.add(item.id);
    if (item.depth >= 2) continue;
    for (const next of strong.get(item.id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, depth: item.depth + 1, allowMedium: false });
    }
    if (!item.allowMedium) continue;
    for (const next of medium.get(item.id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, depth: item.depth + 1, allowMedium: false });
    }
  }
  return [...keep];
}

export function drfNeighborhoodIds(): string[] {
  return neighborhoodFromGraph(loadIntroGraph());
}
