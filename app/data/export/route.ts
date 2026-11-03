import { corpusToCsv, loadCorpusRows } from "@/lib/domain/corpus-explorer";

export const dynamic = "force-dynamic";

export async function GET() {
  const csv = corpusToCsv(loadCorpusRows());
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="campus-scout-corpus.csv"',
      "Cache-Control": "no-store",
    },
  });
}
