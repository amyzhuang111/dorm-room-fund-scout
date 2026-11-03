/**
 * Sourced list from the official Georgia Tech CREATE-X 2026 Demo Day table.
 *
 * Import preserves the individual company name, source URL, industry and
 * optional short factual description, but does NOT fabricate founders or
 * treat demo-day participation as proof of Georgia Tech enrollment.
 *
 * npm run build:createx:2026
 * or:
 * npx tsx scripts/ingest/build-createx-2026.ts data/imports/v3-campus-founders-batch30-createx-demo-2026.json
 */
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const SOURCE_URLS = [
  "https://create-x.gatech.edu/2026-demo-day",
  "https://startupsummer.gatech.edu/2026-demo-day",
];
const DEST = process.argv[2] || "data/imports/v3-campus-founders-batch30-createx-demo-2026.json";

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\u200b/g, "").trim();
}
function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function shortDescription(text: string): string | null {
  const s = tidy(text).replace(/^(?:Description|Company description):\s*/i, "");
  if (s.length < 10) return null;
  const cut = s.slice(0, 170);
  return s.length > 170 ? cut.slice(0, Math.max(65, cut.lastIndexOf(" "))).trim() : cut;
}
async function main() {
  let content = "";
  let fetchedUrl = "";
  for (const url of SOURCE_URLS) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "CampusScout/0.2 (research; verified source and dedup)", accept: "text/html" },
      });
      if (!response.ok) continue;
      const body = await response.text();
      if (body.length > 10000 && /CREATE-X|Demo Day/i.test(body)) {
        content = body;
        fetchedUrl = url;
        break;
      }
    } catch (err) {
      console.log(`CREATE-X source fetch failed: ${url} ${String(err)}`);
    }
  }
  if (!content) throw new Error("Could not fetch 2026 CREATE-X public roster");
  const $ = cheerio.load(content);
  type Row = {name:string;description:string|null;industry:string|null;booth:string|null};
  const rows: Row[] = [];
  $("table").each((_, table) => {
    let nameIndex = 0, descriptionIndex = 2, industryIndex = 3, boothIndex = 4;
    const headers = $(table).find("tr").first().find("th,td").map((_, cell) => tidy($(cell).text()).toLowerCase()).get();
    if (headers.length) {
      const ix = (substr: string) => headers.findIndex(h => h.includes(substr));
      if (ix("company") >= 0) nameIndex = ix("company");
      if (ix("description") >= 0) descriptionIndex = ix("description");
      if (ix("industry") >= 0) industryIndex = ix("industry");
      if (ix("booth") >= 0) boothIndex = ix("booth");
    }
    $(table).find("tr").each((_, tr) => {
      const cells = $(tr).children("td").map((_, td) => tidy($(td).text())).get();
      if (cells.length < 3) return;
      const name = cells[nameIndex] || "";
      const description = shortDescription(cells[descriptionIndex] || "");
      const industry = tidy(cells[industryIndex] || "").replace(/^Industry:\s*/i, "") || null;
      const booth = tidy(cells[boothIndex] || "").replace(/^Booth:\s*/i, "") || null;
      if (!name || !description || name.length > 125 || /^company|^not present$/i.test(name)) return;
      rows.push({name,description,industry,booth});
    });
  });
  // Some official deployments use div-based CMS cards rather than tables.
  // Fail closed: never infer a roster by parsing every heading on the page.
  const seen = new Set<string>();
  const distinct = rows.filter(r => {
    const k=norm(r.name);
    if (k.length < 3 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(JSON.stringify({source:fetchedUrl,htmlBytes:content.length,tables:$("table").length,rawRows:rows.length,companies:distinct.length,firstFive:distinct.slice(0,5).map(r=>r.name)},null,2));
  if (distinct.length < 65) throw new Error(`CREATE-X parse yielded only ${distinct.length} valid companies. Page structure changed: check table selectors rather than invent data.`);
  const data = {
    retrievedAt: new Date().toISOString(),
    companies: distinct.map(row => ({
      name:row.name,
      description: row.description,
      website:null,
      sourceUrl:fetchedUrl,
      excerpt:`Georgia Tech CREATE-X 2026 Demo Day official company listing: ${row.name}${row.industry?` (industry: ${row.industry})`:""}${row.booth?`, booth ${row.booth}`:""}. ${row.description || ""}`,
      orgPlace:"Georgia Tech CREATE-X Startup Launch 2026",
      campusIds:["univ_gatech"],
      verificationStatus:"confirmed",
      founders:[],
    })),
    potential:[],
    links:[],
  };
  fs.mkdirSync(path.dirname(DEST), {recursive:true});
  fs.writeFileSync(DEST,JSON.stringify(data,null,2)+"\n");
  console.log(`Wrote ${distinct.length} sourced CREATE-X companies to ${DEST}; founder names not asserted.`);
}
main().catch(err=>{console.error(err);process.exit(1)});
