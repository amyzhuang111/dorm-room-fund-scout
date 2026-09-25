import { listBuildersForUniversity, listSignalsForUniversity, listSources } from "@/lib/domain/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sources = listSources()
    .filter((source) => source.campuses.includes(id) || source.campuses.length === 0)
    .map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      status: source.status,
      discoveredLeadCount: source.discoveredLeadCount,
      lastSuccessAt: source.lastSuccessAt,
    }));
  return Response.json({
    builders: listBuildersForUniversity(id),
    signals: listSignalsForUniversity(id),
    sources,
  });
}
