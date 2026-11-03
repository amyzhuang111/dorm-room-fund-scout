/**
 * Collision check: overlapping visible text bounding boxes
 * on every primary route at 375 and 1440.
 *
 * Covers:
 * - HTML text nodes (Range.getClientRects)
 * - SVG <text> / <tspan> (getBBox → screen via getScreenCTM)
 * - <foreignObject> HTML text (same as HTML, walked)
 * - Canvas label boxes via [data-canvas-label] / [data-map-label] elements
 *   that mirror painted labels (MapLibre/HTML overlays)
 *
 * Text rects are clipped to overflow-hidden/auto/scroll ancestors;
 * sr-only and closed <details> content are skipped.
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3460";
const OUT = process.env.OUT || "reviews/collisions.json";

const ROUTES = [
  "/",
  "/companies",
  "/companies?more=2",
  "/companies?feed=leaderboard",
  "/founders",
  "/campuses",
  "/data",
  "/signals",
  "/networks",
  "/startup/proj_9GUOmdEYxbuH",
];

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, collisions: [], pages: [] };

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.width <= 400 ? 2 : 1,
  });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (route === "/") {
      await page.waitForSelector("[data-fold-peak-caption], [data-directory-ready='1']", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1800);
    } else if (route.startsWith("/founders") || route.startsWith("/data")) {
      await page.waitForSelector("table tbody tr, [data-founder-card], [data-corpus-explorer]", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else if (route.startsWith("/companies")) {
      await page.waitForSelector("[data-mobile-list-mast], [data-company-card], [data-directory-ready='1'], [data-signals-landed]", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else if (route.startsWith("/signals")) {
      await page.waitForSelector("[data-signal-featured], [data-signals-page] li", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else if (route === "/networks") {
      await page.waitForSelector("[data-networks-graph] canvas", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2200);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
    } else {
      await page.waitForTimeout(1400);
    }
    const found = await page.evaluate(() => {
      const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "TEXTAREA", "INPUT"]);

      function isSkipped(el) {
        if (!el || el.nodeType !== 1) return true;
        if (el.closest(".sr-only, [aria-hidden='true'], [hidden], [data-fold-peak-ssr-wrap]")) return true;
        const details = el.closest("details");
        if (details && !details.open && !el.closest("summary")) return true;
        let cur = el;
        while (cur && cur !== document.documentElement) {
          const cs = getComputedStyle(cur);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return true;
          cur = cur.parentElement;
        }
        return false;
      }

      function clipRect(r, el) {
        let x1 = r.left ?? r.x1, y1 = r.top ?? r.y1, x2 = r.right ?? r.x2, y2 = r.bottom ?? r.y2;
        let cur = el;
        while (cur && cur !== document.documentElement) {
          const cs = getComputedStyle(cur);
          const ox = cs.overflowX;
          const oy = cs.overflowY;
          const clips =
            ox === "hidden" || ox === "auto" || ox === "scroll" ||
            oy === "hidden" || oy === "auto" || oy === "scroll";
          if (clips) {
            const br = cur.getBoundingClientRect();
            x1 = Math.max(x1, br.left);
            y1 = Math.max(y1, br.top);
            x2 = Math.min(x2, br.right);
            y2 = Math.min(y2, br.bottom);
          }
          cur = cur.parentElement;
        }
        x1 = Math.max(x1, 0);
        y1 = Math.max(y1, 0);
        x2 = Math.min(x2, window.innerWidth);
        y2 = Math.min(y2, window.innerHeight);
        return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
      }

      function pathOf(el) {
        const parts = [];
        let cur = el;
        for (let i = 0; i < 5 && cur && cur !== document.body; i++) {
          let bit = (cur.tagName || "?").toLowerCase();
          const dt = cur.attributes && [...cur.attributes].find((a) => a.name.startsWith("data-"))?.name;
          if (dt) bit += `[${dt}]`;
          parts.unshift(bit);
          cur = cur.parentElement;
        }
        return parts.join(">");
      }

      const items = [];

      // HTML text nodes (also covers foreignObject HTML)
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const parent = node.parentElement;
        if (!parent || SKIP.has(parent.tagName) || isSkipped(parent)) continue;
        // Canvas/map labels are measured via glyph boxes below; skip their HTML text twins.
        if (parent.closest("[data-canvas-label], [data-map-label], [data-globe-label]")) continue;
        // Skip raw SVG text nodes — handled via <text> elements below
        if (parent.closest("svg") && parent.tagName !== "FOREIGNObject" && parent.closest("foreignObject") == null) {
          if (parent.tagName === "text" || parent.tagName === "tspan") continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 1 || r.height < 1) continue;
          const c = clipRect(r, parent);
          if (c.w < 1 || c.h < 1) continue;
          items.push({ text: text.slice(0, 80), ...c, path: pathOf(parent), kind: "html" });
        }
      }

      // SVG <text> and <tspan>
      for (const el of document.querySelectorAll("svg text, svg tspan")) {
        if (isSkipped(el)) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        let screen;
        try {
          const bb = el.getBBox();
          const ctm = el.getScreenCTM();
          if (!ctm) continue;
          const pt = (x, y) => {
            const p = new DOMPoint(x, y).matrixTransform(ctm);
            return { x: p.x, y: p.y };
          };
          const a = pt(bb.x, bb.y);
          const b = pt(bb.x + bb.width, bb.y + bb.height);
          screen = {
            left: Math.min(a.x, b.x),
            top: Math.min(a.y, b.y),
            right: Math.max(a.x, b.x),
            bottom: Math.max(a.y, b.y),
          };
        } catch {
          const r = el.getBoundingClientRect();
          screen = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
        if (screen.right - screen.left < 1 || screen.bottom - screen.top < 1) continue;
        const c = clipRect(screen, el);
        if (c.w < 1 || c.h < 1) continue;
        items.push({ text: text.slice(0, 80), ...c, path: pathOf(el), kind: "svg" });
      }

      // Canvas / map label mirrors — union of rendered glyph boxes + padding (not element bbox).
      // One item per label so wrapped lines do not self-collide.
      const LABEL_PAD = 3;
      for (const el of document.querySelectorAll("[data-canvas-label], [data-map-label], [data-globe-label]")) {
        if (isSkipped(el)) continue;
        const text = (el.getAttribute("data-label") || el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        let rects = [...range.getClientRects()].filter((r) => r.width >= 1 && r.height >= 1);
        if (!rects.length) {
          const r = el.getBoundingClientRect();
          if (r.width >= 1 && r.height >= 1) rects = [r];
        }
        if (!rects.length) continue;
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const r of rects) {
          left = Math.min(left, r.left);
          top = Math.min(top, r.top);
          right = Math.max(right, r.right);
          bottom = Math.max(bottom, r.bottom);
        }
        const padded = {
          left: left - LABEL_PAD,
          top: top - LABEL_PAD,
          right: right + LABEL_PAD,
          bottom: bottom + LABEL_PAD,
        };
        const c = clipRect(padded, el);
        if (c.w < 1 || c.h < 1) continue;
        items.push({
          text: text.slice(0, 80),
          ...c,
          path: pathOf(el),
          kind: "canvas-label",
          labelId: el.getAttribute("data-canvas-label") || el.getAttribute("data-map-label") || el.getAttribute("data-globe-label") || text,
        });
      }

      const collisions = [];
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (
            Math.abs(a.x1 - b.x1) < 0.5 &&
            Math.abs(a.y1 - b.y1) < 0.5 &&
            Math.abs(a.x2 - b.x2) < 0.5 &&
            Math.abs(a.y2 - b.y2) < 0.5 &&
            a.text === b.text
          ) continue;
          if (a.labelId && b.labelId && a.labelId === b.labelId) continue;
          if (a.path && a.path === b.path && a.text === b.text) continue;
          const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
          const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
          const area = x * y;
          if (area <= 4) continue;
          const tol = 1;
          const aContainsB = a.x1 <= b.x1 + tol && a.y1 <= b.y1 + tol && a.x2 >= b.x2 - tol && a.y2 >= b.y2 - tol;
          const bContainsA = b.x1 <= a.x1 + tol && b.y1 <= a.y1 + tol && b.x2 >= a.x2 - tol && b.y2 >= a.y2 - tol;
          if (aContainsB || bContainsA) continue;
          collisions.push({
            area: Math.round(area),
            a: { text: a.text, path: a.path, kind: a.kind, box: [a.x1, a.y1, a.x2, a.y2].map((n) => Math.round(n)) },
            b: { text: b.text, path: b.path, kind: b.kind, box: [b.x1, b.y1, b.x2, b.y2].map((n) => Math.round(n)) },
          });
        }
      }
      // Extra networks metrics: callout-over-node + label-over-label on rendered canvas
      let calloutOnNode = [];
      let labelOnLabel = [];
      const callouts = [...document.querySelectorAll("[data-canvas-callout]")].filter((el) => !isSkipped(el));
      const labels = items.filter((it) => it.kind === "canvas-label");
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i];
          const b = labels[j];
          const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
          const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
          const area = x * y;
          if (area <= 16) continue;
          labelOnLabel.push({ area: Math.round(area), a: a.text, b: b.text });
        }
      }
      const posterPayload = window.__NETWORKS_POSTER__ || null;
      const graphEl = document.querySelector("[data-networks-graph]");
      const canvasEl = graphEl && graphEl.querySelector("canvas");
      if (posterPayload && canvasEl && callouts.length) {
        const gr = canvasEl.getBoundingClientRect();
        const pw = posterPayload.w || 1200;
        const ph = posterPayload.h || 900;
        const fit = Math.min(gr.width / pw, gr.height / ph);
        const s = fit;
        const ox = gr.left + (gr.width - pw * fit) / 2;
        const oy = gr.top + (gr.height - ph * fit) / 2;
        const xs = posterPayload.x || [];
        const ys = posterPayload.y || [];
        const rs = posterPayload.r || [];
        for (const el of callouts) {
          const r = el.getBoundingClientRect();
          const crect = { x1: r.left, y1: r.top, x2: r.right, y2: r.bottom };
          for (let i = 0; i < xs.length; i++) {
            const nx = xs[i] * s + ox;
            const ny = ys[i] * s + oy;
            const nr = Math.max(1.8, Math.min(12, (rs[i] || 4) * s));
            const x = Math.max(0, Math.min(crect.x2, nx + nr) - Math.max(crect.x1, nx - nr));
            const y = Math.max(0, Math.min(crect.y2, ny + nr) - Math.max(crect.y1, ny - nr));
            const area = x * y;
            if (area < 8) continue;
            calloutOnNode.push({ area: Math.round(area), text: (el.textContent || "").trim().slice(0, 60), node: i });
            if (calloutOnNode.length >= 40) break;
          }
          if (calloutOnNode.length >= 40) break;
        }
      }
      // label-on-label already covered by canvas-label pairs in collisions;
      // callout-on-node is the additive gate (nodes aren't DOM text).
      const extraCollisions = calloutOnNode.length;
      return {
        nodeCount: items.length,
        collisions: collisions.slice(0, 50),
        collisionCount: collisions.length + extraCollisions,
        calloutOnNode: calloutOnNode.slice(0, 20),
        labelOnLabel: labelOnLabel.slice(0, 20),
        calloutOnNodeCount: calloutOnNode.length,
        labelOnLabelCount: labelOnLabel.length,
      };
    });
    report.pages.push({ route, viewport: vp.name, ...found });
    for (const c of found.collisions) report.collisions.push({ route, viewport: vp.name, ...c });
    if (found.collisionCount > 0) report.ok = false;
    const extra =
      found.calloutOnNodeCount || found.labelOnLabelCount
        ? ` callout-on-node=${found.calloutOnNodeCount || 0} label-on-label=${found.labelOnLabelCount || 0}`
        : "";
    console.log(`${vp.name} ${route} nodes=${found.nodeCount} collisions=${found.collisionCount}${extra}`);
  }
  await page.close();
}

await browser.close();
fs.mkdirSync(OUT.includes("/") ? OUT.replace(/\/[^/]+$/, "") : ".", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, collisionCount: report.collisions.length, wrote: OUT }, null, 2));
if (!report.ok) process.exit(1);
