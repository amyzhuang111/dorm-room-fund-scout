/**
 * Store a favicon URL for each company that already has a website fact and no logo/favicon.
 * The favicon is the public Google favicon for that website's host. Source is the website URL.
 * Never invents a brand mark for a company without a website on file.
 */
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import path from "node:path";

const DB = path.join(process.cwd(), "data", "campus-universe.db");

function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function hostOf(website: string): string | null {
  try {
    const url = new URL(website);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || host === "localhost") return null;
    return host;
  } catch {
    return null;
  }
}

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function main() {
  const db = new Database(DB);
  db.pragma("journal_mode = WAL");
  const websites = db
    .prepare(
      `SELECT project_id, value_text, source_url
       FROM company_facts
       WHERE fact_key = 'website'
         AND value_text LIKE 'http%'
       ORDER BY created_at ASC`,
    )
    .all() as { project_id: string; value_text: string; source_url: string | null }[];

  const hasLogo = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT project_id FROM company_facts
           WHERE fact_key IN ('logo','favicon','logo_url','favicon_url')`,
        )
        .all() as { project_id: string }[]
    ).map((row) => row.project_id),
  );

  const insert = db.prepare(
    `INSERT INTO company_facts (
      id, project_id, fact_key, value_text, amount_usd, amount_status,
      detail_json, source_url, excerpt, origin, created_at
    ) VALUES (
      @id, @project_id, 'favicon', @value_text, NULL, NULL,
      @detail_json, @source_url, @excerpt, 'website-favicon', datetime('now')
    )`,
  );

  let added = 0;
  let skippedHasLogo = 0;
  let skippedBadHost = 0;
  const seen = new Set<string>();

  const tx = db.transaction(() => {
    for (const row of websites) {
      if (hasLogo.has(row.project_id) || seen.has(row.project_id)) {
        skippedHasLogo += 1;
        continue;
      }
      const host = hostOf(row.value_text);
      if (!host) {
        skippedBadHost += 1;
        continue;
      }
      const value = faviconUrl(host);
      insert.run({
        id: id("cf"),
        project_id: row.project_id,
        value_text: value,
        detail_json: JSON.stringify({ host, resolver: "google-s2-favicons", fromWebsite: row.value_text }),
        source_url: row.source_url || row.value_text,
        excerpt: `Favicon for ${host}, taken from the stored website ${row.value_text}.`,
      });
      seen.add(row.project_id);
      hasLogo.add(row.project_id);
      added += 1;
    }
  });
  tx();

  const logos = db
    .prepare(
      `SELECT COUNT(*) AS n FROM company_facts WHERE fact_key IN ('logo','favicon','logo_url','favicon_url')`,
    )
    .get() as { n: number };

  console.log(
    JSON.stringify(
      {
        websites: websites.length,
        added,
        skippedHasLogo,
        skippedBadHost,
        faviconFacts: logos.n,
      },
      null,
      2,
    ),
  );
}

main();
