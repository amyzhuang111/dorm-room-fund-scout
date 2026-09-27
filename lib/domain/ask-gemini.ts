// Gemini free tier (AI Studio / generativelanguage API). This never selects a
// paid provider. Missing key, quota, and other errors are returned so the
// browser can answer with WebLLM instead.

import { ASK_SYSTEM_PROMPT, askUserPrompt, NOT_IN_THE_DATA } from "./ask-prompt";
import { retrieveAsk } from "./ask-retrieve";
import type { AskHit } from "./ask-types";

export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_GENERATE_URL = `${GEMINI_API_ROOT}/models/${GEMINI_MODEL}:generateContent`;

const CALL_TIMEOUT_MS = 24_000;

export type GeminiFailure = "no_key" | "quota" | "error";

export function normalizeGeminiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/^bearer\s+/i, "").trim();
  key = key.replace(/\s+/g, "");
  return key || undefined;
}

export function geminiApiKey(): string | undefined {
  return normalizeGeminiKey(process.env.GEMINI_API_KEY) || normalizeGeminiKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function classifyGeminiFailure(status: number, body: string): GeminiFailure {
  const text = body.toLowerCase();
  if (status === 429 || status === 503) return "quota";
  if (/resource_exhausted|quota|rate limit|rate_limit|too many requests/.test(text)) return "quota";
  return "error";
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: unknown };
  functionResponse?: { name?: string; response?: unknown };
}

export interface ParsedGemini {
  text: string;
  finishReason: string | null;
  blockReason: string | null;
  partKinds: string[];
  thoughtsTokenCount: number | null;
  candidatesTokenCount: number | null;
  apiMessage: string | null;
}

function stringField(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  for (const key of ["answer", "text", "content", "response"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function partKind(part: GeminiPart): string {
  if (part.thought === true) return "thought";
  if (part.functionCall) return "functionCall";
  if (part.functionResponse) return "functionResponse";
  if (typeof part.text === "string") return "text";
  return "other";
}

export function parseGeminiResponse(raw: string): ParsedGemini {
  const empty: ParsedGemini = {
    text: "",
    finishReason: null,
    blockReason: null,
    partKinds: [],
    thoughtsTokenCount: null,
    candidatesTokenCount: null,
    apiMessage: null,
  };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; status?: string };
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
      candidates?: {
        finishReason?: string;
        content?: { parts?: GeminiPart[] };
      }[];
    };
    const apiMessage = data.error?.message?.trim() || null;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const visible = parts.filter((part) => part.thought !== true && typeof part.text === "string" && part.text.trim());
    let text = visible.map((part) => part.text?.trim() ?? "").join("\n").trim();
    if (!text) {
      for (const part of parts) {
        text = stringField(part.functionCall?.args) || stringField(part.functionResponse?.response);
        if (text) break;
      }
    }
    return {
      text,
      finishReason: candidate?.finishReason ?? null,
      blockReason: data.promptFeedback?.blockReason ?? null,
      partKinds: parts.map(partKind),
      thoughtsTokenCount: data.usageMetadata?.thoughtsTokenCount ?? null,
      candidatesTokenCount: data.usageMetadata?.candidatesTokenCount ?? null,
      apiMessage,
    };
  } catch {
    return empty;
  }
}

function safeDetail(message: string): string {
  return message.replace(/AIza[0-9A-Za-z_-]{8,}/g, "[key]").replace(/\s+/g, " ").trim().slice(0, 300);
}

function logGemini(event: Record<string, unknown>) {
  console.error(`[ask/gemini] ${JSON.stringify(event)}`);
}

export interface AskGeminiSuccess {
  ok: true;
  engine: "gemini" | "search";
  answer: string;
  matches: AskHit[];
}

export interface AskGeminiFailure {
  ok: false;
  reason: GeminiFailure;
  detail?: string;
  matches: AskHit[];
}

interface GeminiAttempt {
  ok: boolean;
  status: number;
  raw: string;
  parsed: ParsedGemini;
  elapsedMs: number;
  thrown?: string;
}

function generationBody(question: string, matches: AskHit[], thinking: boolean, maxOutputTokens: number, plain: boolean) {
  const reminder = plain ? "\n\nReply in plain sentences only. Do not call tools or functions." : "";
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens,
  };
  if (thinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    systemInstruction: { parts: [{ text: ASK_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: askUserPrompt(question, matches) + reminder }] }],
    generationConfig,
  };
}

async function postGemini(url: string, key: string, body: unknown): Promise<GeminiAttempt> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const raw = await response.text();
    return { ok: response.ok, status: response.status, raw, parsed: parseGeminiResponse(raw), elapsedMs: Date.now() - started };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : "fetch failed";
    return {
      ok: false,
      status: 0,
      raw: "",
      parsed: parseGeminiResponse(""),
      elapsedMs: Date.now() - started,
      thrown: `${name}: ${message}`,
    };
  }
}

function attemptDetail(attempt: GeminiAttempt): string {
  if (attempt.thrown) return safeDetail(attempt.thrown);
  const parsed = attempt.parsed;
  const bits = [
    `status ${attempt.status}`,
    parsed.apiMessage,
    parsed.finishReason ? `finish ${parsed.finishReason}` : "",
    parsed.blockReason ? `block ${parsed.blockReason}` : "",
    parsed.partKinds.length ? `parts ${parsed.partKinds.join(",")}` : "",
    parsed.thoughtsTokenCount != null ? `thoughts ${parsed.thoughtsTokenCount}` : "",
  ].filter(Boolean);
  return safeDetail(bits.join(" · ") || "empty gemini response");
}

function logAttempt(attempt: GeminiAttempt, extra: Record<string, unknown>) {
  logGemini({
    model: GEMINI_MODEL,
    endpoint: GEMINI_GENERATE_URL,
    status: attempt.status,
    elapsedMs: attempt.elapsedMs,
    message: attempt.thrown ? safeDetail(attempt.thrown) : attempt.parsed.apiMessage ? safeDetail(attempt.parsed.apiMessage) : null,
    finishReason: attempt.parsed.finishReason,
    blockReason: attempt.parsed.blockReason,
    partKinds: attempt.parsed.partKinds,
    thoughtsTokenCount: attempt.parsed.thoughtsTokenCount,
    candidatesTokenCount: attempt.parsed.candidatesTokenCount,
    ...extra,
  });
}

function needsTextRetry(attempt: GeminiAttempt): boolean {
  if (!attempt.ok || attempt.parsed.text || attempt.parsed.blockReason) return false;
  if (attempt.parsed.finishReason === "SAFETY" || attempt.parsed.finishReason === "RECITATION" || attempt.parsed.finishReason === "PROHIBITED_CONTENT") return false;
  const kinds = attempt.parsed.partKinds;
  return (
    attempt.parsed.finishReason === "MAX_TOKENS" ||
    kinds.includes("thought") ||
    kinds.includes("functionCall") ||
    kinds.includes("functionResponse") ||
    (attempt.parsed.thoughtsTokenCount ?? 0) > 0 ||
    kinds.length === 0
  );
}

export async function answerWithGemini(question: string): Promise<AskGeminiSuccess | AskGeminiFailure> {
  const matches = retrieveAsk(question);
  if (matches.length === 0) {
    return { ok: true, engine: "search", answer: NOT_IN_THE_DATA, matches };
  }
  const key = geminiApiKey();
  if (!key) return { ok: false, reason: "no_key", matches };

  const keyShape = { length: key.length, aiStudioPrefix: key.startsWith("AIza") };
  const first = await postGemini(GEMINI_GENERATE_URL, key, generationBody(question, matches, true, 2048, false));
  if (first.parsed.text) return { ok: true, engine: "gemini", answer: first.parsed.text, matches };

  const reason = first.status ? classifyGeminiFailure(first.status, first.raw) : "error";
  if (reason === "quota") {
    logAttempt(first, { keyShape, recovered: false });
    return { ok: false, reason, detail: attemptDetail(first), matches };
  }

  const timedOut = first.elapsedMs >= CALL_TIMEOUT_MS - 500 || /TimeoutError|AbortError/i.test(first.thrown ?? "");
  const thinkingRejected = first.status === 400 && /thinking/i.test(first.raw);
  const modelMissing = first.status === 404;
  const retryUrl = modelMissing ? `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent` : GEMINI_GENERATE_URL;
  const sawTool = first.parsed.partKinds.includes("functionCall") || first.parsed.partKinds.includes("functionResponse");
  const shouldRetry = !timedOut && (Boolean(first.thrown) || thinkingRejected || modelMissing || needsTextRetry(first) || (first.status >= 500 && first.status !== 503));
  if (!shouldRetry) {
    logAttempt(first, { keyShape, recovered: false });
    return { ok: false, reason, detail: attemptDetail(first), matches };
  }

  const thinkingIgnored = (first.parsed.thoughtsTokenCount ?? 0) > 0 || first.parsed.partKinds.includes("thought");
  const second = await postGemini(
    retryUrl,
    key,
    generationBody(question, matches, !thinkingRejected, thinkingRejected || thinkingIgnored ? 16384 : 4096, sawTool)
  );
  if (second.parsed.text) {
    logAttempt(first, { keyShape, recovered: true });
    return { ok: true, engine: "gemini", answer: second.parsed.text, matches };
  }
  logAttempt(first, { keyShape, recovered: false });
  logAttempt(second, { keyShape, endpoint: retryUrl, recovered: false });
  const secondReason = second.status ? classifyGeminiFailure(second.status, second.raw) : "error";
  return { ok: false, reason: secondReason === "quota" ? "quota" : "error", detail: attemptDetail(second.status ? second : first), matches };
}
