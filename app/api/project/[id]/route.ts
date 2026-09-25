import { getProjectDetail } from "@/lib/domain/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const detail = getProjectDetail(id);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail);
}
