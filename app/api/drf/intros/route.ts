import { introPanelFor } from "@/lib/domain/who-can-intro";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 80) return Response.json({ target: null, paths: [] });
  return Response.json(introPanelFor(id));
}
