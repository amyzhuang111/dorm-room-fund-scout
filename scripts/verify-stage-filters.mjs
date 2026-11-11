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
    await page.goto(`${origin}/directories/lse`);
    await page.getByRole('heading', { name: 'Venture benchmarks' }).waitFor();
    const lseCards = page.getByRole('list', { name: 'LSE venture rankings', exact: true }).locator(':scope > li');
    assert.equal(await lseCards.count(), 142);
    assert.equal(new Set(await lseCards.locator('a[href^="/startup/"]').evaluateAll(links => links.map(a => a.getAttribute('href')))).size, 142, 'Each directory company appears once');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'LSE directory fits mobile and desktop');
    await page.getByLabel('Benchmark tier', { exact: true }).selectOption('B');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.waitForURL(/tier=B/);
    assert.equal(await page.getByRole('list', { name: 'LSE venture rankings', exact: true }).locator(':scope > li').count(), 6);
    const lseDownloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export this view as CSV', exact: true }).click();
    const lseDownload = await lseDownloadPromise;
    const lseStream = await lseDownload.createReadStream();
    let lseCsv = '';
    for await (const chunk of lseStream) lseCsv += chunk;
    assert.equal(lseCsv.trim().split('\r\n').length, 7, 'CSV contains exactly six filtered companies plus header');
    await page.getByRole('list', { name: 'LSE venture rankings', exact: true }).locator(':scope > li').first().getByText('Ratings & source evidence', { exact: true }).click();
    await page.getByRole('list', { name: 'LSE venture rankings', exact: true }).locator(':scope > li').first().getByRole('link', { name: 'Public company profile', exact: true }).waitFor();
    await page.getByRole('list', { name: 'LSE venture rankings', exact: true }).locator(':scope > li').first().locator('a[href^="/startup/"]').click();
    await page.waitForURL(/\/startup\//);
    await page.getByText('Seven-factor breakdown', { exact: true }).first().waitFor();
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
