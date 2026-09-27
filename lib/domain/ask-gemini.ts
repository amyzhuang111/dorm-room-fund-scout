// Gemini free tier (AI Studio / generativelanguage API). This never selects a
// paid provider. Missing key, quota, and other errors are returned so the
// browser can answer with WebLLM instead.

import { ASK_SYSTEM_PROMPT, askUserPrompt, NOT_IN_THE_DATA } from "./ask-prompt";
import { retrieveAsk } from "./ask-retrieve";
import type { AskHit } from "./ask-types";

export const GEMINI_MODEL = "gemini-2.5-flash";

export type GeminiFailure = "no_key" | "quota" | "error";

export function geminiApiKey(): string | undefined {
  const primary = process.env.GEMINI_API_KEY?.trim();
  if (primary) return primary;
  const alias = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return alias || undefined;
}

export function classifyGeminiFailure(status: number, body: string): GeminiFailure {
  const text = body.toLowerCase();
  if (status === 429 || status === 503) return "quota";
  if (/resource_exhausted|quota|rate limit|rate_limit|too many requests/.test(text)) return "quota";
  return "error";
}

function textFromGemini(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  } catch {
    return "";
  }
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
  matches: AskHit[];
}

export async function answerWithGemini(question: string): Promise<AskGeminiSuccess | AskGeminiFailure> {
  const matches = retrieveAsk(question);
  if (matches.length === 0) {
    return { ok: true, engine: "search", answer: NOT_IN_THE_DATA, matches };
  }
  const key = geminiApiKey();
  if (!key) return { ok: false, reason: "no_key", matches };

  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ASK_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: askUserPrompt(question, matches) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch {
    return { ok: false, reason: "error", matches };
  }

  const raw = await response.text();
  if (!response.ok) return { ok: false, reason: classifyGeminiFailure(response.status, raw), matches };
  const answer = textFromGemini(raw);
  if (!answer) return { ok: false, reason: "error", matches };
  return { ok: true, engine: "gemini", answer, matches };
}
