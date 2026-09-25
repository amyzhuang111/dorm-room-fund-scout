import { feedbackStoreConfigured, readRemoteFeedback, reviewerTokenOk, writeRemoteFeedback } from "@/lib/feedback/upstash";

export async function GET(request: Request) {
  if (!feedbackStoreConfigured()) {
    return Response.json({ configured: false, records: null });
  }
  if (!reviewerTokenOk(request.headers.get("x-feedback-token"))) {
    return Response.json({ configured: true, error: "token" }, { status: 401 });
  }
  const raw = await readRemoteFeedback();
  return Response.json({ configured: true, records: raw ? JSON.parse(raw) : [] });
}

export async function PUT(request: Request) {
  if (!feedbackStoreConfigured()) {
    return Response.json({ configured: false });
  }
  if (!reviewerTokenOk(request.headers.get("x-feedback-token"))) {
    return Response.json({ configured: true, error: "token" }, { status: 401 });
  }
  const body = await request.text();
  JSON.parse(body);
  await writeRemoteFeedback(body);
  return Response.json({ configured: true, ok: true });
}
