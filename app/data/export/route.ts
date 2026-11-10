import { filterCorpus } from "@/lib/domain/corpus-explorer";
import { corpusToXlsx } from "@/lib/domain/corpus-xlsx";
import { relationshipExportRows } from "@/lib/domain/relationship-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = filterCorpus(params);
  const bytes = await corpusToXlsx(rows, relationshipExportRows(rows.map((row) => row.id)));
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="campus-scout-corpus.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

