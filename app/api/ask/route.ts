import { answerWithGemini, GEMINI_MODEL, geminiApiKey } from "@/lib/domain/ask-gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET() {
  return Response.json({
    geminiConfigured: Boolean(geminiApiKey()),
    model: GEMINI_MODEL,
  });
}

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

  const result = await answerWithGemini(question);
  if (!result.ok) {
    const status = result.reason === "quota" ? 429 : result.reason === "no_key" ? 503 : 502;
    return Response.json(
      {
        error: result.reason,
        geminiStatus: result.geminiStatus,
        geminiMessage: result.geminiMessage,
        finishReason: result.finishReason,
        matches: result.matches,
      },
      { status }
    );
  }
  return Response.json({ engine: result.engine, answer: result.answer, matches: result.matches });
}
