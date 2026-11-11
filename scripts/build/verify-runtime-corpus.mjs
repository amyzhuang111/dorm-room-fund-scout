import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const artifact = path.resolve('data/runtime/campus-universe.db');
assert.ok(fs.existsSync(artifact), 'Prepared runtime database exists');
for (const route of ['app/directories/lse/page.js.nft.json', 'app/api/directories/lse/export/route.js.nft.json']) {
  const tracePath = path.resolve('.next/server', route);
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  assert.ok(trace.files.some(file => path.resolve(path.dirname(tracePath), file) === artifact),
    'Serverless output trace includes the prepared corpus: ' + route);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-runtime-check-'));
const copied = path.join(temp, 'cold-start.db');
try {
  assert.equal(fs.existsSync(copied), false);
  const env = { ...process.env, VERCEL: '1', CAMPUS_UNIVERSE_DB_PATH: copied };
  for (const script of ['lib/domain/lse-directory.test.ts', 'lib/domain/count-consistency.test.ts']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script], { stdio: 'inherit', env });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Cold-start database matches directory and published totals: ' + script);
  }
  assert.ok(fs.existsSync(copied), 'Runtime copied the bundled database into a fresh writable location');
  console.log('Serverless corpus tracing, fresh-start import and published count parity passed.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
