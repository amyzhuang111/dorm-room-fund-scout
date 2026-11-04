/**
 * Fail if any visible leaf text is clipped mid-flow via:
 *   - text-overflow: ellipsis while overflowing, OR
 *   - -webkit-line-clamp while overflowing (scrollWidth or scrollHeight), OR
 *   - overflow:hidden/clip + nowrap while scrollWidth overflows
 * Scans key routes at 390 and 1440.
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-midword-clip.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/midword-clip.json";
const ROUTES = [
  "/",
  "/founders",
  "/companies",
  "/data",
  "/campuses",
  "/networks",
  "/campuses/penn",
  "/campuses/stanford",
  "/campuses/mit",
  "/campuses/berkeley",
];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

const EXTRA = process.env.VERCEL_BYPASS
  ? {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": process.env.VERCEL_BYPASS,
        "x-vercel-set-bypass-cookie": "true",
      },
    }
  : {};

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}
function pass(msg) {
  console.log("OK", msg);
}

const report = { ok: true, base: BASE, hits: [] };

const browser = await chromium.launch({ headless: true });
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(vp.w < 800
      ? {
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : { deviceScaleFactor: 2 }),
    ...EXTRA,
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
      await page
        .waitForFunction(() => !/Loading/i.test(document.body.innerText), null, { timeout: 25000 })
        .catch(() => {});
      await page.waitForTimeout(1800);
      const hits = await page.evaluate(() => {
        const out = [];
        const nodes = document.querySelectorAll("a,td,span,p,h1,h2,h3,h4,div,li,button,label");
        for (const e of nodes) {
          if (e.children.length > 0) continue;
          const text = (e.textContent || "").replace(/\s+/g, " ").trim();
          if (!text || text.length < 2) continue;
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;

          const clamp = cs.webkitLineClamp;
          const hasClamp = Boolean(clamp && clamp !== "none");
          const hasEllipsis = cs.textOverflow === "ellipsis";
          const nowrapHidden =
            (cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre") &&
            (cs.overflowX === "hidden" || cs.overflow === "hidden" || cs.overflow === "clip");
          if (!hasEllipsis && !hasClamp && !nowrapHidden) continue;

          const overflowX = e.scrollWidth > e.clientWidth + 1;
          const overflowY = e.scrollHeight > e.clientHeight + 1;
          if (!overflowX && !overflowY) continue;

          // Chip/rail nowrap inside a scroller is intentional; ellipsis + line-clamp
          // mid-word clips are never OK, even inside a logo dock scroller.
          if (!hasEllipsis && !hasClamp) {
            let scrollParent = false;
            let a = e.parentElement;
            while (a) {
              const o = getComputedStyle(a);
              if (
                o.overflowX === "auto" ||
                o.overflowX === "scroll" ||
                o.overflowY === "auto" ||
                o.overflowY === "scroll"
              ) {
                scrollParent = true;
                break;
              }
              a = a.parentElement;
            }
            if (scrollParent) continue;
          }

          const why = hasEllipsis ? "ellipsis" : hasClamp ? `line-clamp:${clamp}` : "nowrap-hidden";
          out.push(`${why} ${text.slice(0, 56)}`);
          if (out.length >= 24) break;
        }
        return out;
      });
      const key = `${vp.w}${route}`;
      if (hits.length) {
        report.hits.push({ at: key, n: hits.length, sample: hits.slice(0, 8) });
        fail(`${key}: ${hits.length} mid-word clips e.g. ${JSON.stringify(hits.slice(0, 3))}`);
      } else {
        pass(`${key}: no mid-word / line-clamp overflow`);
      }
    } catch (err) {
      fail(`${vp.w}${route}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await context.close();
}
await browser.close();

report.ok = process.exitCode !== 1;
fs.mkdirSync(path.dirname(OUT) === "." ? "reviews" : path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-midword-clip" : "FAIL check-midword-clip", { wrote: OUT, hits: report.hits.length });
if (!report.ok) process.exit(1);
