/**
 * Fail when any visible tag chip is ellipsized, longer than 28 chars, or a
 * sentence (ending punctuation or more than 5 words). Also fail when a card's
 * meta/pitch line mentions a sector with different casing than the sector chip
 * (canonical labels must match on every route).
 * Usage: BASE=http://127.0.0.1:3460 node scripts/check-chip-quality.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = (process.env.BASE || "http://127.0.0.1:3460").replace(/\/$/, "");
const OUT = process.env.OUT || "reviews/chip-quality.json";
const MAX_CHARS = 28;
const MAX_WORDS = 5;
const ROUTES = ["/", "/founders", "/companies", "/data", "/campuses/penn", "/campuses/mit", "/networks"];
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Canonical sector labels — Food/Ag style (each word capitalized, acronyms kept). */
const CANONICAL_SECTORS = [
  "AI Infra",
  "AI Agents/Apps",
  "Vertical AI",
  "Dev Tools",
  "Data/Infra",
  "Cybersecurity",
  "Fintech",
  "Crypto/Web3",
  "Healthtech",
  "Biotech",
  "Medtech/Devices",
  "Climate/Energy",
  "Robotics/Hardware",
  "Defense/Gov",
  "Aerospace",
  "Edtech",
  "Consumer",
  "Marketplaces",
  "E-commerce",
  "Enterprise SaaS",
  "Proptech",
  "Mobility",
  "Food/Ag",
  "Media/Creator",
  "Social",
  "Gaming",
  "Legal",
  "HR/Work",
];

const browser = await chromium.launch({ headless: true });
const report = { ok: true, base: BASE, hits: [] };

function fail(msg, hit) {
  console.error("FAIL", msg);
  report.ok = false;
  process.exitCode = 1;
  if (hit) report.hits.push(hit);
}

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    ...(vp.w < 800
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA }
      : { deviceScaleFactor: 2 }),
  });
  await context.route(/vercel\.live/, (r) => r.abort());
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => !/Loading/i.test(document.body?.innerText || ""), null, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (route === "/founders") {
      const btn = page.locator('button:has-text("Show quiet")').first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }
    const found = await page.evaluate(
      ({ maxChars, maxWords, canonicalSectors }) => {
        const hits = [];
        const byLower = new Map(canonicalSectors.map((s) => [s.toLowerCase(), s]));

        const chips = document.querySelectorAll("[data-tag-chip]");
        for (const chip of chips) {
          if (chip.closest("[data-tag-chips-measure]")) continue;
          const cs = getComputedStyle(chip);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const r = chip.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          const label = (chip.textContent || "").replace(/\s+/g, " ").trim();
          if (!label || /^\+\d+$/.test(label)) continue;
          const words = label.split(/\s+/).filter(Boolean);
          const ellip =
            (cs.textOverflow === "ellipsis" || cs.overflowX === "hidden" || cs.overflow === "hidden") &&
            chip.scrollWidth > chip.clientWidth + 1;
          const reasons = [];
          if (ellip) reasons.push("ellipsis");
          if (label.length > maxChars) reasons.push(`len:${label.length}`);
          if (/[.!?]$/.test(label)) reasons.push("end-punct");
          if (words.length > maxWords) reasons.push(`words:${words.length}`);
          const canon = byLower.get(label.toLowerCase());
          if (canon && canon !== label) reasons.push(`sector-case:${canon}`);
          if (!reasons.length) continue;
          hits.push({ label: label.slice(0, 80), reasons, kind: "chip" });
          if (hits.length >= 25) break;
        }

        // Meta line under company name must use the same canonical sector label as the chip.
        const cards = document.querySelectorAll("[data-corpus-row], [data-directory-card], a[href^='/startup/']");
        for (const card of cards) {
          const pitchEl = card.querySelector("[data-card-pitch], [data-why-here]:not(.sr-only)");
          const sectorEl = card.querySelector("[data-card-sector], [data-field='sector']");
          if (!pitchEl || !sectorEl) continue;
          const pitch = (pitchEl.textContent || "").replace(/\s+/g, " ").trim();
          const sector = (sectorEl.textContent || "").replace(/\s+/g, " ").trim();
          if (!pitch || !sector) continue;
          const canon = byLower.get(sector.toLowerCase()) || sector;
          if (sector !== canon) {
            hits.push({ label: sector.slice(0, 80), reasons: [`chip-not-canonical:${canon}`], kind: "meta", pitch: pitch.slice(0, 100) });
          }
          // Pitch · segments that match a sector case-insensitively must equal the chip/canon form.
          const parts = pitch.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
          for (const part of parts) {
            const partCanon = byLower.get(part.toLowerCase());
            if (!partCanon) continue;
            if (part !== partCanon || part !== sector) {
              hits.push({
                label: part.slice(0, 80),
                reasons: [`meta-sector-mismatch:chip=${sector};canon=${partCanon}`],
                kind: "meta",
                pitch: pitch.slice(0, 100),
              });
            }
          }
          // Leftover auto title-case artifacts that destroy acronyms
          if (/\bSaas\b/.test(pitch) && !/\bSaaS\b/.test(pitch)) {
            hits.push({ label: "Saas", reasons: ["meta-destroyed-acronym:SaaS"], kind: "meta", pitch: pitch.slice(0, 100) });
          }
          if (hits.length >= 40) break;
        }
        return hits;
      },
      { maxChars: MAX_CHARS, maxWords: MAX_WORDS, canonicalSectors: CANONICAL_SECTORS },
    );
    for (const hit of found) {
      fail(`${vp.w}${route} chip-quality "${hit.label}" [${hit.reasons.join(",")}]`, { vp: vp.w, route, ...hit });
    }
    if (!found.length) console.log(`OK ${vp.w}${route}`);
    else console.log(`FAIL ${vp.w}${route} ${found.length}`, found.slice(0, 5).map((h) => h.label));
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(report.ok ? "PASS check-chip-quality" : "FAIL check-chip-quality", { hits: report.hits.length, out: OUT });
process.exit(report.ok ? 0 : 1);
