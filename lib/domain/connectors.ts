// People and clubs ranked by how many verified, tiered founders they touch.
// Clubs also get a per-member rate. Same-school overlap is not a connection.
// A shared club counts only while the club stays small enough to be a real link.

import { shortCampusLabel } from "./campuses";
import { loadIntroGraph, type IntroGraph, type IntroOrg } from "./intro-graph";

const CLUB_CAP = 80;
const COMPANY_CAP = 30;
const MIN_CLUB_MEMBERS = 5;

export interface ConnectorPerson {
  id: string;
  name: string;
  campusId: string | null;
  campusName: string | null;
  strongFounders: number;
  href: string;
}

export interface ConnectorClub {
  id: string;
  name: string;
  campusId: string | null;
  campusName: string | null;
  strongFounders: number;
  members: number;
  perMember: number;
  href: string | null;
}

export interface ConnectorLists {
  people: ConnectorPerson[];
  clubs: ConnectorClub[];
  campuses: { id: string; name: string }[];
}

function campusOf(graph: IntroGraph, ids: string[]): { id: string | null; name: string | null } {
  const id = ids[0] ?? null;
  if (!id) return { id: null, name: null };
  return { id, name: shortCampusLabel(id, graph.orgs.get(id)?.name) };
}

function clubReachable(org: IntroOrg): boolean {
  if (org.kind === "campus") return false;
  if (org.kind === "company") return org.members > 0 && org.members <= COMPANY_CAP;
  return org.members > 0 && org.members <= CLUB_CAP;
}

export function scoreConnectors(graph: IntroGraph): { people: ConnectorPerson[]; clubs: ConnectorClub[] } {
  const people: ConnectorPerson[] = [];
  for (const person of graph.people.values()) {
    const linked = new Set<string>();
    for (const membership of graph.orgsByPerson.get(person.id) ?? []) {
      const org = graph.orgs.get(membership.orgId);
      if (!org || !clubReachable(org)) continue;
      for (const member of graph.peopleByOrg.get(org.id) ?? []) {
        if (member.personId !== person.id && graph.strongFounders.has(member.personId)) linked.add(member.personId);
      }
    }
    for (const cofounder of graph.cofounders.get(person.id) ?? []) {
      if (graph.strongFounders.has(cofounder.personId)) linked.add(cofounder.personId);
    }
    const alum = graph.alumni.find((row) => row.personId === person.id);
    if (alum?.investorId) {
      const backed = new Set((graph.portfolioByInvestor?.get(alum.investorId) ?? []).map((item) => item.projectId));
      for (const founderId of graph.strongFounders) {
        if (founderId === person.id) continue;
        const startups = graph.startupsByPerson.get(founderId) ?? [];
        if (startups.some((projectId) => backed.has(projectId))) linked.add(founderId);
      }
    }
    if (linked.size === 0) continue;
    const campus = campusOf(graph, person.campuses);
    people.push({
      id: person.id,
      name: person.name,
      campusId: campus.id,
      campusName: campus.name,
      strongFounders: linked.size,
      href: `/founder/discover?founder=${encodeURIComponent(person.id)}&enroll=current_student,recent_grad,older_alumni`,
    });
  }
  people.sort((a, b) => b.strongFounders - a.strongFounders || a.name.localeCompare(b.name));

  const clubs: ConnectorClub[] = [];
  for (const org of graph.orgs.values()) {
    if (org.kind !== "program" || org.members < MIN_CLUB_MEMBERS) continue;
    const strong = new Set<string>();
    for (const member of graph.peopleByOrg.get(org.id) ?? []) {
      if (graph.strongFounders.has(member.personId)) strong.add(member.personId);
    }
    if (strong.size === 0) continue;
    const campus = campusOf(graph, org.campusId ? [org.campusId] : []);
    clubs.push({
      id: org.id,
      name: org.name,
      campusId: campus.id,
      campusName: campus.name,
      strongFounders: strong.size,
      members: org.members,
      perMember: strong.size / org.members,
      href: org.sourceUrl,
    });
  }
  clubs.sort((a, b) => b.perMember - a.perMember || b.strongFounders - a.strongFounders || a.name.localeCompare(b.name));
  return { people, clubs };
}

export function topConnectors(universityId?: string | null): ConnectorLists {
  const scored = scoreConnectors(loadIntroGraph());
  const campusIds = new Map<string, string>();
  for (const row of [...scored.people, ...scored.clubs]) {
    if (row.campusId && row.campusName) campusIds.set(row.campusId, row.campusName);
  }
  const match = (campusId: string | null) => !universityId || campusId === universityId;
  return {
    people: scored.people.filter((row) => match(row.campusId)).slice(0, 10),
    clubs: scored.clubs.filter((row) => match(row.campusId)).slice(0, 10),
    campuses: [...campusIds.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
