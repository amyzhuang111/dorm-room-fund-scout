import { getStartupCard } from "@/lib/domain/startup-card";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.startsWith("user_")) return Response.json({ card: null });
  return Response.json({ card: getStartupCard(id) });
}
