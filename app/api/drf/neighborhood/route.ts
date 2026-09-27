import { drfNeighborhoodIds } from "@/lib/domain/warm-paths";

export async function GET() {
  return Response.json({ ids: drfNeighborhoodIds() });
}
