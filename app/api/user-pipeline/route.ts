import { currentMember } from "@/lib/auth/guard";
import { parseState } from "@/lib/domain/user-pipeline";
import { pipelineBackend, readPipeline, writePipeline } from "@/lib/user-pipeline/store";

export const runtime = "nodejs";

export async function GET() {
  const member = await currentMember();
  // Public exploration and local saves remain free. Hosted records require identity.
  if (!member) return Response.json({ configured: false, backend: null, state: null }, { headers: { "Cache-Control": "private, no-store" } });
  const backend = pipelineBackend();
  if (!backend) return Response.json({ configured: false, backend: null, state: null });
  try {
    const state = await readPipeline(member.email);
    return Response.json({ configured: true, backend, state }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    void err;
    const message = "Saved-list sync is temporarily unavailable";
    return Response.json({ configured: true, backend, state: null, error: message }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const member = await currentMember();
  // Public exploration and local saves remain free. Hosted records require identity.
  if (!member) return Response.json({ configured: false, backend: null, state: null }, { headers: { "Cache-Control": "private, no-store" } });
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
    await writePipeline(member.email, state);
  } catch (err) {
    void err;
    const message = "Saved-list sync is temporarily unavailable";
    return Response.json({ configured: true, backend, error: message }, { status: 503 });
  }
  return Response.json({ configured: true, backend, ok: true });
}
