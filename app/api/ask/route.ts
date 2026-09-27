import { streamAsk, type AskStreamEvent } from "@/lib/domain/ask-ai";
import { askAiStatus } from "@/lib/domain/ask-model";
import { createRateLimiter } from "@/lib/domain/ask-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const allow = createRateLimiter(8, 60_000);

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function GET() {
  const status = askAiStatus();
  return Response.json({
    configured: status.configured,
    envVar: status.envVar,
    model: status.model,
  });
}

export async function POST(request: Request) {
  const limit = allow(clientIp(request));
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const status = askAiStatus();
  if (!status.configured) {
    return Response.json({ error: "needs_key", envVar: status.envVar, model: status.model }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const question = typeof body === "object" && body && "question" in body && typeof (body as { question: unknown }).question === "string"
    ? (body as { question: string }).question.trim()
    : "";
  if (!question || question.length > 500) return Response.json({ error: "bad_request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AskStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await streamAsk(question, send);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (error) {
        console.error("ask ai failed", error);
        send({ type: "error", message: "Ask AI could not finish that question." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
