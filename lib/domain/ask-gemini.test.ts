import assert from "node:assert/strict";
import { answerWithGemini, classifyGeminiFailure, GEMINI_GENERATE_URL, GEMINI_MODEL, geminiApiKey, geminiGenerateBody, normalizeGeminiKey, parseGeminiResponse, redactGeminiMessage } from "./ask-gemini";
import { onDeviceNote } from "./ask-prompt";

assert.equal(GEMINI_MODEL, "gemini-3.8-flash");
assert.equal(GEMINI_GENERATE_URL, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
const body = geminiGenerateBody("Who founded it?", [{ id: "p1", kind: "person", name: "Ada", href: "/founder/discover?founder=p1", detail: "Penn", campuses: ["univ_penn"], relatedIds: [], sources: [] }]);
assert.deepEqual(body.systemInstruction, { parts: [{ text: body.systemInstruction.parts[0].text }] });
assert.match(body.systemInstruction.parts[0].text, /recorded raises/i);
assert.match(body.systemInstruction.parts[0].text, /Not in the data/);
assert.equal(body.contents[0].role, "user");
assert.equal(body.generationConfig.thinkingConfig?.thinkingLevel, "low");
assert.equal(body.generationConfig.thinkingConfig != null && "thinkingBudget" in body.generationConfig.thinkingConfig, false);
assert.equal("tools" in body, false);
assert.equal("responseMimeType" in body.generationConfig, false);
const serialized = JSON.stringify(body);
assert.equal(/additionalProperties|\$schema|anyOf/.test(serialized), false);
assert.equal(redactGeminiMessage("key AIzaSyDUMMYKEY1234567890 failed", 200).includes("AIza"), false);
assert.equal(redactGeminiMessage("x".repeat(500)).length, 200);
assert.equal(normalizeGeminiKey('  "quoted-key"  '), "quoted-key");
assert.equal(normalizeGeminiKey("Bearer secret-key"), "secret-key");
assert.equal(normalizeGeminiKey("  gemini test key  "), "geminitestkey");

const thoughtsOnly = parseGeminiResponse(
  JSON.stringify({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "hidden", thought: true }] } }],
    usageMetadata: { thoughtsTokenCount: 512, candidatesTokenCount: 0 },
  })
);
assert.equal(thoughtsOnly.text, "");
assert.equal(thoughtsOnly.finishReason, "MAX_TOKENS");
assert.deepEqual(thoughtsOnly.partKinds, ["thought"]);
assert.equal(thoughtsOnly.thoughtsTokenCount, 512);

const visible = parseGeminiResponse(
  JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hidden", thought: true }, { text: "Visible answer." }] } }],
  })
);
assert.equal(visible.text, "Visible answer.");

const toolCall = parseGeminiResponse(
  JSON.stringify({
    candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: { name: "answer", args: { answer: "From the function call." } } }] } }],
  })
);
assert.equal(toolCall.text, "From the function call.");
assert.deepEqual(toolCall.partKinds, ["functionCall"]);

const blocked = parseGeminiResponse(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" }, error: { message: "blocked" } }));
assert.equal(blocked.blockReason, "SAFETY");
assert.equal(blocked.apiMessage, "blocked");
assert.equal(classifyGeminiFailure(429, ""), "quota");
assert.equal(classifyGeminiFailure(503, "unavailable"), "quota");
assert.equal(classifyGeminiFailure(500, "RESOURCE_EXHAUSTED: quota exceeded"), "quota");
assert.equal(classifyGeminiFailure(403, "rate limit exceeded"), "quota");
assert.equal(classifyGeminiFailure(500, "internal error"), "error");
assert.equal(classifyGeminiFailure(400, "bad request"), "error");
assert.equal(onDeviceNote(true, true), "Free Gemini quota reached, answering on your device");
assert.equal(onDeviceNote(false, true), "Answering on your device");
assert.equal(onDeviceNote(true, false), "Free Gemini quota reached. Showing the matching records.");
assert.equal(onDeviceNote(false, false), null);

const savedGemini = process.env.GEMINI_API_KEY;
const savedGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
assert.equal(geminiApiKey(), undefined);

process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test-key";
assert.equal(geminiApiKey(), "google-test-key");
process.env.GEMINI_API_KEY = "gemini-test-key";
assert.equal(geminiApiKey(), "gemini-test-key");

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

async function main() {
  const missed = await answerWithGemini("Berkeley founders backed by a16z speedrun");
  assert.equal(missed.ok, false);
  if (!missed.ok) {
    assert.equal(missed.reason, "no_key");
    assert.ok(missed.matches.length > 0);
    assert.ok(missed.matches.some((hit) => hit.name === "Dhruv Mangtani"));
  }
  const empty = await answerWithGemini("Penn juniors in M&T building in AI");
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.answer, "Not in the data.");
    assert.equal(empty.engine, "search");
  }

  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  function mockFetch(handler: (call: number) => { status: number; json: unknown }) {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      assert.equal(init?.headers && (init.headers as Record<string, string>)["x-goog-api-key"], "gemini-test-key");
      const next = handler(calls.length);
      return new Response(JSON.stringify(next.json), { status: next.status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  }

  process.env.GEMINI_API_KEY = "gemini-test-key";
  mockFetch(() => ({
    status: 200,
    json: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hidden", thought: true }, { text: "Dhruv Mangtani is in a16z speedrun." }] } }] },
  }));
  const answered = await answerWithGemini("Berkeley founders backed by a16z speedrun");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  const sent = calls[0].body as {
    tools?: unknown;
    systemInstruction: { parts: { text: string }[] };
    generationConfig: { responseMimeType?: string; thinkingConfig?: { thinkingLevel?: string; thinkingBudget?: number } };
  };
  assert.equal(sent.tools, undefined);
  assert.equal(typeof sent.systemInstruction.parts[0].text, "string");
  assert.equal(sent.generationConfig.thinkingConfig?.thinkingLevel, "low");
  assert.equal(sent.generationConfig.thinkingConfig?.thinkingBudget, undefined);
  assert.equal(sent.generationConfig.responseMimeType, undefined);
  assert.equal(answered.ok, true);
  if (answered.ok) {
    assert.equal(answered.engine, "gemini");
    assert.equal(answered.answer, "Dhruv Mangtani is in a16z speedrun.");
  }

  const unavailable = "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.";
  mockFetch(() => ({ status: 404, json: { error: { code: 404, message: unavailable, status: "NOT_FOUND" } } }));
  const missing = await answerWithGemini("Berkeley founders backed by a16z speedrun");
  assert.equal(calls.length, 1);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.reason, "error");
    assert.equal(missing.geminiStatus, 404);
    assert.equal(missing.geminiMessage, unavailable.slice(0, 200));
    assert.equal(missing.finishReason, null);
    assert.ok(missing.matches.length > 0);
  }

  mockFetch((call) =>
    call === 1
      ? { status: 200, json: { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "only thought", thought: true }] } }], usageMetadata: { thoughtsTokenCount: 4000 } } }
      : { status: 200, json: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Northwestern startups with recorded raises." }] } }] } }
  );
  const retried = await answerWithGemini("Which Northwestern startups raised money?");
  assert.equal(calls.length, 2);
  const retryConfig = (calls[1].body as { generationConfig: { thinkingConfig?: unknown; maxOutputTokens?: number } }).generationConfig;
  assert.equal(retryConfig.thinkingConfig, undefined);
  assert.equal(retryConfig.maxOutputTokens, 8192);
  assert.equal(retried.ok, true);
  if (retried.ok) assert.equal(retried.answer, "Northwestern startups with recorded raises.");

  mockFetch(() => ({ status: 200, json: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Not in the data." }] } }] } }));
  const refused = await answerWithGemini("Which Northwestern startups raised money?");
  assert.equal(refused.ok, true);
  if (refused.ok) {
    assert.notEqual(refused.answer, "Not in the data.");
    assert.match(refused.answer, /HaptE/);
  }

  globalThis.fetch = originalFetch;

  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;
  if (savedGoogle === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedGoogle;
  console.log("ask-gemini tests ok");
}

void main();
