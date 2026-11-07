import { filterCorpus } from "@/lib/domain/corpus-explorer";
import { corpusToXlsx } from "@/lib/domain/corpus-xlsx";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const bytes = await corpusToXlsx(filterCorpus(params));
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="campus-scout-corpus.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

