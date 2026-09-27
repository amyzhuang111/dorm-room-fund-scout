// Shortest warm-intro paths from a DRF alum to a founder.
// Hop length comes first. Among paths of the same length, a small club or
// cohort outranks a larger program, which outranks the same school alone.
// Co-founder and prior-company links are included. Nothing is inferred.

import { yearsLabel, type DrfAlumRow } from "./drf-alumni";
import { loadIntroGraph, type IntroGraph, type IntroOrg } from "./intro-graph";

export interface PathEvidence {
  label: string;
  url: string;
}

export interface WarmPathView {
  alumId: string;
  founderId: string;
  founderName: string;
  hops: number;
  strength: number;
  strengthLabel: string;
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

const SMALL_CLUB = 40;
const THREE_HOP_CAP = 80;

export function orgScore(org: IntroOrg): { strength: number; label: string } {
  if (org.kind === "company") return { strength: 70, label: "Prior company" };
  if (org.kind === "campus") return { strength: 20, label: "Same school" };
  if (org.cohort) return { strength: 85, label: "Cohort" };
  if (org.members <= SMALL_CLUB) return { strength: 85, label: "Small club" };
  return { strength: 50, label: "Program" };
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
  strengthLabel: string;
  via: string;
  evidence: PathEvidence[];
}

function better(next: Candidate, prev: Candidate): boolean {
  if (next.hops !== prev.hops) return next.hops < prev.hops;
  if (next.strength !== prev.strength) return next.strength > prev.strength;
  return next.via.length < prev.via.length;
}

export function rankWarmPaths(graph: IntroGraph, founderId: string, limit = 5): WarmPathView[] {
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
      strengthLabel: "Co-founder",
      via: "co-founder",
      evidence: link.sourceUrl ? [{ label: "Co-founder", url: link.sourceUrl }] : [],
    });
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
      consider({
        alum,
        hops: 2,
        strength: score.strength,
        strengthLabel: score.label,
        via: viaLabel(org),
        evidence: extra,
      });
    }
  }

  const founderCofounders = graph.cofounders.get(founderId) ?? [];
  for (const cofounder of founderCofounders) {
    if (alumByPerson.has(cofounder.personId)) continue;
    for (const membership of graph.orgsByPerson.get(cofounder.personId) ?? []) {
      const org = graph.orgs.get(membership.orgId);
      if (!org || org.kind === "campus" || org.members > THREE_HOP_CAP) continue;
      const score = orgScore(org);
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
          strengthLabel: score.label,
          via: middle ? `${viaLabel(org)} · co-founder ${middle}` : viaLabel(org),
          evidence: extra,
        });
      }
    }
  }

  for (const membership of founderOrgs) {
    const org = graph.orgs.get(membership.orgId);
    if (!org || org.kind === "campus" || org.members > THREE_HOP_CAP) continue;
    const score = orgScore(org);
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
          strength: Math.max(score.strength, 100),
          strengthLabel: "Co-founder",
          via: middle ? `${viaLabel(org)} · co-founder ${middle}` : viaLabel(org),
          evidence: extra,
        });
      }
    }
  }

  return [...best.values()]
    .sort((a, b) => a.hops - b.hops || b.strength - a.strength || a.alum.name.localeCompare(b.alum.name))
    .slice(0, limit)
    .map((candidate) => ({
      alumId: candidate.alum.personId,
      founderId,
      founderName: founder.name,
      hops: candidate.hops,
      strength: candidate.strength,
      strengthLabel: candidate.strengthLabel,
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
  paths.sort((a, b) => a.hops - b.hops || b.strength - a.strength || a.sentence.localeCompare(b.sentence));
  return { alum: alum ? alumCard(alum) : null, paths: paths.slice(0, 5) };
}

export function drfNeighborhoodIds(): string[] {
  const graph = loadIntroGraph();
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const left = adj.get(a) ?? [];
    left.push(b);
    adj.set(a, left);
    const right = adj.get(b) ?? [];
    right.push(a);
    adj.set(b, right);
  };
  for (const [personId, orgs] of graph.orgsByPerson) {
    for (const org of orgs) link(personId, org.orgId);
  }
  for (const [personId, others] of graph.cofounders) {
    for (const other of others) {
      if (personId < other.personId) link(personId, other.personId);
    }
  }
  for (const alum of graph.alumni) {
    if (alum.investorId) link(alum.personId, alum.investorId);
  }

  const keep = new Set<string>();
  const seen = new Set<string>();
  const queue: { id: string; depth: number }[] = [];
  for (const alum of graph.alumni) {
    if (seen.has(alum.personId)) continue;
    seen.add(alum.personId);
    queue.push({ id: alum.personId, depth: 0 });
  }
  while (queue.length) {
    const item = queue.shift()!;
    keep.add(item.id);
    if (item.depth >= 2) continue;
    for (const next of adj.get(item.id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, depth: item.depth + 1 });
    }
  }
  for (const id of [...keep]) {
    for (const startup of graph.startupsByPerson.get(id) ?? []) keep.add(startup);
  }
  return [...keep];
}
