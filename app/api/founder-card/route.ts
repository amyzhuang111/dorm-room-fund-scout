import { getFounderPreview } from "@/lib/domain/founder-preview";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.startsWith("ufounder_")) return Response.json({ card: null });
  return Response.json({ card: getFounderPreview(id) });
}
