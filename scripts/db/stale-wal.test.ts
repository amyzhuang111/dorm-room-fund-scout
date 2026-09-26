// A leftover -wal/-shm from a previous campus-universe.db must not be replayed
// onto the current file. SQLite will otherwise parse a data page as schema and
// throw "malformed database schema (<person id>) - orphan index" while the
// main file still matches the committed bytes. A WAL that belongs to this
// file must still be applied.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import Database from "better-sqlite3";
import { openDatabase } from "../../lib/db/client";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "stale-wal-"));

function rmSidecars(dbPath: string) {
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(dbPath + suffix, { force: true });
}

function snapshotLiveWal(source: string, dest: string) {
  fs.copyFileSync(source, dest);
  fs.copyFileSync(source + "-wal", dest + "-wal");
  fs.rmSync(dest + "-shm", { force: true });
}

function peopleCount(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare("SELECT count(*) FROM people").pluck().get() as number;
  } finally {
    db.close();
  }
}

function poisonSchemaWal(clean: Buffer, dest: string) {
  // better-sqlite3 and Node 24's node:sqlite open with SQLITE_DBCONFIG_DEFENSIVE,
  // which refuses this insert. CPython's sqlite3 does not, and it can leave the
  // bad schema row in the WAL without checkpointing it into the main file.
  const writer = path.join(root, "poison.py");
  fs.writeFileSync(
    writer,
    `
import shutil, sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
shutil.copyfile(src, dest)
con = sqlite3.connect(dest)
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA wal_autocheckpoint=0")
con.execute("PRAGMA writable_schema=ON")
con.execute("INSERT INTO sqlite_master (type, name, tbl_name, rootpage, sql) VALUES ('index', 'person_JnrZGMsft6bk', 'people', 9, NULL)")
con.commit()
clean_db, clean_wal = dest + ".clean", dest + "-wal.clean"
shutil.copyfile(dest, clean_db)
shutil.copyfile(dest + "-wal", clean_wal)
con.close()
shutil.copyfile(clean_db, dest)
shutil.copyfile(clean_wal, dest + "-wal")
`
  );
  fs.writeFileSync(dest + ".src", clean);
  execFileSync("python3", [writer, dest + ".src", dest], { encoding: "utf8" });
  fs.rmSync(dest + "-shm", { force: true });
  assert.equal(fs.readFileSync(dest).equals(clean), true);
  assert.ok(fs.statSync(dest + "-wal").size > 32);
}

function assertRawOpenFails(dbPath: string) {
  const db = new Database(dbPath);
  try {
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    assert.fail("expected the stale WAL to fail schema load");
  } catch (err) {
    assert.match(
      err instanceof Error ? err.message : String(err),
      /malformed database schema \(person_JnrZGMsft6bk\) - orphan index/
    );
  } finally {
    try {
      db.close();
    } catch {
      // close checkpoints the bad WAL; the caller restores the clean bytes
    }
  }
}

function main() {
  const bundled = path.join(process.cwd(), "data", "campus-universe.db");
  const bundledHash = fs.readFileSync(bundled);
  const clean = Buffer.from(bundledHash);
  const expectedPeople = peopleCount(bundled);

  const poisoned = path.join(root, "poisoned.db");
  poisonSchemaWal(clean, poisoned);
  assertRawOpenFails(poisoned);
  // The failed connection checkpoints on close. Put the clean bytes and the
  // original poison WAL back, which is the state on disk before any open.
  poisonSchemaWal(clean, poisoned);

  const warnings: string[] = [];
  const previousWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  let recovered: Database.Database;
  try {
    recovered = openDatabase(poisoned);
  } finally {
    console.warn = previousWarn;
  }
  try {
    assert.equal(recovered.prepare("SELECT count(*) FROM people").pluck().get(), expectedPeople);
    assert.equal(
      recovered.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'person_JnrZGMsft6bk'").pluck().get(),
      0
    );
    assert.equal(recovered.prepare("PRAGMA integrity_check").pluck().get(), "ok");
    assert.equal(recovered.prepare("PRAGMA quick_check").pluck().get(), "ok");
  } finally {
    recovered.close();
  }
  assert.equal(fs.readFileSync(poisoned).equals(clean), true);
  assert.equal(fs.existsSync(poisoned + "-wal"), false);
  assert.match(warnings.join("\n"), /malformed database schema \(person_JnrZGMsft6bk\) - orphan index/);

  // A WAL that belongs to this file still has to replay.
  const live = path.join(root, "live.db");
  const liveDb = new DatabaseSync(live);
  liveDb.exec("PRAGMA journal_mode = WAL");
  liveDb.exec("PRAGMA wal_autocheckpoint = 0");
  liveDb.exec("CREATE TABLE kept (id INTEGER PRIMARY KEY, note TEXT)");
  liveDb.exec("INSERT INTO kept VALUES (1, 'checkpointed')");
  liveDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  liveDb.exec("INSERT INTO kept VALUES (2, 'only-in-wal')");
  const good = path.join(root, "good-wal.db");
  snapshotLiveWal(live, good);
  liveDb.close();
  const kept = openDatabase(good);
  try {
    const notes = kept.prepare("SELECT note FROM kept ORDER BY id").pluck().all();
    assert.deepEqual(notes, ["checkpointed", "only-in-wal"]);
  } finally {
    kept.close();
  }

  // No sidecar: open the committed file read-only through the same helper's
  // plain path by copying it with no wal. integrity_check must stay ok.
  const plain = path.join(root, "plain.db");
  fs.copyFileSync(bundled, plain);
  const plainDb = openDatabase(plain);
  try {
    assert.equal(plainDb.prepare("PRAGMA integrity_check").pluck().get(), "ok");
    assert.equal(plainDb.prepare("SELECT count(*) FROM people").pluck().get(), expectedPeople);
  } finally {
    plainDb.close();
  }

  // The lookup script enters through getDb(), which must recover too.
  // getDb() also re-applies schema.sql, so the file bytes may change; row
  // counts and integrity are the invariants.
  const viaGetDb = path.join(root, "via-getdb.db");
  poisonSchemaWal(clean, viaGetDb);
  const probeFile = path.join(root, "probe-getdb.ts");
  fs.writeFileSync(
    probeFile,
    `
      import { getDb } from ${JSON.stringify(path.join(process.cwd(), "lib", "db", "client.ts"))};
      const db = getDb();
      const people = db.prepare("SELECT count(*) FROM people").pluck().get();
      const orphan = db.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'person_JnrZGMsft6bk'").pluck().get();
      const integrity = db.prepare("PRAGMA integrity_check").pluck().get();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
      const counts: Record<string, number> = {};
      for (const table of tables) counts[table] = db.prepare(\`SELECT count(*) FROM \${table}\`).pluck().get() as number;
      console.log(JSON.stringify({ people, orphan, integrity, counts }));
    `
  );
  const probe = execFileSync(process.execPath, ["--experimental-sqlite", "--import", "tsx", probeFile], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CAMPUS_UNIVERSE_DB_PATH: viaGetDb },
  });
  const parsed = JSON.parse(probe.trim().split("\n").at(-1) as string);
  assert.equal(parsed.people, expectedPeople);
  assert.equal(parsed.orphan, 0);
  assert.equal(parsed.integrity, "ok");
  const baseline = new Database(path.join(root, "plain.db"), { readonly: true, fileMustExist: true });
  try {
    const tables = baseline
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .pluck()
      .all() as string[];
    for (const table of tables) {
      const before = baseline.prepare(`SELECT count(*) FROM ${table}`).pluck().get();
      assert.equal(parsed.counts[table], before, table);
    }
  } finally {
    baseline.close();
  }
  assert.equal(fs.readFileSync(bundled).equals(bundledHash), true);

  fs.rmSync(root, { recursive: true, force: true });
  console.log("stale-wal tests passed");
}

main();
