import { NextResponse } from "next/server";
import { loadFounderTable, loadProjectRows } from "@/lib/domain/founder-table";

export const runtime = "nodejs";

/** GET ?campus=univ_penn → founder cards (+ legacy project rows). HTML stays under 210 KB. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campus = url.searchParams.get("campus")?.trim() || undefined;
  const founders = loadFounderTable(campus);
  const rows = loadProjectRows(campus);
  return NextResponse.json(
    { founderCount: founders.length, founders, rows },
    {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
