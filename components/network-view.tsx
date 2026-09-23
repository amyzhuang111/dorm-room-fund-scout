import Link from "next/link";
import { buildUniversityNetwork, type NetworkNode } from "@/lib/domain/network";
import { buildHref } from "@/lib/domain/url";
import type { UniversitySummary } from "@/lib/domain/queries";

const SHAPE_BY_TYPE: Record<NetworkNode["type"], string> = {
  university: "rect",
  community: "diamond",
  person: "circle",
  project: "triangle",
};

const COLOR_BY_TYPE: Record<NetworkNode["type"], string> = {
  university: "var(--accent)",
  community: "#0891b2",
  person: "#71717a",
  project: "#15803d",
};

function Shape({ node, clickable }: { node: NetworkNode; clickable: boolean }) {
  const size = node.type === "university" ? 14 : 9;
  const color = COLOR_BY_TYPE[node.type];
  const opacity = clickable ? 1 : 0.55;
  const common = { fill: color, opacity, stroke: "var(--surface)", strokeWidth: 1.5 };
  switch (SHAPE_BY_TYPE[node.type]) {
    case "rect":
      return <rect x={node.x - size} y={node.y - size} width={size * 2} height={size * 2} rx={3} {...common} />;
    case "diamond":
      return (
        <polygon
          points={`${node.x},${node.y - size} ${node.x + size},${node.y} ${node.x},${node.y + size} ${node.x - size},${node.y}`}
          {...common}
        />
      );
    case "triangle":
      return (
        <polygon
          points={`${node.x},${node.y - size} ${node.x + size},${node.y + size} ${node.x - size},${node.y + size}`}
          {...common}
        />
      );
    default:
      return <circle cx={node.x} cy={node.y} r={size} {...common} />;
  }
}

export function NetworkView({
  universityId,
  basePath,
  current,
  universities,
}: {
  universityId: string | undefined;
  basePath: string;
  current: Record<string, string | undefined>;
  universities: UniversitySummary[];
}) {
  if (!universityId) {
    return (
      <div className="p-6 text-sm text-muted">
        <p className="font-medium text-foreground">Pick a university to see its network.</p>
        <p className="mt-1">The network is scoped to one campus at a time to keep it readable — pick one from the directory on the left.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {universities.map((u) => (
            <li key={u.id}>
              <Link href={buildHref(basePath, current, { university: u.id, view: "network" })} className="rounded-full border border-border-c px-3 py-1 text-xs hover:bg-surface-2">
                {u.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const graph = buildUniversityNetwork(universityId);
  if (graph.nodes.length === 0) {
    return <p className="p-6 text-sm text-muted">No evidence-backed connections on record for this campus yet.</p>;
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="flex flex-col gap-4 p-4 lg:flex-row">
      <div className="flex-1">
        <svg viewBox="0 0 720 560" role="img" aria-label={`Network for ${universities.find((u) => u.id === universityId)?.name ?? "campus"}`} className="w-full rounded-md border border-border-c bg-surface-2">
          <g>
            {graph.edges.map((e, i) => {
              const s = nodeById.get(e.source);
              const t = nodeById.get(e.target);
              if (!s || !t) return null;
              return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--border-c)" strokeWidth={1} />;
            })}
          </g>
          <g>
            {graph.nodes.map((n) => {
              const clickable = n.type === "project";
              const shape = <Shape node={n} clickable={clickable} />;
              const label = (
                <text x={n.x} y={n.y + 20} textAnchor="middle" fontSize="9" fill="var(--muted)">
                  {n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label}
                </text>
              );
              if (clickable) {
                return (
                  <a key={n.id} href={buildHref(basePath, current, { project: n.id })} aria-label={n.label}>
                    <title>{n.label}</title>
                    {shape}
                    {label}
                  </a>
                );
              }
              return (
                <g key={n.id}>
                  <title>{`${n.label}${n.sublabel ? ` (${n.sublabel})` : ""}`}</title>
                  {shape}
                  {label}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          {graph.legend.map((l) => (
            <span key={l.type} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_BY_TYPE[l.type] }} />
              {l.label}
            </span>
          ))}
        </div>
        {graph.omittedCount > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            {graph.omittedCount} more affiliated people omitted from this rendering (cap: 60 nodes) — none are omitted from the Table view or shortlist.
          </p>
        )}
      </div>

      <div className="w-full shrink-0 lg:w-56">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Nodes (keyboard-accessible)</p>
        <ul className="max-h-[520px] space-y-0.5 overflow-y-auto">
          {graph.nodes.map((n) => (
            <li key={n.id}>
              {n.type === "project" ? (
                <Link href={buildHref(basePath, current, { project: n.id })} className="block truncate rounded-md px-2 py-1 text-xs text-foreground hover:bg-surface-2">
                  {n.label}
                </Link>
              ) : (
                <span className="block truncate rounded-md px-2 py-1 text-xs text-muted">{n.label}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
