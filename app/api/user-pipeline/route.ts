import { parseState } from "@/lib/domain/user-pipeline";
import { pipelineBackend, readPipeline, writePipeline } from "@/lib/user-pipeline/store";

export async function GET() {
  const backend = pipelineBackend();
  if (!backend) return Response.json({ configured: false, backend: null, state: null });
  try {
    const state = await readPipeline();
    return Response.json({ configured: true, backend, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline store unavailable";
    return Response.json({ configured: true, backend, state: null, error: message }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const backend = pipelineBackend();
  if (!backend) return Response.json({ configured: false, backend: null });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const state = parseState(body);
  try {
    await writePipeline(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline store unavailable";
    return Response.json({ configured: true, backend, error: message }, { status: 503 });
  }
  return Response.json({ configured: true, backend, ok: true });
}
