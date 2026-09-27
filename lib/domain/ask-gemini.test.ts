import assert from "node:assert/strict";
import { answerWithGemini, classifyGeminiFailure, GEMINI_MODEL, geminiApiKey } from "./ask-gemini";
import { onDeviceNote } from "./ask-prompt";

assert.equal(GEMINI_MODEL, "gemini-2.5-flash");
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
  if (empty.ok) assert.equal(empty.answer, "Not in the data.");

  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;
  if (savedGoogle === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedGoogle;
  console.log("ask-gemini tests ok");
}

void main();
