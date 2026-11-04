"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_COLORS,
  atlasHash,
  atlasLayout,
  type AtlasData,
  type AtlasNode,
} from "@/lib/domain/network-atlas";
import styles from "./network-atlas.module.css";

type View = { zoom: number; x: number; y: number; yaw: number; pitch: number };
type ScreenPoint = { x: number; y: number; depth: number; i: number };
const initialView = (): View => ({ zoom: 1, x: 0, y: 0, yaw: 0, pitch: 0 });
const unlocated = "Location not yet verified";
export function NetworkAtlas() {
  const [data, setData] = useState<AtlasData | null>(null),
    [error, setError] = useState("");
  const [path, setPath] = useState<string[]>([]),
    [mode, setMode] = useState<"geography" | "networks">("geography");
  const [basis, setBasis] = useState<"campus" | "headquarters">("campus");
  const [colorBy, setColorBy] = useState<"continent" | "country" | "campus">(
    "campus",
  );
  const [group, setGroup] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null),
    [running, setRunning] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lines, setLines] = useState(true),
    [list, setList] = useState(false),
    [page, setPage] = useState(0);
  const [anchor, setAnchor] = useState({ x: 24, y: 24 }),
    [nearby, setNearby] = useState<number[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const view = useRef<View>(initialView()),
    projected = useRef<ScreenPoint[]>([]),
    size = useRef({ w: 800, h: 640 });
  const drag = useRef<{ x: number; y: number; startX:number; startY:number; moved: boolean } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/network/atlas", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("The network could not load. Please reload to try again.");
      });
    return () => controller.abort();
  }, []);
  const positions = useMemo(
    () => (data ? atlasLayout(data.nodes) : []),
    [data],
  );
  const placeFor = (n: AtlasNode) => n.places.filter((p) => p.basis === basis);
  const activeGroup = data?.groups.find((g) => g.id === group);
  const highlighted = useMemo(() => {
    const out = new Set<number>();
    if (!data) return out;
    data.nodes.forEach((n, i) => {
      const places = n.places.filter((p) => p.basis === basis);
      const geography =
        !path.length ||
        places.some((p) =>
          [p.continent, p.country, p.campus]
            .slice(0, path.length)
            .every((s, j) => s === path[j]),
        ) ||
        (path[0] === unlocated && !places.length);
      if (
        geography &&
        (!activeGroup || activeGroup.members.includes(i)) &&
        (!query || n.name.toLowerCase().includes(query.toLowerCase()))
      )
        out.add(i);
    });
    return out;
  }, [data, path, basis, activeGroup, query]);
  const hasFilter = Boolean(path.length || group || query);
  const rows = useMemo(() => {
    const counts = new Map<string, Set<number>>();
    if (!data) return [];
    data.nodes.forEach((n, i) => {
      const places = n.places.filter((p) => p.basis === basis);
      if (!places.length && !path.length) {
        const s = counts.get(unlocated) ?? new Set();
        s.add(i);
        counts.set(unlocated, s);
      }
      for (const p of places) {
        const levels = [
          p.continent,
          p.country,
          p.campus || "No campus affiliation",
        ];
        if (path.every((s, j) => levels[j] === s)) {
          const key = levels[Math.min(path.length, 2)];
          const s = counts.get(key) ?? new Set();
          s.add(i);
          counts.set(key, s);
        }
      }
    });
    if (!path.length) for (const continent of ["North America", "South America", "Europe", "Asia", "Africa", "Oceania", "Antarctica"]) {
      if (!counts.has(continent)) counts.set(continent, new Set());
    }
    return [...counts]
      .map(([name, ids]) => ({ name, count: ids.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data, path, basis]);
  const nodeGroups = useMemo(() => {
    const m = new Map<number, AtlasData["groups"]>();
    if (data)
      for (const g of data.groups)
        for (const i of g.members) {
          const gs = m.get(i) ?? [];
          gs.push(g);
          m.set(i, gs);
        }
    return m;
  }, [data]);
  const related = useMemo(() => {
    const s = new Set<number>();
    if (selected === null || !data) return s;
    s.add(selected);
    for (const g of (nodeGroups.get(selected) ?? []).filter(g => g.id === group))
      for (const i of g.members) s.add(i);
    for (const [a, b] of data.companies) {
      if (a === selected) s.add(b);
      if (b === selected) s.add(a);
    }
    return s;
  }, [data, selected, nodeGroups, group]);
  const edges = useMemo(() => {
    if (!data) return [];
    const out = data.companies.map(([a, b]) => ({
      a,
      b,
      kind: "company",
      label: "Founded this startup",
      id: "company",
    }));
    for (const g of data.groups) {
      if (g.id !== group) continue;
      const root =
        selected !== null && g.members.includes(selected)
          ? selected
          : g.members[0];
      for (const b of g.members)
        if (b !== root) out.push({ a: root, b, kind: g.kind, id: g.id, label: `Shared ${g.name}` });
    }
    return out;
  }, [data, selected, group]);
  function reset() {
    setColorBy("campus");
    setBasis("campus");
    view.current = initialView();
    setSelected(null);
    setNearby([]);
    setPath([]);
    setGroup(null);
    setQuery("");
    setPage(0);
  }
  function zoom(
    factor: number,
    cx = size.current.w / 2,
    cy = size.current.h / 2,
  ) {
    const v = view.current;
    const next = Math.max(1, Math.min(14, v.zoom * factor));
    const k = next / v.zoom;
    v.x = cx - size.current.w / 2 - (cx - size.current.w / 2 - v.x) * k;
    v.y = cy - size.current.h / 2 - (cy - size.current.h / 2 - v.y) * k;
    v.zoom = next;
  }
  function choose(i: number) {
    setSelected(i);
    setNearby([]);
    const p = projected.current.find((p) => p.i === i);
    if (p) setAnchor({ x: p.x, y: p.y });
  }
  function focus(i: number) {
    view.current = { ...initialView(), zoom: 4 };
    const scale = Math.min(size.current.w * 0.45, size.current.h * 0.43) * 4;
    view.current.x = -positions[i].x * scale;
    view.current.y = -positions[i].y * scale;
    choose(i);
    setAnchor({ x: size.current.w / 2, y: size.current.h / 2 });
  }
  useEffect(() => {
    const el = canvas.current,
      container = host.current;
    if (!el || !container || !data || list) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let frame = 0,
      last = 0;
    let drawnKey = "";
    // Reuse soft sprites instead of blurring thousands of shapes every frame.
    const halos = new Map<string, HTMLCanvasElement>();
    const haloFor = (color: string, shape: number) => {
      const spriteKey = `${color}:${shape}`;
      let sprite = halos.get(spriteKey);
      if (!sprite) {
        sprite = document.createElement("canvas");
        sprite.width = sprite.height = 96;
        const brush = sprite.getContext("2d")!;
        const vivid = color;
        const lobe = (x: number, y: number, sx: number, sy: number, angle: number) => {
          brush.save();
          brush.translate(x, y);
          brush.rotate(angle);
          brush.scale(sx, sy);
          const glow = brush.createRadialGradient(0, 0, 0, 0, 0, 32);
          glow.addColorStop(0, `${vivid}f5`);
          glow.addColorStop(0.3, `${vivid}d8`);
          glow.addColorStop(0.65, `${vivid}60`);
          glow.addColorStop(1, `${vivid}00`);
          brush.fillStyle = glow;
          brush.fillRect(-32, -32, 64, 64);
          brush.restore();
        };
        // Irregular, overlapping pigment lobes, not identical circular glows.
        lobe(48, 48, shape === 0 ? 1.25 : 0.85, shape === 0 ? 0.48 : 0.8, -0.6);
        if (shape > 0) lobe(61, 34, 0.43, 0.95, 0.45);
        if (shape > 1) lobe(32, 64, 0.4, 0.85, 0.7);
        halos.set(spriteKey, sprite);
      }
      return sprite;
    };
    const resize = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      if (!r.width || !r.height) return;
      size.current = { w: r.width, h: r.height };
      const dpr = Math.min(devicePixelRatio, 2);
      el.width = r.width * dpr;
      el.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawnKey = "";
    });
    resize.observe(container);
    const tick = (time: number) => {
      const dt = Math.min(40, time - last);
      last = time;
      const { w, h } = size.current;
      const v = view.current;
      const key = [w,h,v.x,v.y,v.zoom,v.yaw,v.pitch].join(":");
      const orbiting = running && !document.hidden;
      if (!orbiting && key === drawnKey) { frame=requestAnimationFrame(tick);return; }
      drawnKey = key;
      if (orbiting) {
        v.yaw += dt * 0.00016 / Math.sqrt(v.zoom);
        v.pitch = 0.12 * Math.sin(v.yaw * 0.8);
      }
      const scale = Math.min(w * 0.45, h * 0.43) * v.zoom;
      const limitX = Math.max(0, scale * 0.95 - w * 0.12),
        limitY = Math.max(0, scale - h * 0.12);
      v.x = Math.max(-limitX, Math.min(limitX, v.x));
      v.y = Math.max(-limitY, Math.min(limitY, v.y));
      ctx.clearRect(0, 0, w, h);
      const yaw = Math.sin(v.yaw) * 0.55,
        cos = Math.cos(yaw),
        sin = Math.sin(yaw),
        roll = v.yaw * 0.35,
        rollCos = Math.cos(roll),
        rollSin = Math.sin(roll);
      const screen = positions.map((p, i) => {
        const z = -p.x * sin + p.z * cos;
        const x = p.x * cos + p.z * sin;
        const y = p.y * Math.cos(v.pitch) - z * Math.sin(v.pitch);
        return {
          i,
          depth: z,
          x: w / 2 + v.x + (x * rollCos - y * rollSin) * scale,
          y: h / 2 + v.y + (x * rollSin + y * rollCos) * scale,
        };
      });
      projected.current = screen;
      const detail = Math.max(0, Math.min(1, (v.zoom - 2.8) / 3.2));
      if (detail > 0 && !document.documentElement.matches('[data-theme="night"]')) {
        ctx.fillStyle = `rgba(248,247,239,${detail * 0.8})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (lines) {
        const labels: { x: number; y: number }[] = [];
        for (const e of edges) {
          if (group && e.id !== group && e.kind !== "company") continue;
          // A shared affiliation is not a personal relationship. Reveal these
          // only when someone deliberately explores a member or a network.
          if (e.kind !== "company" && selected === null && !group) continue;
          const a = screen[e.a],
            b = screen[e.b];
          if (!a || !b) continue;
          const visible = (p: ScreenPoint) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
          if (!visible(a) && !visible(b)) continue;
          const selectedEdge =
            selected !== null && (e.a === selected || e.b === selected);
          if (selected !== null && !selectedEdge) continue;
          const company = e.kind === "company";
          // Keep large accelerator memberships from becoming an unreadable
          // radial fan. All members remain available in the network browser.
          if (!company && Math.hypot(a.x - b.x, a.y - b.y) > 260) continue;
          ctx.setLineDash(company ? [] : [4, 5]);
          ctx.lineDashOffset = company ? 0 : (e.a * 17 + e.b * 13) % 19;
          ctx.lineWidth = selectedEdge && company ? 1.25 : 0.55;
          ctx.strokeStyle = company
            ? `rgba(54,71,83,${selectedEdge ? 0.72 : v.zoom > 2 ? 0.14 : 0.022})`
            : `rgba(122,85,163,${selectedEdge ? 0.3 : 0.12})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          if (selectedEdge && v.zoom > 2) {
            const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            if (labels.length < 6 && x > 100 && x < w - 100 && y > 80 && y < h - 40 &&
                !labels.some(p => Math.abs(p.x - x) < 190 && Math.abs(p.y - y) < 28)) {
              labels.push({ x, y });
              ctx.font = "11px sans-serif";
              const text = e.label.length > 38 ? `${e.label.slice(0, 35)}…` : e.label;
              const width = ctx.measureText(text).width;
              ctx.fillStyle = "rgba(255,255,255,.94)";
              ctx.fillRect(x - width / 2 - 5, y - 11, width + 10, 18);
              ctx.fillStyle = company ? "#364753" : "#704694";
              ctx.fillText(text, x - width / 2, y + 2);
            }
          }
        }
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
      for (const p of [...screen].sort((a, b) => a.depth - b.depth)) {
        if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) continue;
        const n = data.nodes[p.i],
          place =
            n.places.find(
              (p) =>
                p.basis === basis &&
                path.every(
                  (s, j) => [p.continent, p.country, p.campus][j] === s,
                ),
            ) ?? n.places.find((p) => p.basis === basis),
          key = place?.[colorBy] || unlocated;
        const color =
          key === unlocated
            ? "#a7afb8"
            : ATLAS_COLORS[atlasHash(key) % ATLAS_COLORS.length];
        const active = selected === null
          ? !hasFilter || highlighted.has(p.i)
          : related.has(p.i);
        const opacity = active ? 0.92 : 0.12;
        ctx.globalAlpha = opacity * (1 - detail);
        const r =
          Math.max(2, Math.min(8, 3.6 * Math.sqrt(v.zoom))) +
          (p.i === selected ? 2 : 0);
        ctx.fillStyle = color;
        ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
        if (active && p.i % 4 === 0 && detail < 0.5) {
          ctx.font = `${Math.max(3, r * 0.85)}px sans-serif`;
          ctx.fillStyle = "rgba(30,44,55,.58)";
          ctx.fillText(n.name.charAt(0), p.x - r * 0.28, p.y + r * 0.3);
        }
        if (v.zoom > 2 && active && detail < 0.5) {
          ctx.strokeStyle = "rgba(35,48,61,.28)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(p.x - r / 2, p.y - r / 2, r, r);
        }
        if (detail > 0) {
          const seed = atlasHash(n.id);
          // A mix of tiny points, wisps and occasional broad color pools lets
          // individual records breathe at close range without hiding any.
          const radius = (seed % 5 === 0 ? 40 + seed % 38 : 7 + seed % 20) * detail;
          ctx.globalAlpha = opacity * detail * (seed % 5 === 0 ? 0.88 : 0.62);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((seed % 628) / 100);
          ctx.drawImage(haloFor(color, seed % 3), -radius, -radius, radius * 2, radius * 2);
          ctx.restore();
          ctx.globalAlpha = opacity * detail;
          ctx.fillStyle = "#263947";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.i === selected ? 3.5 : 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (p.i === selected) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#243c4a";
          ctx.lineWidth = 2;
          if (detail > 0.5) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
            ctx.stroke();
          } else ctx.strokeRect(p.x - r / 2 - 3, p.y - r / 2 - 3, r + 6, r + 6);
        }
      }
      ctx.globalAlpha = 1;
      // Labels appear only around the focused record, never thousands of overlapping boxes.
      if (selected !== null && v.zoom > 2) {
        const occupied: { x: number; y: number }[] = [];
        ctx.font = "12px sans-serif";
        for (const i of related) {
          const p = screen[i];
          if (
            !p ||
            p.x < 20 ||
            p.x > w - 140 ||
            p.y < 20 ||
            p.y > h - 20 ||
            occupied.some(
              (o) => Math.abs(o.x - p.x) < 140 && Math.abs(o.y - p.y) < 18,
            )
          )
            continue;
          occupied.push(p);
          ctx.fillStyle = "#263947";
          ctx.fillText(data.nodes[i].name.slice(0, 28), p.x + 9, p.y + 4);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, [
    data,
    positions,
    running,
    basis,
    colorBy,
    highlighted,
    hasFilter,
    selected,
    related,
    edges,
    group,
    lines,
    list,
    path,
  ]);
  if (error) return <p role="alert">{error}</p>;
  if (!data)
    return (
      <p role="status" className={styles.loading}>
        Preparing the full founder & startup network…
      </p>
    );
  const current = selected === null ? null : data.nodes[selected];
  const resultIds = [...highlighted];
  const peers =
    selected === null
      ? []
      : data.companies.flatMap(([a, b]) =>
          a === selected ? [b] : b === selected ? [a] : [],
        );
  return (
    <section
      id="network-map"
      className={styles.atlas}
      aria-label="Founder and startup atlas"
    >
      <aside className={styles.sidebar} data-open={filtersOpen}>
        <div className={styles.eyebrow}>EXPLORE THE ECOSYSTEM</div>
        <h2>
          Every connection.
          <br />
          One network.
        </h2>
        <p className={styles.muted}>
          {data.nodes.length.toLocaleString()} founders & startups
        </p>
        <div className={styles.tabs}>
          <button
            aria-pressed={mode === "geography"}
            onClick={() => setMode("geography")}
          >
            Locations
          </button>
          <button
            aria-pressed={mode === "networks"}
            onClick={() => setMode("networks")}
          >
            Networks
          </button>
        </div>
        {mode === "geography" ? (
          <>
            <label>
              Location based on
              <select
                value={basis}
                onChange={(e) => {
                  setBasis(e.target.value as typeof basis);
                  setPath([]);
                  setPage(0);
                }}
              >
                <option value="campus">Campus affiliation</option>
                <option value="headquarters">Company headquarters</option>
              </select>
            </label>
            <label>
              Color by
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as typeof colorBy)}
              >
                <option value="continent">Continent</option>
                <option value="country">Country</option>
                <option value="campus">Campus</option>
              </select>
            </label>
            <nav className={styles.breadcrumb} aria-label="Location hierarchy">
              <button
                onClick={() => {
                  setPath([]);
                  setColorBy("continent");
                }}
              >
                World
              </button>
              {path.map((p, i) => (
                <button key={i} onClick={() => setPath(path.slice(0, i + 1))}>
                  {" "}
                  / {p}
                </button>
              ))}
            </nav>
            <div className={styles.regionList}>
              {path.length < 3 &&
                rows.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => {
                      setPath([...path, r.name]);
                      setFiltersOpen(false);
                      setColorBy(
                        path.length === 0
                          ? "continent"
                          : path.length === 1
                            ? "country"
                            : "campus",
                      );
                      setPage(0);
                      setSelected(null);
                    }}
                  >
                    <span
                      className={styles.swatch}
                      style={{
                        background:
                          r.name === unlocated
                            ? "#a7afb8"
                            : ATLAS_COLORS[
                                atlasHash(r.name) % ATLAS_COLORS.length
                              ],
                      }}
                    />
                    <span>{r.name}</span>
                    <small>{r.count.toLocaleString()}</small>
                    <span>›</span>
                  </button>
                ))}
            </div>
            <p className={styles.note}>
              Campus colors describe school affiliation, not nationality.
              Headquarters describe the company, not a founder’s residence.
            </p>
          </>
        ) : (
          <>
            <button onClick={() => setGroup(null)}>All networks</button>
            <div className={styles.regionList}>
              {data.groups.map((g) => (
                <button
                  key={g.id}
                  aria-pressed={group === g.id}
                  onClick={() => {
                    setGroup(g.id);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <span>
                    {g.name}
                    <small className={styles.block}>{g.kind}</small>
                  </span>
                  <small>{g.members.length}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <button
            className={styles.filterToggle}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Explore
          </button>
          <input
            aria-label="Search every founder or startup"
            placeholder="Find a founder or startup…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
              setList(true);
            }}
          />
          <button aria-pressed={list} onClick={() => setList(!list)}>
            {list ? "Show map" : "Browse list"}
          </button>
        </div>
        <div className={styles.status}>
          <span>
            {hasFilter
              ? `${highlighted.size.toLocaleString()} highlighted · `
              : ""}
            {data.nodes.length.toLocaleString()} records on the map
          </span>
          <button onClick={reset}>Reset all</button>
        </div>
        {list ? (
          <div className={styles.results}>
            <p>All matching records · {resultIds.length.toLocaleString()}</p>
            {resultIds.slice(page * 30, (page + 1) * 30).map((i) => (
              <button
                key={data.nodes[i].id}
                onClick={() => {
                  setList(false);
                  requestAnimationFrame(() => focus(i));
                }}
              >
                <span>
                  {data.nodes[i].name}
                  <small className={styles.block}>
                    {data.nodes[i].kind} ·{" "}
                    {placeFor(data.nodes[i])[0]?.campus ||
                      placeFor(data.nodes[i])[0]?.country ||
                      "Location not yet verified"}
                  </small>
                </span>
                <span>Explore ↗</span>
              </button>
            ))}
            <div className={styles.tabs}>
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(resultIds.length / 30))}
              </span>
              <button
                disabled={(page + 1) * 30 >= resultIds.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={styles.viewport}
          ref={host}
          style={{ display: list ? "none" : undefined }}
        >
          <canvas
            ref={canvas}
            aria-label="Interactive network. Drag to move, scroll or pinch to zoom. Use Browse list for keyboard selection."
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSelected(null);
                return;
              }
              if (e.key === "+" || e.key === "=") zoom(1.4);
              if (e.key === "-") zoom(1 / 1.4);
              if (e.key === "Home") reset();
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              drag.current = { x: e.clientX, y: e.clientY, startX:e.clientX,startY:e.clientY,moved: false };
              pinch.current = 0;
            }}
            onPointerMove={(e) => {
              if (!touches.current.has(e.pointerId)) return;
              touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              const t = [...touches.current.values()];
              if (t.length === 2) {
                const distance = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
                if (pinch.current) zoom(distance / pinch.current);
                pinch.current = distance;
                if (drag.current) drag.current.moved = true;
                return;
              }
              const d = drag.current;
              if (d) {
                const dx = e.clientX - d.x,
                  dy = e.clientY - d.y;
                if (Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4) d.moved = true;
                view.current.x += dx;
                view.current.y += dy;
                d.x = e.clientX;
                d.y = e.clientY;
              }
            }}
            onPointerCancel={() => {
              touches.current.clear();
              drag.current = null;
            }}
            onPointerUp={(e) => {
              touches.current.delete(e.pointerId);
              const d = drag.current;
              drag.current = null;
              if (!d || d.moved) return;
              const r = e.currentTarget.getBoundingClientRect(),
                x = e.clientX - r.left,
                y = e.clientY - r.top;
              const hits = projected.current
                .filter((p) => Math.hypot(p.x - x, p.y - y) < 12)
                .sort(
                  (a, b) =>
                    Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
                );
              if (hits[0]) {
                choose(hits[0].i);
                setNearby(hits.slice(1, 8).map((p) => p.i));
              } else setSelected(null);
            }}
          />
          <div className={styles.mapTools}>
            <button aria-label="Zoom in" onClick={() => zoom(1.5)}>
              +
            </button>
            <button aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
              −
            </button>
            <button
              onClick={() => {
                view.current = initialView();
                setSelected(null);
              }}
            >
              Fit all
            </button>
          </div>
          <span className={styles.hint}>
            Drag to explore · scroll or pinch to zoom · select any tile
          </span>
          {current && (
            <aside
              className={styles.card}
              aria-label={`Details for ${current.name}`}
              style={{
                left: `clamp(12px, ${anchor.x + 16}px, calc(100% - 312px))`,
                top: `clamp(66px, ${anchor.y - 30}px, calc(100% - 400px))`,
              }}
            >
              <button
                className={styles.close}
                aria-label="Close details"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
              <div className={styles.eyebrow}>{current.kind}</div>
              <h3>{current.name}</h3>
              {current.description && <p>{current.description}</p>}
              {current.places.map((p, i) => (
                <p key={i} className={styles.muted}>
                  {p.basis === "campus" ? p.campus : "Headquarters"}
                  <br />
                  {p.country} · {p.continent}
                  {p.source && /^https?:\/\//.test(p.source) && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={p.source} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                    </>
                  )}
                </p>
              ))}
              <div className={styles.links}>
                <a
                  href={
                    current.kind === "startup"
                      ? `/startup/${encodeURIComponent(current.id)}`
                      : `/founder/discover?q=${encodeURIComponent(current.name)}`
                  }
                >
                  Full record ↗
                </a>
                {current.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                ))}
              </div>
              {!current.links.length && (
                <p className={styles.note}>
                  No verified public profile link is recorded yet.
                </p>
              )}
              {peers.length > 0 && (
                <>
                  <div className={styles.eyebrow}>
                    {current.kind === "founder" ? "SOLID LINE · FOUNDED" : "SOLID LINE · FOUNDED BY"}
                  </div>
                  {peers.map((i) => (
                    <button
                      className={styles.peer}
                      key={i}
                      onClick={() => focus(i)}
                    >
                      {data.nodes[i].name} ↗
                    </button>
                  ))}
                </>
              )}
              {(nodeGroups.get(selected!) ?? []).length > 0 && <p className={styles.note}>Choose an affiliation below to reveal its dashed purple lines. Shared membership does not mean a personal connection.</p>}
              {(nodeGroups.get(selected!) ?? []).map((g) => (
                <div className={styles.membership} key={g.id}>
                  <button
                    onClick={() => {
                      setGroup(g.id);
                      setMode("networks");
                    }}
                  >
                    Shared {g.name}
                  </button>
                  {(g.evidenceByMember?.[selected!] || g.source) && /^https?:\/\//.test(g.evidenceByMember?.[selected!] || g.source || "") && (
                    <a href={g.evidenceByMember?.[selected!] || g.source} target="_blank" rel="noreferrer">
                      Evidence ↗
                    </a>
                  )}
                </div>
              ))}
              {nearby.length > 0 && (
                <details>
                  <summary>Other nearby tiles ({nearby.length})</summary>
                  {nearby.map((i) => (
                    <button
                      className={styles.peer}
                      key={i}
                      onClick={() => choose(i)}
                    >
                      {data.nodes[i].name}
                    </button>
                  ))}
                </details>
              )}
            </aside>
          )}
        </div>
        <footer className={styles.footer}>
          <label>
            <input
              type="checkbox"
              checked={lines}
              onChange={(e) => setLines(e.target.checked)}
            />{" "}
            Show connections
          </label>
          <span>Each tile / dot = one founder or startup</span>
          <span className={styles.lineKey}><i /> Founded this startup</span>
          <span className={`${styles.lineKey} ${styles.sharedKey}`}><i /> Shared affiliation</span>
          <span>Choose a network to reveal its shared affiliations.</span>
          <label><input type="checkbox" checked={!running} onChange={e => setRunning(!e.target.checked)} /> Still view</label>
        </footer>
      </div>
    </section>
  );
}
