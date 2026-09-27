// Which LLM credentials Ask AI will use. The Vercel AI SDK model id is
// swappable with ASK_AI_MODEL. AI_GATEWAY_API_KEY is the credential to set
// on Vercel; OPENAI_API_KEY and ANTHROPIC_API_KEY work when ASK_AI_PROVIDER
// selects that provider (or when no gateway key is set).

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";

export const ASK_AI_ENV_VAR = "AI_GATEWAY_API_KEY";
export const ASK_AI_DEFAULT_MODEL = "openai/gpt-4.1-mini";

export type AskProvider = "gateway" | "openai" | "anthropic";

export interface AskAiStatus {
  configured: boolean;
  envVar: string;
  provider: AskProvider | null;
  model: string;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function gatewayModelId(model: string | undefined): string {
  if (!model) return ASK_AI_DEFAULT_MODEL;
  return model.includes("/") ? model : `openai/${model}`;
}

function directModelId(model: string | undefined, fallback: string): string {
  if (!model) return fallback;
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

export function askAiStatus(): AskAiStatus {
  const provider = env("ASK_AI_PROVIDER")?.toLowerCase();
  const model = env("ASK_AI_MODEL");
  const gatewayKey = env("AI_GATEWAY_API_KEY");
  const openaiKey = env("OPENAI_API_KEY");
  const anthropicKey = env("ANTHROPIC_API_KEY");

  if (provider === "gateway") {
    return { configured: Boolean(gatewayKey), envVar: ASK_AI_ENV_VAR, provider: gatewayKey ? "gateway" : null, model: gatewayModelId(model) };
  }
  if (provider === "openai") {
    return { configured: Boolean(openaiKey), envVar: ASK_AI_ENV_VAR, provider: openaiKey ? "openai" : null, model: directModelId(model, "gpt-4.1-mini") };
  }
  if (provider === "anthropic") {
    return { configured: Boolean(anthropicKey), envVar: ASK_AI_ENV_VAR, provider: anthropicKey ? "anthropic" : null, model: directModelId(model, "claude-sonnet-4-5") };
  }
  if (gatewayKey) return { configured: true, envVar: ASK_AI_ENV_VAR, provider: "gateway", model: gatewayModelId(model) };
  if (openaiKey) return { configured: true, envVar: ASK_AI_ENV_VAR, provider: "openai", model: directModelId(model, "gpt-4.1-mini") };
  if (anthropicKey) return { configured: true, envVar: ASK_AI_ENV_VAR, provider: "anthropic", model: directModelId(model, "claude-sonnet-4-5") };
  return { configured: false, envVar: ASK_AI_ENV_VAR, provider: null, model: ASK_AI_DEFAULT_MODEL };
}

export function askAiLanguageModel(): LanguageModel | null {
  const status = askAiStatus();
  if (!status.configured || !status.provider) return null;
  if (status.provider === "gateway") return gateway(status.model);
  if (status.provider === "openai") return createOpenAI({ apiKey: env("OPENAI_API_KEY") })(status.model);
  return createAnthropic({ apiKey: env("ANTHROPIC_API_KEY") })(status.model);
}
