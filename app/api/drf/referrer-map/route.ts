import { referrerOverlay } from "@/lib/domain/who-can-intro";

export async function GET(request: Request) {
  const weak = new URL(request.url).searchParams.get("weak") === "1";
  return Response.json(referrerOverlay(weak));
}
