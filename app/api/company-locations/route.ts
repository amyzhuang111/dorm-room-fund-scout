import { companyLocations } from "@/lib/domain/company-locations";

export const runtime = "nodejs";
export function GET() {
  return Response.json(companyLocations(), { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
