import { buildNetworkMap } from "@/lib/domain/network-map";

export async function GET() {
  return Response.json(buildNetworkMap());
}
