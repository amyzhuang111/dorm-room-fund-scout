import { buildDirectoryFromDb } from "@/lib/domain/directory";

export const dynamic = "force-dynamic";

/** Same company cards as public/data/sample-directory.json, built from the open database. */
export function GET() {
  const { cards } = buildDirectoryFromDb();
  return Response.json({ cards });
}
