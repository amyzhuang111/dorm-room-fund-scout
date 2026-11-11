import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Every ingestion step and snapshot generator must read the same database.
// VERCEL is also set during builds, so getDb() otherwise chooses /tmp while
// output tracing packages the older committed seed.
const seed = path.resolve(process.env.CAMPUS_UNIVERSE_DB_PATH || 'data/campus-universe.db');
const output = path.resolve('data/runtime/campus-universe.db');
const canonical = path.resolve('data/campus-universe.db');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalDigest = digest(canonical);
fs.mkdirSync(path.dirname(output), { recursive: true });
if (seed !== output) {
  const staged = output + '.next';
  fs.rmSync(staged, { force: true });
  const source = new Database(seed, { readonly: true, fileMustExist: true });
  try { await source.backup(staged); } finally { source.close(); }
  // These are generated build artifacts, never the committed seed or user data.
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(output + suffix, { force: true });
  fs.renameSync(staged, output);
}
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'corpus:prepare'], {
  stdio: 'inherit',
  env: { ...process.env, CAMPUS_UNIVERSE_DB_PATH: output },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (digest(canonical) !== originalDigest) throw new Error('Build unexpectedly modified the committed seed database');
const db = new Database(output, { fileMustExist: true });
try {
  const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)')[0];
  if (checkpoint.busy) throw new Error('Could not checkpoint the prepared corpus');
  db.pragma('journal_mode = DELETE');
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Prepared corpus failed SQLite quick_check');
} finally { db.close(); }
console.log('Prepared and checkpointed runtime corpus: data/runtime/campus-universe.db');
