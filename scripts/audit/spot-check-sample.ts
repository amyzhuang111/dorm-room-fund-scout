// Deterministic spot check of 50 people and 50 companies against a stored source URL.
// Re-runnable. A blocked or short page does not change a row. A 404, or a long
// page that never names the entity, marks it unverified. Nothing is deleted.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "../../lib/db/client";

const CHECKED_ON = "2026-09-27";
const CACHE = "/tmp/campus-scout-url-cache";
const SAMPLE = 50;
const LEGAL = new Set(["incorporated", "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "gmbh", "pbc", "plc", "llp"]);

type Row = { id: string; name: string; url: string; verification_status: string | null; table: "people" | "projects" };

function auditId(key: string): string {
  return `audit_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

function pick(rows: Row[]): Row[] {
  return [...rows]
    .sort((a, b) => crypto.createHash("sha256").update(a.id).digest("hex").localeCompare(crypto.createHash("sha256").update(b.id).digest("hex")))
    .slice(0, SAMPLE);
}

function tokensOf(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token !== "the" && !LEGAL.has(token));
}

function namesEntity(name: string, text: string): boolean | null {
  const tokens = tokensOf(name);
  const significant = tokens.filter((token) => token.length >= 4);
  const needed = significant.length > 0 ? significant : tokens.filter((token) => token.length >= 3);
  if (needed.length === 0) return null;
  const hay = text.toLowerCase();
  return needed.every((token) => hay.includes(token));
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250000);
}

function isPdf(text: string): boolean {
  return text.startsWith("%PDF") || text.slice(0, 20).includes("%PDF");
}

function inconclusive(text: string): boolean {
  const lower = text.toLowerCase();
  if (text.length < 200) return true;
  return ["just a moment", "captcha", "access denied", "enable javascript", "attention required"].some((phrase) => lower.includes(phrase)) && text.length < 1500;
}

async function fetchCached(url: string): Promise<{ status: number; text: string; error?: string }> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash("sha256").update(`${url}|v2`).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as { status: number; text: string; error?: string };
  let result: { status: number; text: string; error?: string };
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 CampusScoutAudit/1.0" },
    });
    const raw = await response.text();
    result = { status: response.status, text: strip(raw) };
  } catch (error) {
    result = { status: 0, text: "", error: error instanceof Error ? error.message : "fetch failed" };
  }
  fs.writeFileSync(file, JSON.stringify(result));
  return result;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

async function main() {
  const db = getDb();
  const people = db
    .prepare(
      `SELECT id, name, verification_status, url FROM (
         SELECT p.id, p.name, p.verification_status,
           (SELECT c.source_url FROM claims c
            WHERE c.entity_type = 'person' AND c.entity_id = p.id AND c.source_url LIKE 'http%'
            ORDER BY c.retrieved_at DESC LIMIT 1) AS url
         FROM people p
       ) WHERE url IS NOT NULL`
    )
    .all() as { id: string; name: string; verification_status: string | null; url: string }[];
  const companies = db
    .prepare(
      `SELECT id, name, verification_status, website_url AS url FROM projects
       WHERE kind = 'company' AND website_url LIKE 'http%'`
    )
    .all() as { id: string; name: string; verification_status: string | null; url: string }[];

  const sample: Row[] = [
    ...pick(people.map((row) => ({ ...row, table: "people" as const }))),
    ...pick(companies.map((row) => ({ ...row, table: "projects" as const }))),
  ];

  const summary = { checked: sample.length, confirmed: 0, unverified: 0, inconclusive: 0, unchanged: 0 };

  await mapPool(sample, 8, async (row) => {
    const site = host(row.url);
    if (site === "linkedin.com" || site.endsWith(".linkedin.com")) {
      summary.inconclusive += 1;
      return;
    }
    const fetched = await fetchCached(row.url);
    if (isPdf(fetched.text)) {
      if (row.verification_status === "unverified") {
        const prior = db
          .prepare(`SELECT old_value FROM accuracy_audit WHERE idempotency_key = ?`)
          .get(`spot:${row.table}:${row.id}:unverified`) as { old_value: string | null } | undefined;
        if (prior?.old_value && prior.old_value !== "unverified") {
          const reason = `Spot check restored ${prior.old_value}: ${row.url} is a PDF, so the page text could not be read.`;
          const key = `spot-restore:${row.table}:${row.id}`;
          if (row.table === "people") {
            db.prepare(`UPDATE people SET verification_status = ?, last_verified_at = ?, verification_note = ? WHERE id = ?`).run(prior.old_value, CHECKED_ON, reason, row.id);
          } else {
            db.prepare(`UPDATE projects SET verification_status = ?, last_verified_at = ?, verification_note = ?, updated_at = ? WHERE id = ?`).run(
              prior.old_value,
              CHECKED_ON,
              reason,
              nowIso(),
              row.id
            );
          }
          db.prepare(
            `INSERT OR IGNORE INTO accuracy_audit (id, entity_type, entity_id, action, field, old_value, new_value, reason, evidence_url, checked_at, idempotency_key)
             VALUES (?, ?, ?, 'fix', 'verification_status', 'unverified', ?, ?, ?, ?, ?)`
          ).run(auditId(key), row.table === "people" ? "person" : "project", row.id, prior.old_value, reason, row.url, CHECKED_ON, key);
          summary.unchanged += 1;
          return;
        }
      }
      summary.inconclusive += 1;
      return;
    }
    let next: "confirmed" | "unverified" | null = null;
    let reason = "";
    if (fetched.status === 404 || fetched.status === 410) {
      next = "unverified";
      reason = `Spot check: ${row.url} returned ${fetched.status}.`;
    } else if (fetched.status === 200 && !inconclusive(fetched.text)) {
      const named = namesEntity(row.name, fetched.text);
      if (named === true) {
        next = "confirmed";
        reason = `Spot check: ${row.url} returned 200 and names ${row.name}.`;
      } else if (named === false && fetched.text.length >= 800) {
        next = "unverified";
        reason = `Spot check: ${row.url} returned 200 and the page text does not name ${row.name}.`;
      }
    }
    if (!next) {
      summary.inconclusive += 1;
      return;
    }
    if (row.verification_status === next) {
      summary.unchanged += 1;
      return;
    }
    if (next === "confirmed" && row.verification_status && row.verification_status !== "unverified") {
      summary.unchanged += 1;
      return;
    }
    const key = `spot:${row.table}:${row.id}:${next}`;
    const update =
      row.table === "people"
        ? `UPDATE people SET verification_status = ?, last_verified_at = ?, verification_note = ? WHERE id = ?`
        : `UPDATE projects SET verification_status = ?, last_verified_at = ?, verification_note = ?, updated_at = ? WHERE id = ?`;
    if (row.table === "people") db.prepare(update).run(next, CHECKED_ON, reason, row.id);
    else db.prepare(update).run(next, CHECKED_ON, reason, nowIso(), row.id);
    db.prepare(
      `INSERT OR IGNORE INTO accuracy_audit (id, entity_type, entity_id, action, field, old_value, new_value, reason, evidence_url, checked_at, idempotency_key)
       VALUES (?, ?, ?, 'fix', 'verification_status', ?, ?, ?, ?, ?, ?)`
    ).run(auditId(key), row.table === "people" ? "person" : "project", row.id, row.verification_status, next, reason, row.url, CHECKED_ON, key);
    if (next === "confirmed") summary.confirmed += 1;
    else summary.unverified += 1;
  });

  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify(summary));
}

main();
