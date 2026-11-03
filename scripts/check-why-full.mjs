/**
 * At 375: every visible Why text must fully paint (scrollHeight <= clientHeight).
 * Also reject line-clamp / ellipsis / overflow:hidden on [data-why-text] and [data-why-worth].
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3460";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector('[data-directory-ready="1"]', { timeout: 60000 });
await page.waitForSelector("[data-founder-card]", { timeout: 60000 });
await page.waitForTimeout(800);
// Expand peek → deck so full why lines are on screen (rest state is chip strip).
{
  const expand = page.locator("[data-fold-sheet-expand]").first();
  if (await expand.count()) {
    await expand.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}
await page.waitForSelector("[data-why-text]", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(300);

const report = await page.evaluate(() => {
  const whyRoots = [...document.querySelectorAll("[data-why-worth]:not([data-why-blank])")];
  const issues = [];
  for (const root of whyRoots) {
    const textEl = root.querySelector("[data-why-text]") || root;
    const cs = getComputedStyle(textEl);
    const rootCs = getComputedStyle(root);
    const scrollH = textEl.scrollHeight;
    const clientH = textEl.clientHeight;
    const clipped = scrollH > clientH + 1;
    const lineClamp = cs.webkitLineClamp;
    const badClamp = lineClamp && lineClamp !== "none" && Number(lineClamp) > 0;
    const badOverflow =
      ["hidden", "auto", "scroll"].includes(cs.overflow) ||
      ["hidden", "auto", "scroll"].includes(cs.overflowY) ||
      ["hidden", "auto", "scroll"].includes(rootCs.overflow) ||
      ["hidden", "auto", "scroll"].includes(rootCs.overflowY);
    const badEllipsis = cs.textOverflow === "ellipsis" || rootCs.textOverflow === "ellipsis";
    if (clipped || badClamp || badOverflow || badEllipsis) {
      issues.push({
        text: (textEl.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        scrollH,
        clientH,
        clipped,
        lineClamp,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        textOverflow: cs.textOverflow,
        rootOverflow: rootCs.overflow,
      });
    }
  }
  return {
    checked: whyRoots.length,
    withTextNodes: whyRoots.filter((r) => r.querySelector("[data-why-text]")).length,
    issues,
  };
});

await browser.close();

const ok = report.checked > 0 && report.withTextNodes === report.checked && report.issues.length === 0;
console.log(JSON.stringify({ ok, ...report }, null, 2));
if (!ok) process.exit(1);
