import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applyRecoveredRows } from "./recovered-lib";

const db = new Database(":memory:");
db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, kind TEXT, extra TEXT DEFAULT 'dflt')`);
db.exec(`CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`);
db.prepare(`INSERT INTO projects (id, name, kind) VALUES ('p1', 'ExistingChanged', 'company')`).run();

const data = {
  tables: {
    // 'removed_col' does not exist in the target schema and must be ignored.
    projects: { columns: ["id", "name", "kind", "removed_col"], rows: [["p1", "SHOULD NOT OVERWRITE", "company", "x"], ["p2", "New", "company", "x"]] },
    people: { columns: ["id", "name"], rows: [["a", "Ann"], ["b", "Bob"]] },
    claims: { columns: ["id"], rows: [["c1"]] }, // table absent: ignored
  },
};
let r = applyRecoveredRows(db, data, true);
assert.equal(r.inserted, 3, "dry run counts new rows only");
assert.equal((db.prepare(`SELECT COUNT(*) n FROM people`).get() as { n: number }).n, 0, "dry run changes nothing");
r = applyRecoveredRows(db, data);
assert.equal(r.inserted, 3);
assert.deepEqual(db.prepare(`SELECT name FROM projects WHERE id='p1'`).get(), { name: "ExistingChanged" }, "existing rows are never modified");
assert.deepEqual(db.prepare(`SELECT name, extra FROM projects WHERE id='p2'`).get(), { name: "New", extra: "dflt" });
r = applyRecoveredRows(db, data);
assert.equal(r.inserted, 0, "idempotent");
console.log("recovered-lib tests ok");


// Concurrent recoveries must respect reviewed redirects and retarget dependent evidence.
db.exec("CREATE TABLE entity_redirects (old_id TEXT PRIMARY KEY,survivor_id TEXT); CREATE TABLE claims(id TEXT PRIMARY KEY,entity_id TEXT,value_json TEXT)");
db.prepare('INSERT INTO entity_redirects VALUES (?,?)').run('p-old','p1');
r=applyRecoveredRows(db,{tables:{projects:{columns:['id','name'],rows:[['p-old','Old duplicate']]},claims:{columns:['id','entity_id','value_json'],rows:[['c2','p-old','{"projectId":"p-old"}']]}}});
assert.equal(db.prepare("SELECT 1 FROM projects WHERE id='p-old'").get(),undefined);
assert.deepEqual(db.prepare("SELECT entity_id,value_json FROM claims WHERE id='c2'").get(),{entity_id:'p1',value_json:'{"projectId":"p1"}'});
assert.equal(r.inserted,1);
console.log('Recovery respects identity redirects.');

// A refreshed article can have the same unique URL key and a new primary key.
// Its recovered mentions must point to the current article, without replacing it.
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE news_articles (id TEXT PRIMARY KEY, url_key TEXT UNIQUE, headline TEXT);
  CREATE TABLE news_mentions (id TEXT PRIMARY KEY, article_id TEXT REFERENCES news_articles(id), project_id TEXT);
  INSERT INTO news_articles VALUES ('news-current', 'same-story', 'Current headline');
`);
const newsRecovery = { tables: {
  news_articles: { columns: ["id", "url_key", "headline"], rows: [["news-old", "same-story", "Old headline"], ["news-new", "new-story", "New headline"]] },
  news_mentions: { columns: ["id", "article_id", "project_id"], rows: [["mention-old", "news-old", "p1"], ["mention-new", "news-new", "p2"]] },
} };
assert.equal(applyRecoveredRows(db, newsRecovery, true).inserted, 3);
assert.equal((db.prepare("SELECT COUNT(*) n FROM news_mentions").get() as { n: number }).n, 0);
assert.equal(applyRecoveredRows(db, newsRecovery).inserted, 3);
assert.deepEqual(db.prepare("SELECT article_id FROM news_mentions WHERE id='mention-old'").get(), { article_id: "news-current" });
assert.deepEqual(db.prepare("SELECT headline FROM news_articles WHERE id='news-current'").get(), { headline: "Current headline" });
assert.equal(applyRecoveredRows(db, newsRecovery).inserted, 0);
assert.deepEqual(db.pragma("foreign_key_check"), []);
console.log("Recovery preserves refreshed news articles and relinks historical mentions.");
