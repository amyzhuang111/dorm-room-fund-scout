import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadFounderTable } from "@/lib/domain/founder-table";

export const runtime = "nodejs";

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

/** GET ?campus=univ_penn → named founder rows. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campus = url.searchParams.get("campus")?.trim() || undefined;
  if (!campus) {
    const file = path.join(process.cwd(), "public", "data", "founder-table.json");
    try {
      const body = fs.readFileSync(file);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": CACHE,
        },
      });
    } catch {
      // Precompute has not run (local dev). Fall through to SQLite.
    }
  }
  const rows = loadFounderTable(campus);
  return NextResponse.json(
    { founderCount: rows.length, rows },
    {
      // Data only changes with a deploy (bundled database), and the CDN cache is
      // per deployment, so cache hard and serve stale while revalidating.
      headers: { "Cache-Control": CACHE },
    },
  );
}
