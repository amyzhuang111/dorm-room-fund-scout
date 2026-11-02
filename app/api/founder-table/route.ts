import { NextResponse } from "next/server";
import { loadFounderTable, loadProjectRows } from "@/lib/domain/founder-table";

export const runtime = "nodejs";

/** GET ?campus=univ_penn → project rows for DataTable (keeps /founders HTML under 210 KB). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const campus = url.searchParams.get("campus")?.trim() || undefined;
  const founders = loadFounderTable(campus);
  const rows = loadProjectRows(campus);
  return NextResponse.json({
    founderCount: founders.length,
    rows,
  });
}
