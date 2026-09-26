import { survivorId } from "@/lib/domain/entity-redirects";
import { getNetworkNodeDetail, getProjectDetail } from "@/lib/domain/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const company = getProjectDetail(survivorId("project", id) ?? id);
  if (company) return Response.json({ company, node: null });
  const node = getNetworkNodeDetail(survivorId("person", id) ?? id);
  if (!node) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ company: null, node });
}
