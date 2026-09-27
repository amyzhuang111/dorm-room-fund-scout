// Gemini free tier (AI Studio / generativelanguage API). This never selects a
// paid provider. Missing key, quota, and other errors are returned so the
// browser can answer with WebLLM instead.

import { answerFromRecords, ASK_SYSTEM_PROMPT, askUserPrompt, NOT_IN_THE_DATA, refusedForLackOfData } from "./ask-prompt";
import { retrieveAsk } from "./ask-retrieve";
import type { AskHit } from "./ask-types";

export const GEMINI_MODEL = "gemini-3.8-flash";
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

export function redactGeminiMessage(message: string, limit = 200): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "[key]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
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
  geminiStatus: number | null;
  geminiMessage: string | null;
  finishReason: string | null;
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

export function geminiGenerateBody(question: string, matches: AskHit[], options?: { thinking?: boolean; maxOutputTokens?: number }) {
  const generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    thinkingConfig?: { thinkingLevel: "low" };
  } = {
    temperature: 0.2,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
  };
  if (options?.thinking !== false) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  return {
    systemInstruction: { parts: [{ text: ASK_SYSTEM_PROMPT }] },
    contents: [{ role: "user" as const, parts: [{ text: askUserPrompt(question, matches) }] }],
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

function attemptMessage(attempt: GeminiAttempt): string | null {
  const source = attempt.thrown || attempt.parsed.apiMessage || (attempt.ok ? "" : attempt.raw);
  if (!source) return null;
  const text = redactGeminiMessage(source, 200);
  return text || null;
}

function failureFrom(attempt: GeminiAttempt, reason: GeminiFailure, matches: AskHit[]): AskGeminiFailure {
  return {
    ok: false,
    reason,
    geminiStatus: attempt.status || null,
    geminiMessage: attemptMessage(attempt),
    finishReason: attempt.parsed.finishReason,
    matches,
  };
}

function logAttempt(attempt: GeminiAttempt, extra: Record<string, unknown>) {
  logGemini({
    model: GEMINI_MODEL,
    endpoint: GEMINI_GENERATE_URL,
    status: attempt.status,
    elapsedMs: attempt.elapsedMs,
    message: attemptMessage(attempt),
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

function answerOrRecords(answer: string, matches: AskHit[], question: string): string {
  if (matches.length > 0 && refusedForLackOfData(answer)) return answerFromRecords(matches, question);
  return answer;
}

export async function answerWithGemini(question: string): Promise<AskGeminiSuccess | AskGeminiFailure> {
  const matches = retrieveAsk(question);
  if (matches.length === 0) {
    return { ok: true, engine: "search", answer: NOT_IN_THE_DATA, matches };
  }
  const key = geminiApiKey();
  if (!key) return { ok: false, reason: "no_key", geminiStatus: null, geminiMessage: null, finishReason: null, matches };

  const keyShape = { length: key.length, aiStudioPrefix: key.startsWith("AIza") };
  const first = await postGemini(GEMINI_GENERATE_URL, key, geminiGenerateBody(question, matches));
  if (first.parsed.text) return { ok: true, engine: "gemini", answer: answerOrRecords(first.parsed.text, matches, question), matches };

  const reason = first.status ? classifyGeminiFailure(first.status, first.raw) : "error";
  if (reason === "quota" || first.status === 404) {
    logAttempt(first, { keyShape, recovered: false });
    return failureFrom(first, reason, matches);
  }

  const timedOut = first.elapsedMs >= CALL_TIMEOUT_MS - 500 || /TimeoutError|AbortError/i.test(first.thrown ?? "");
  const thinkingRejected = first.status === 400 && /thinking/i.test(first.raw);
  const shouldRetry = !timedOut && first.elapsedMs < 8_000 && (Boolean(first.thrown) || thinkingRejected || needsTextRetry(first) || (first.status >= 500 && first.status !== 503));
  if (!shouldRetry) {
    logAttempt(first, { keyShape, recovered: false });
    return failureFrom(first, reason, matches);
  }

  const second = await postGemini(GEMINI_GENERATE_URL, key, geminiGenerateBody(question, matches, { thinking: false, maxOutputTokens: 8192 }));
  if (second.parsed.text) {
    logAttempt(first, { keyShape, recovered: true });
    return { ok: true, engine: "gemini", answer: answerOrRecords(second.parsed.text, matches, question), matches };
  }
  logAttempt(first, { keyShape, recovered: false });
  logAttempt(second, { keyShape, recovered: false });
  const secondReason = second.status ? classifyGeminiFailure(second.status, second.raw) : "error";
  return failureFrom(second.status ? second : first, secondReason === "quota" ? "quota" : "error", matches);
}
