import type { AskHit } from "./ask-types";

export const NOT_IN_THE_DATA = "Not in the data.";

export const ASK_SYSTEM_PROMPT = `You answer questions about Campus Scout using only the records in the user message.
If those records do not support an answer, reply with exactly: Not in the data.
Do not invent people, startups, organizations, or numbers.
Mention only names that appear in the records. Write at most 4 short sentences.`;

export function recordsForPrompt(hits: AskHit[]): string {
  return hits
    .slice(0, 30)
    .map((hit, index) => `${index + 1}. ${hit.name} (${hit.kind}) — ${hit.detail} — ${hit.href}`)
    .join("\n");
}

export function askUserPrompt(question: string, hits: AskHit[]): string {
  return `Records:\n${recordsForPrompt(hits)}\n\nQuestion: ${question}`;
}

/** Shown when the on-device model is not running. The list under it is the citation. */
export function fallbackAnswer(hits: AskHit[]): string {
  if (hits.length === 0) return NOT_IN_THE_DATA;
  const names = hits
    .slice(0, 5)
    .map((hit) => hit.name)
    .join(", ");
  const more = hits.length > 5 ? ` and ${hits.length - 5} more` : "";
  return `${hits.length} Campus Scout records match: ${names}${more}.`;
}
