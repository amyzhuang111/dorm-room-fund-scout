import { getNetworkFocus } from "@/lib/domain/network-focus";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ focus: null });
  return Response.json({ focus: getNetworkFocus(id) });
}
