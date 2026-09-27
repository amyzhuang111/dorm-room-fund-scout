import { retrieveAsk } from "@/lib/domain/ask-retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const question =
    typeof body === "object" && body && "question" in body && typeof (body as { question: unknown }).question === "string"
      ? (body as { question: string }).question.trim()
      : "";
  if (!question || question.length > 500) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json({ matches: retrieveAsk(question) });
}
