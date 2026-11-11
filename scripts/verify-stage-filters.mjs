import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Runs against the built app on CI. No external accounts or private sources.
const origin = 'http://127.0.0.1:4174';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '4174'], { stdio: 'inherit', env: process.env });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Built app should start');
  const { cards } = await (await fetch(`${origin}/data/sample-directory.json`)).json();
  const seed = cards.filter(company => company.stage === 'Seed');
  assert.ok(seed.length > 0);
  const founders = await (await fetch(`${origin}/data/founders.json`)).json();
  const seedIds = new Set(seed.map(c => c.id));
  const expectedFounders = new Set(founders.filter(f => [...(f.companyIds ?? []), f.companyId].some(id => seedIds.has(id))).map(f => f.id)).size;
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1365, height: 900 }, { width: 375, height: 812 }]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByLabel('Funding stage', { exact: true }).selectOption('Seed');
    await page.waitForURL(/stage=Seed/);
    await page.waitForFunction(({ companies, founders }) => {
      const text = document.querySelector('[aria-label="Current view"]')?.textContent ?? '';
      return text.includes(`${companies} companies`) && text.includes(`${founders} indexed founders`);
    }, { companies: seed.length.toLocaleString('en-US'), founders: expectedFounders.toLocaleString('en-US') });
    const select = await page.getByLabel('Funding stage', { exact: true }).boundingBox();
    assert.ok(select && select.y >= 0 && select.y + select.height <= viewport.height, 'Stage control fits the viewport');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let csv = '';
    for await (const chunk of stream) csv += chunk;
    for (const company of seed) assert.ok(csv.includes(company.name.replaceAll('"', '""')), `CSV includes ${company.name}`);
    const directory = page.getByRole('link', { name: 'Full directory ↗', exact: true });
    assert.ok((await directory.getAttribute('href')).includes('stage=Seed'));
    await directory.click();
    await page.waitForURL(/\/companies\?.*stage=Seed/);
    await page.getByRole('heading', { name: 'Companies', exact: true }).waitFor();
    await context.close();
  }
  const page = await browser.newPage();
  await page.goto(`${origin}/signals/sources?q=LSE`);
  await page.getByRole('link', { name: 'https://startbook.app/events/lse/ventures', exact: true }).waitFor();
  console.log(`Stage browser checks passed: ${seed.length} Seed companies, ${expectedFounders} founders, desktop/mobile control, CSV and directory URL, LSE source link.`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
