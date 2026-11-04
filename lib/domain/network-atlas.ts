export type AtlasPlace = {
  campus: string;
  country: string;
  continent: string;
  basis: "campus" | "headquarters";
  source?: string;
};
export type AtlasNode = {
  id: string;
  name: string;
  kind: "founder" | "startup";
  places: AtlasPlace[];
  links: { label: string; url: string }[];
  description?: string;
};
export type AtlasGroup = {
  id: string;
  name: string;
  kind: string;
  members: number[];
  source?: string;
  evidenceByMember?: Record<number, string>;
};
export type AtlasData = {
  nodes: AtlasNode[];
  groups: AtlasGroup[];
  companies: [number, number][];
  generatedAt: string;
};
export const ATLAS_COLORS = [
  "#c66af4", // orchid
  "#72dfbc", // mint
  "#6889f5", // cornflower
  "#eee77b", // lemon
  "#f7a493", // coral
  "#a687ed", // lilac
  "#a4e7dc", // sea glass
  "#eed5a4", // warm light
  "#8dbcf3", // sky
];

/** A coverage metric, not a claim of influence or personal acquaintance. */
export function atlasConnectors(data: AtlasData) {
  const affiliations = data.nodes.map(() => new Set<string>());
  const types = data.nodes.map(() => new Set<string>());
  const neighbors = data.nodes.map(() => new Set<number>());
  for (const g of data.groups) for (const i of g.members) {
    affiliations[i]?.add(g.id);
    types[i]?.add(g.kind.trim().toLowerCase());
  }
  for (const [a, b] of data.companies) {
    if (a === b) continue;
    neighbors[a]?.add(b);
    neighbors[b]?.add(a);
  }
  return data.nodes.map((node, i) => ({
    i, id: node.id, affiliations: affiliations[i].size,
    direct: neighbors[i].size, score: affiliations[i].size + neighbors[i].size,
    networkTypes: types[i].size,
    campuses: new Set([i,...neighbors[i]].flatMap(j => data.nodes[j].places.filter(p => p.basis === "campus" && p.campus).map(p => p.campus))).size,
  })).filter(n => n.affiliations >= 2 && n.direct >= 1)
    .sort((a, b) => (b.networkTypes + b.campuses) - (a.networkTypes + a.campuses) || b.score - a.score || a.id.localeCompare(b.id));
}

/** Keep a selected dot visible while the rest of its neighborhood rotates. */
export function anchorAtlasSelection<T extends {x:number;y:number}>(points:T[], selected:number|null, width:number, height:number):T[] {
  if (selected === null || !points[selected]) return points;
  const target = {x:width < 700 ? width * .5 : width * .32, y:width < 700 ? 42 : height * .45};
  const dx = target.x - points[selected].x, dy = target.y - points[selected].y;
  return points.map(p => ({...p,x:p.x+dx,y:p.y+dy}));
}

export function atlasSummary(description:string):string {
  return description.replace(/\s+/g," ").trim().split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])(?=[A-Z])/)[0] || description;
}
export function safeAtlasUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function atlasHash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
/** Stable packed tissue, not disconnected spherical clusters. No synthetic records. */
export function atlasLayout(nodes: AtlasNode[]) {
  const groups = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const key = n.places[0]?.campus || n.places[0]?.country || "Unlocated";
    const g = groups.get(key) ?? [];
    g.push(i);
    groups.set(key, g);
  });
  const sorted = [...groups].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const points: { x: number; y: number; z: number }[] = new Array(nodes.length);
  // Squarified treemap regions give every campus area proportional to its records.
  function partition(
    entries: typeof sorted,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (!entries.length) return;
    if (entries.length === 1) {
      const [, ids] = entries[0];
      ids.forEach((id) => {
        const u = atlasHash("u:" + nodes[id].id) / 4294967296,
          v = atlasHash("v:" + nodes[id].id) / 4294967296;
        let px = x + u * w,
          py = y + v * h;
        // Smoothly warp the packed square into a continuous irregular cloud.
        const ox = px,
          oy = py;
        px =
          ox * Math.sqrt(1 - oy * oy * 0.32) + 0.1 * Math.sin(oy * 7 + ox * 3);
        py =
          oy * Math.sqrt(1 - ox * ox * 0.32) + 0.09 * Math.sin(ox * 8 + oy * 2);
        points[id] = {
          x: px,
          y: py,
          z:
            0.24 * Math.sin(ox * 4) * Math.cos(oy * 3) +
            ((atlasHash(nodes[id].id) % 1000) / 1000 - 0.5) * 0.18,
        };
      });
      return;
    }
    const total = entries.reduce((s, e) => s + e[1].length, 0);
    let sum = 0,
      cut = 0;
    while (cut < entries.length - 1 && sum < total / 2)
      sum += entries[cut++][1].length;
    const ratio = sum / total;
    if (w > h) {
      partition(entries.slice(0, cut), x, y, w * ratio, h);
      partition(entries.slice(cut), x + w * ratio, y, w * (1 - ratio), h);
    } else {
      partition(entries.slice(0, cut), x, y, w, h * ratio);
      partition(entries.slice(cut), x, y + h * ratio, w, h * (1 - ratio));
    }
  }
  partition(sorted, -0.9, -1, 1.8, 2);
  return points;
}
