/**
 * Local vector layout for campuses and hubs.
 * Feature bags come from programs, startup sectors, investors, and club types
 * already on the map. Cosine similarity adds springs so similar nodes sit
 * closer even when no edge joins them. The full person graph is never paired.
 */

export interface SimilarityNode {
  id: string;
  type: string;
  label?: string;
  sector?: string | null;
  /** National program, organization, or investor that is free to leave its campus disc. */
  hub?: boolean;
}

export interface SimilarityEdge {
  source: string;
  target: string;
  type: string;
}

export interface SimilarityFacts {
  nodes: SimilarityNode[];
  edges: SimilarityEdge[];
  primaryCampus: Map<string, string>;
}

export interface SimilarityPoint {
  id: string;
  x: number;
  y: number;
  /** Collision radius in layout units. */
  r: number;
  pinned?: boolean;
}

export interface SimilarityLink {
  a: string;
  b: string;
  sim: number;
}

/** Coarse public kind of a club or program, from its name. */
export function clubTypeKey(label: string): string {
  const text = label.toLowerCase();
  if (/hackathon|\bhacks\b|hack\s*the/.test(text)) return "hackathon";
  if (/robot|aerial|racing|formula|hyperloop|solar car/.test(text)) return "hardware";
  if (/\blab\b|research/.test(text)) return "lab";
  if (/consult/.test(text)) return "consulting";
  if (/venture|capital|\bvc\b|\bfund\b/.test(text)) return "venture";
  if (/accel|incubator|fellowship|launchpad|skydeck|startx|combinator/.test(text)) return "accelerator";
  if (/entrepreneur|startup|founder|builder/.test(text)) return "entrepreneurship";
  if (/invest/.test(text)) return "investor";
  return "community";
}

/** L2-normalized bag. Cosine similarity is the dot product of two of these. */
export function similarityVectors(facts: SimilarityFacts): Map<string, Map<string, number>> {
  const nodes = new Map(facts.nodes.map((node) => [node.id, node]));
  const include = new Set<string>();
  for (const node of facts.nodes) {
    if (node.type === "campus") include.add(node.id);
    else if (node.hub && (node.type === "program" || node.type === "organization" || node.type === "investor")) include.add(node.id);
  }

  const programsOfPerson = new Map<string, string[]>();
  const foundersOfStartup = new Map<string, string[]>();
  const investorsOfStartup = new Map<string, string[]>();
  for (const edge of facts.edges) {
    if (edge.type === "member_of") {
      const list = programsOfPerson.get(edge.source) ?? [];
      list.push(edge.target);
      programsOfPerson.set(edge.source, list);
    } else if (edge.type === "founded") {
      const list = foundersOfStartup.get(edge.target) ?? [];
      list.push(edge.source);
      foundersOfStartup.set(edge.target, list);
    } else if (edge.type === "invested_in") {
      const list = investorsOfStartup.get(edge.target) ?? [];
      list.push(edge.source);
      investorsOfStartup.set(edge.target, list);
    }
  }
  const startupsOfFounder = new Map<string, string[]>();
  for (const [startup, founders] of foundersOfStartup) {
    for (const founder of founders) {
      const list = startupsOfFounder.get(founder) ?? [];
      list.push(startup);
      startupsOfFounder.set(founder, list);
    }
  }

  const programs = new Map<string, Map<string, number>>();
  const sectors = new Map<string, Map<string, number>>();
  const investors = new Map<string, Map<string, number>>();
  const clubs = new Map<string, Map<string, number>>();
  const bump = (table: Map<string, Map<string, number>>, id: string, key: string, amount = 1) => {
    if (!include.has(id) || !key || amount <= 0) return;
    const bag = table.get(id) ?? new Map<string, number>();
    bag.set(key, (bag.get(key) ?? 0) + amount);
    table.set(id, bag);
  };

  for (const node of facts.nodes) {
    if (node.type === "person") {
      const campus = facts.primaryCampus.get(node.id);
      if (!campus) continue;
      for (const programId of programsOfPerson.get(node.id) ?? []) {
        bump(programs, campus, programId);
        const program = nodes.get(programId);
        bump(clubs, campus, clubTypeKey(program?.label ?? program?.type ?? ""));
      }
    } else if (node.type === "startup" && node.sector) {
      const campus = facts.primaryCampus.get(node.id);
      if (campus) bump(sectors, campus, node.sector);
      for (const founder of foundersOfStartup.get(node.id) ?? []) {
        const founderCampus = facts.primaryCampus.get(founder);
        if (founderCampus && founderCampus !== campus) bump(sectors, founderCampus, node.sector, 0.5);
      }
      for (const investorId of investorsOfStartup.get(node.id) ?? []) {
        if (campus) bump(investors, campus, investorId);
        bump(sectors, investorId, node.sector);
        bump(investors, investorId, investorId);
      }
    } else if ((node.type === "program" || node.type === "organization") && node.hub) {
      bump(programs, node.id, node.id, 4);
      bump(clubs, node.id, clubTypeKey(node.label ?? ""), 4);
    } else if (node.type === "investor" && node.hub) {
      bump(investors, node.id, node.id, 4);
      bump(clubs, node.id, "investor", 4);
    }
  }

  for (const [person, programIds] of programsOfPerson) {
    const startups = startupsOfFounder.get(person) ?? [];
    if (!startups.length) continue;
    for (const programId of programIds) {
      if (!include.has(programId)) continue;
      for (const startupId of startups) {
        const startup = nodes.get(startupId);
        if (startup?.sector) bump(sectors, programId, startup.sector);
        for (const investorId of investorsOfStartup.get(startupId) ?? []) bump(investors, programId, investorId);
      }
    }
  }

  const vectors = new Map<string, Map<string, number>>();
  for (const id of include) {
    const bag = new Map<string, number>();
    writeProportion("p:", programs.get(id), bag);
    writeProportion("s:", sectors.get(id), bag);
    writeProportion("i:", investors.get(id), bag);
    writeProportion("c:", clubs.get(id), bag);
    const vector = l2normalize(bag);
    if (vector.size) vectors.set(id, vector);
  }
  return vectors;
}

/** Dot product of two L2-normalized bags. An empty bag is orthogonal to everything. */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [key, value] of small) {
    const other = large.get(key);
    if (other) dot += value * other;
  }
  if (!Number.isFinite(dot)) return 0;
  return Math.max(0, Math.min(1, dot));
}

/**
 * Undirected k-nearest links. A pair is kept when either side lists the other
 * and the cosine clears `minSim`, so a weak match does not drag a node.
 */
export function nearestSimilar(ids: string[], vectors: Map<string, Map<string, number>>, k: number, minSim: number): SimilarityLink[] {
  const neighbors = new Map<string, { id: string; sim: number }[]>();
  for (const id of ids) neighbors.set(id, []);
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    const left = vectors.get(a);
    if (!left?.size) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      const right = vectors.get(b);
      if (!right?.size) continue;
      const sim = cosineSimilarity(left, right);
      if (sim < minSim) continue;
      pushNearest(neighbors.get(a)!, b, sim, k);
      pushNearest(neighbors.get(b)!, a, sim, k);
    }
  }
  const seen = new Set<string>();
  const links: SimilarityLink[] = [];
  for (const [id, list] of neighbors) {
    for (const neighbor of list) {
      const key = id < neighbor.id ? `${id}|${neighbor.id}` : `${neighbor.id}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a: id, b: neighbor.id, sim: neighbor.sim });
    }
  }
  return links;
}

/**
 * Drop springs that join two groups. Callers use this so a campus can only
 * be pulled toward campuses in its own region.
 */
export function linksWithinGroups(links: SimilarityLink[], groupOf: (id: string) => string | undefined): SimilarityLink[] {
  return links.filter((link) => {
    const left = groupOf(link.a);
    const right = groupOf(link.b);
    return left != null && left === right;
  });
}

/** Mean of the member vectors, L2-normalized again. Empty when none of them have a bag. */
export function groupVector(ids: string[], vectors: Map<string, Map<string, number>>): Map<string, number> {
  const sum = new Map<string, number>();
  let count = 0;
  for (const id of ids) {
    const bag = vectors.get(id);
    if (!bag?.size) continue;
    count += 1;
    for (const [key, value] of bag) sum.set(key, (sum.get(key) ?? 0) + value);
  }
  if (!count) return new Map();
  for (const [key, value] of sum) sum.set(key, value / count);
  let norm = 0;
  for (const value of sum.values()) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return new Map();
  const out = new Map<string, number>();
  for (const [key, value] of sum) out.set(key, value / norm);
  return out;
}

export interface RegionBody {
  id: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Slide whole regions. Centers never come closer than `rA + rB + gap`.
 * A higher cosine shortens the preferred gap; a low cosine leaves a wider one.
 * The anchor holds each region near the compass seed it started from.
 */
export function relaxRegionBodies(
  bodies: RegionBody[],
  links: SimilarityLink[],
  options?: { iterations?: number; anchor?: number; spring?: number; gap?: number; spread?: number },
): void {
  const iterations = options?.iterations ?? 24;
  const anchor = options?.anchor ?? 0.45;
  const spring = options?.spring ?? 0.35;
  const gap = options?.gap ?? 14;
  const spread = options?.spread ?? 22;
  const start = new Map(bodies.map((body) => [body.id, { x: body.x, y: body.y }]));
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const linked = new Set<string>();
  const pairs: { a: string; b: string; sim: number }[] = [];
  for (const link of links) {
    if (!byId.has(link.a) || !byId.has(link.b) || link.a === link.b) continue;
    const key = link.a < link.b ? `${link.a}|${link.b}` : `${link.b}|${link.a}`;
    if (linked.has(key)) continue;
    linked.add(key);
    pairs.push({ a: link.a, b: link.b, sim: Math.max(0, Math.min(1, link.sim)) });
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i].id;
      const b = bodies[j].id;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (linked.has(key)) continue;
      pairs.push({ a, b, sim: 0 });
    }
  }
  for (let iter = 0; iter < iterations; iter++) {
    const vx = new Map<string, number>();
    const vy = new Map<string, number>();
    const add = (id: string, x: number, y: number) => {
      vx.set(id, (vx.get(id) ?? 0) + x);
      vy.set(id, (vy.get(id) ?? 0) + y);
    };
    for (const body of bodies) {
      const origin = start.get(body.id);
      if (!origin) continue;
      add(body.id, (origin.x - body.x) * anchor, (origin.y - body.y) * anchor);
    }
    for (const pair of pairs) {
      const a = byId.get(pair.a)!;
      const b = byId.get(pair.b)!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-3) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const min = a.r + b.r + gap;
      const ideal = min + (1 - pair.sim) * spread;
      const mag = (spring * (dist - ideal)) / dist;
      add(a.id, dx * mag * 0.5, dy * mag * 0.5);
      add(b.id, -dx * mag * 0.5, -dy * mag * 0.5);
    }
    for (const body of bodies) {
      let x = vx.get(body.id) ?? 0;
      let y = vy.get(body.id) ?? 0;
      const step = Math.hypot(x, y);
      if (step > 12) {
        x = (x / step) * 12;
        y = (y / step) * 12;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      body.x += x;
      body.y += y;
    }
    separateRegionBodies(bodies, gap);
  }
  // The anchor pulls back toward the seed. Resolve the gap again so that pull cannot leave two colors overlapping.
  separateRegionBodies(bodies, gap);
}

function separateRegionBodies(bodies: RegionBody[], gap: number) {
  for (let sweep = 0; sweep < 32; sweep++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const min = a.r + b.r + gap;
        if (dist >= min - 0.05) continue;
        if (dist < 1e-3) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (min - dist) / 2;
        a.x -= (dx / dist) * push;
        a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push;
        b.y += (dy / dist) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * Extra springs on top of a seed layout. High cosine shortens the rest length.
 * `pinned` nodes stay put, so a later pass can slide hubs toward campuses
 * without pulling the campus discs apart again.
 */
export function relaxSimilarity(
  points: SimilarityPoint[],
  links: SimilarityLink[],
  options?: { iterations?: number; anchor?: number; spring?: number; gap?: number },
): void {
  const iterations = options?.iterations ?? 36;
  const anchor = options?.anchor ?? 0.28;
  const spring = options?.spring ?? 0.42;
  const gap = options?.gap ?? 36;
  const start = new Map(points.map((point) => [point.id, { x: point.x, y: point.y }]));
  const byId = new Map(points.map((point) => [point.id, point]));
  const live = links.filter((link) => byId.has(link.a) && byId.has(link.b) && link.a !== link.b && link.sim > 0);
  for (let iter = 0; iter < iterations; iter++) {
    const vx = new Map<string, number>();
    const vy = new Map<string, number>();
    const add = (id: string, x: number, y: number) => {
      vx.set(id, (vx.get(id) ?? 0) + x);
      vy.set(id, (vy.get(id) ?? 0) + y);
    };
    for (const point of points) {
      if (point.pinned) continue;
      const origin = start.get(point.id);
      if (!origin) continue;
      add(point.id, (origin.x - point.x) * anchor, (origin.y - point.y) * anchor);
    }
    for (const link of live) {
      const a = byId.get(link.a)!;
      const b = byId.get(link.b)!;
      if (a.pinned && b.pinned) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-3) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const ideal = a.r + b.r + 4 + (1 - Math.min(1, link.sim)) * gap;
      const delta = dist - ideal;
      if (delta <= 0) continue;
      const mag = (Math.min(link.sim, 1) * spring * delta) / dist;
      if (!a.pinned) add(a.id, dx * mag, dy * mag);
      if (!b.pinned) add(b.id, -dx * mag, -dy * mag);
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        if (a.pinned && b.pinned) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const min = a.r + b.r + 3.5;
        if (dist >= min) continue;
        if (dist < 1e-3) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = ((min - dist) / dist) * 0.65;
        const shareA = a.pinned ? 0 : b.pinned ? 1 : 0.5;
        const shareB = b.pinned ? 0 : a.pinned ? 1 : 0.5;
        add(a.id, -dx * push * shareA, -dy * push * shareA);
        add(b.id, dx * push * shareB, dy * push * shareB);
      }
    }
    for (const point of points) {
      if (point.pinned) continue;
      let x = vx.get(point.id) ?? 0;
      let y = vy.get(point.id) ?? 0;
      const step = Math.hypot(x, y);
      if (step > 9) {
        x = (x / step) * 9;
        y = (y / step) * 9;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      point.x += x;
      point.y += y;
    }
  }
}

function writeProportion(prefix: string, counts: Map<string, number> | undefined, into: Map<string, number>) {
  if (!counts?.size) return;
  let sum = 0;
  const weighted: [string, number][] = [];
  for (const [key, count] of counts) {
    if (count <= 0) continue;
    const weight = Math.log1p(count);
    weighted.push([key, weight]);
    sum += weight;
  }
  if (sum <= 0) return;
  for (const [key, weight] of weighted) into.set(`${prefix}${key}`, weight / sum);
}

function l2normalize(bag: Map<string, number>): Map<string, number> {
  let sum = 0;
  for (const value of bag.values()) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm < 1e-9) return new Map();
  const out = new Map<string, number>();
  for (const [key, value] of bag) out.set(key, value / norm);
  return out;
}

function pushNearest(list: { id: string; sim: number }[], id: string, sim: number, k: number) {
  list.push({ id, sim });
  list.sort((a, b) => b.sim - a.sim || a.id.localeCompare(b.id));
  if (list.length > k) list.length = k;
}
