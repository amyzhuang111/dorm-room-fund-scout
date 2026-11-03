/**
 * Roll back false websites and false Accelerator stages from the extend pass.
 * Re-derive stage from investor detail.round when present.
 */
import { getDb, newId, nowIso } from "../../lib/db/client";

const BAD_HOST =
  /(?:pod\.co|deloitte\.com|midwestentrepreneurship\.org|innovatebu\.app|grepbeat\.com|thegarage\.|city\.yale|linkedin\.com|crunchbase\.com|ycombinator\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|github\.com|medium\.com|substack\.com|luma\.com|notion\.site|squarespace\.com|wixsite\.com|linktr\.ee|bit\.ly|eventbrite\.com)/i;

const SIBLING_COLLISION = new Map<string, string>([
  // projectId -> wrong website to clear when evidence was shared page
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function companyToken(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8);
}

function main() {
  const db = getDb();
  const retrievedAt = nowIso();
  const inv = db
    .prepare(`SELECT id, name, website_url FROM projects WHERE kind='company' AND is_investable_candidate=1`)
    .all() as { id: string; name: string; website_url: string | null }[];

  let clearedWebFacts = 0;
  let clearedWebCol = 0;
  let clearedStages = 0;
  let wroteStages = 0;

  const delFact = db.prepare(`DELETE FROM company_facts WHERE id=?`);
  const clearWeb = db.prepare(`UPDATE projects SET website_url=NULL WHERE id=?`);
  const insertFact = db.prepare(
    `INSERT INTO company_facts (id, project_id, fact_key, value_text, amount_usd, amount_status, detail_json, source_url, excerpt, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const websiteFacts = db
    .prepare(
      `SELECT id, project_id, value_text, source_url, origin, created_at FROM company_facts WHERE fact_key='website'`
    )
    .all() as { id: string; project_id: string; value_text: string; source_url: string; origin: string; created_at: string }[];

  const nameById = new Map(inv.map((c) => [c.id, c.name]));

  const tx = db.transaction(() => {
    // Clear bad websites from extend pass
    for (const f of websiteFacts) {
      if (!nameById.has(f.project_id)) continue;
      const host = hostOf(f.value_text);
      if (!host) continue;
      const name = nameById.get(f.project_id)!;
      const token = companyToken(name);
      const hostCompact = host.replace(/[^a-z0-9]+/g, "");
      const badHost = BAD_HOST.test(host) || BAD_HOST.test(f.value_text);
      const fromPress = f.origin === "press" || /thegarage|city\.yale|grepbeat|\.edu|bu\.edu|cmu\.edu|illinois/i.test(f.source_url);
      const nameMismatch =
        fromPress &&
        token.length >= 4 &&
        !hostCompact.includes(token.slice(0, Math.min(5, token.length))) &&
        !f.value_text.toLowerCase().includes(name.toLowerCase().slice(0, 5));

      // Shared VentureCat page linked hapte.ai onto HydroFlo/Edgeline
      const hapteCollision =
        hostCompact.includes("hapte") && !/hapte/i.test(name) && /thegarage\.northwestern/i.test(f.source_url);

      if (badHost || nameMismatch || hapteCollision) {
        delFact.run(f.id);
        clearedWebFacts += 1;
        const proj = inv.find((c) => c.id === f.project_id);
        if (proj?.website_url && hostOf(proj.website_url) === host) {
          clearWeb.run(f.project_id);
          clearedWebCol += 1;
        }
      }
    }

    // Clear false Accelerator stages that are NOT from investor-derived facts
    const stageRows = db
      .prepare(`SELECT id, project_id, value_text, detail_json, source_url, origin, excerpt FROM company_facts WHERE fact_key='funding_round'`)
      .all() as {
      id: string;
      project_id: string;
      value_text: string;
      detail_json: string;
      source_url: string;
      origin: string;
      excerpt: string;
    }[];

    const hasStage = new Set<string>();
    for (const row of stageRows) {
      if (!nameById.has(row.project_id)) continue;
      let stage = "";
      try {
        stage = String((JSON.parse(row.detail_json || "{}") as { stage?: string }).stage || "");
      } catch {
        continue;
      }
      if (!stage) continue;

      const falseAccel =
        stage === "Accelerator" &&
        row.origin !== "yc_page" &&
        !/ycombinator\.com|pear\.vc\/pearx|speedrun|a16z\.com|techstars|hf0\.com|southparkcommons/i.test(row.source_url) &&
        !/\b(y combinator|yc\b|speedrun|pearx|techstars)\b/i.test(`${row.value_text} ${row.excerpt}`);

      // Investor-derived Accelerator with fromInvestor PearX is OK only if no Series A also on file — handle below
      const fromInvestorPearXOnly =
        stage === "Accelerator" && /fromInvestor.:.PearX/i.test(row.detail_json || "") ;

      if (falseAccel && !/fromInvestor/i.test(row.detail_json || "")) {
        delFact.run(row.id);
        clearedStages += 1;
        continue;
      }
      if (fromInvestorPearXOnly) {
        // Prefer Series A from investor detail if present; drop PearX accelerator for now and re-add
        delFact.run(row.id);
        clearedStages += 1;
        continue;
      }
      hasStage.add(row.project_id);
    }

    // Re-derive stage from investor detail.round / value_text
    const investors = db
      .prepare(`SELECT project_id, value_text, detail_json, source_url, excerpt FROM company_facts WHERE fact_key='investor'`)
      .all() as { project_id: string; value_text: string; detail_json: string; source_url: string; excerpt: string }[];

    const bestStage = new Map<string, { stage: string; sourceUrl: string; excerpt: string; value: string }>();
    const rank: Record<string, number> = {
      "Series C": 6,
      "Series B": 5,
      "Series A": 4,
      Seed: 3,
      "Pre-seed": 2,
      Accelerator: 1,
    };

    for (const row of investors) {
      if (!nameById.has(row.project_id)) continue;
      let round = "";
      try {
        round = String((JSON.parse(row.detail_json || "{}") as { round?: string }).round || "");
      } catch {
        round = "";
      }
      const blob = `${row.value_text} ${round}`.toLowerCase();
      let stage = "";
      if (/series\s*c\b/.test(blob)) stage = "Series C";
      else if (/series\s*b\b/.test(blob)) stage = "Series B";
      else if (/series\s*a\b/.test(blob)) stage = "Series A";
      else if (/\bseed\b/.test(blob) && !/pre[-\s]?seed/.test(blob)) stage = "Seed";
      else if (/pre[-\s]?seed/.test(blob)) stage = "Pre-seed";
      else if (/\by\s*combinator\b|\byc\b|speedrun|techstars/.test(blob)) stage = "Accelerator";
      else if (/pearx/.test(blob)) stage = "Accelerator";
      if (!stage) continue;
      const prev = bestStage.get(row.project_id);
      if (!prev || (rank[stage] || 0) > (rank[prev.stage] || 0)) {
        bestStage.set(row.project_id, {
          stage,
          sourceUrl: row.source_url,
          excerpt: (row.excerpt || row.value_text).slice(0, 400),
          value: row.value_text,
        });
      }
    }

    for (const [projectId, info] of bestStage) {
      if (hasStage.has(projectId)) continue;
      // Check remaining stages after deletes
      const rows = db
        .prepare(`SELECT detail_json FROM company_facts WHERE project_id=? AND fact_key='funding_round'`)
        .all(projectId) as { detail_json: string }[];
      const already = rows.some((r) => {
        try {
          const d = JSON.parse(r.detail_json || "{}");
          return typeof d.stage === "string" && d.stage.trim();
        } catch {
          return false;
        }
      });
      if (already) continue;
      insertFact.run(
        newId("fact"),
        projectId,
        "funding_round",
        `${info.stage}|${info.value}`,
        null,
        null,
        JSON.stringify({ stage: info.stage, fromInvestor: info.value }),
        info.sourceUrl,
        info.excerpt,
        "existing_claim",
        retrievedAt
      );
      wroteStages += 1;
      hasStage.add(projectId);
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(JSON.stringify({ clearedWebFacts, clearedWebCol, clearedStages, wroteStages }, null, 2));
}

main();
