import { warmIntroForId } from "@/lib/domain/warm-paths";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 80) return Response.json({ alum: null, paths: [] });
  return Response.json(warmIntroForId(id));
}
