import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { linkedinFromAliases } from "@/lib/domain/queries";

export const runtime = "nodejs";

/** GET ?ids=proj_a,proj_b → { [projectId]: { name, linkedinUrl }[] } for confirmed LinkedIn only. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  if (ids.length === 0) return NextResponse.json({});

  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT r.project_id as projectId, p.name as name, p.aliases_json as aliasesJson
         FROM person_project_roles r
         JOIN people p ON p.id = r.person_id
        WHERE r.project_id IN (${placeholders})
          AND trim(p.name) != ''`,
    )
    .all(...ids) as { projectId: string; name: string; aliasesJson: string | null }[];

  const out: Record<string, { name: string; linkedinUrl: string }[]> = {};
  for (const row of rows) {
    const linkedinUrl = linkedinFromAliases(row.aliasesJson);
    if (!linkedinUrl) continue;
    const list = out[row.projectId] ?? (out[row.projectId] = []);
    if (list.some((f) => f.linkedinUrl === linkedinUrl)) continue;
    list.push({ name: row.name, linkedinUrl });
  }
  return NextResponse.json(out);
}
