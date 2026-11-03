/**
 * Fail if any 1440 panel shows a header with an empty body in the first viewport.
 * Targets the n5 regression: Featured / Insights / Investor hubs pushed below the
 * graph so only headers (or empty stretch) appear beside/under the fold.
 *
 * Usage: BASE=http://127.0.0.1:3471 OUT=/tmp/empty-panels.json node scripts/check-empty-panels.mjs
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE || "http://127.0.0.1:3471";
const OUT = process.env.OUT || "";
const ROUTE = process.env.ROUTE || "/networks";

function fail(msg) {
  console.error("FAIL", msg);
  process.exitCode = 1;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1800);

const found = await page.evaluate(() => {
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  function inFirstViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
  }

  function textOf(el) {
    return (el?.innerText || "").replace(/\s+/g, " ").trim();
  }

  /** Header node inside a panel: first heading or small-caps label row. */
  function headerOf(panel) {
    return (
      panel.querySelector("h1,h2,h3,h4,[data-panel-header]") ||
      [...panel.children].find((c) => {
        const t = textOf(c);
        return t && t.length < 48 && (/^[A-Z][A-Z\s·.-]{2,}$/.test(t) || /featured|insight|investor|hub|network|pathway/i.test(t));
      }) ||
      null
    );
  }

  function bodyContent(panel, header) {
    const nodes = [...panel.querySelectorAll("p,li,button,a,div,span")].filter((el) => {
      if (header && (el === header || header.contains(el))) return false;
      const t = textOf(el);
      if (t.length < 2) return false;
      const r = el.getBoundingClientRect();
      return r.height >= 8 && r.width >= 8;
    });
    return nodes;
  }

  const selectors = [
    "[data-networks-rail]",
    "[data-networks-detail]",
    "[data-networks-featured]",
    "[data-networks-insights]",
    "[data-networks-investor-rail]",
    "main section[aria-labelledby]",
  ];
  const panels = [];
  const seen = new Set();
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      panels.push(el);
    }
  }

  const offenders = [];
  for (const panel of panels) {
    if (!visible(panel) && !inFirstViewport(panel)) continue;
    const header = headerOf(panel);
    if (!header || !inFirstViewport(header)) continue;
    const bodyNodes = bodyContent(panel, header);
    const bodyInView = bodyNodes.filter((n) => inFirstViewport(n));
    const bodyText = bodyInView.map(textOf).join(" ").trim();
    // Empty body: header in first viewport, but no meaningful body text also in view.
    if (bodyText.length < 8) {
      const hr = header.getBoundingClientRect();
      offenders.push({
        kind: panel.getAttribute("data-networks-rail") != null
          ? "rail"
          : panel.getAttribute("data-networks-insights") != null
            ? "insights"
            : panel.getAttribute("data-networks-investor-rail") != null
              ? "investors"
              : panel.getAttribute("data-networks-detail") != null || panel.hasAttribute("data-networks-featured")
                ? "detail"
                : "section",
        header: textOf(header).slice(0, 80),
        headerTop: Math.round(hr.top),
        bodyChars: bodyText.length,
        panelText: textOf(panel).slice(0, 120),
      });
    }
  }

  // Structural requirements: desk rail must be in the first viewport with insights + investors filled.
  const rail = document.querySelector("[data-networks-rail]");
  const insights = document.querySelector("[data-networks-rail] [data-networks-insights], [data-networks-insights]");
  const investors = document.querySelector("[data-networks-rail] [data-networks-investor-rail], [data-networks-investor-rail]");
  const detail = document.querySelector("[data-networks-rail] [data-networks-detail], [data-networks-featured]");
  const structural = {
    railInView: !!(rail && visible(rail) && inFirstViewport(rail)),
    insightsInView: !!(insights && visible(insights) && inFirstViewport(insights) && textOf(insights).length > 12),
    investorsInView: !!(investors && visible(investors) && inFirstViewport(investors) && textOf(investors).length > 12),
    detailInView: !!(detail && visible(detail) && inFirstViewport(detail) && textOf(detail).length > 12),
  };

  return { offenders, structural, panelCount: panels.length };
});

const report = { ok: true, base: BASE, route: ROUTE, viewport: "1440x900", ...found };
if (!found.structural.railInView) {
  report.ok = false;
  fail("1440: data-networks-rail missing from first viewport");
}
if (!found.structural.insightsInView) {
  report.ok = false;
  fail("1440: Insights panel header/body not filled in first viewport");
}
if (!found.structural.investorsInView) {
  report.ok = false;
  fail("1440: Investor hubs panel header/body not filled in first viewport");
}
if (!found.structural.detailInView) {
  report.ok = false;
  fail("1440: Featured/detail panel header/body not filled in first viewport");
}
for (const o of found.offenders) {
  report.ok = false;
  fail(`1440 empty body: ${o.kind} header="${o.header}" top=${o.headerTop} bodyChars=${o.bodyChars}`);
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, structural: report.structural, offenders: report.offenders.length }, null, 2));
await browser.close();
if (process.exitCode) {
  console.error("check-empty-panels FAILED");
  process.exit(process.exitCode);
}
console.log("OK no empty-bodied panels in first viewport @1440");
