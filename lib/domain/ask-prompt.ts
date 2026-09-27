import type { AskHit } from "./ask-types";

export const NOT_IN_THE_DATA = "Not in the data.";

export function onDeviceNote(quota: boolean, canRun: boolean): string | null {
  if (!canRun) return quota ? "Free Gemini quota reached. Showing the matching records." : null;
  return quota ? "Free Gemini quota reached, answering on your device" : "Answering on your device";
}

export const ASK_SYSTEM_PROMPT = `You answer questions about Campus Scout using only the records in the user message.
When a record matches the campus, sector, program, investor, or company in the question, answer from it even if other fields are missing.
For funding questions, name the startups whose records show a round, amount, investor, or funding news. Partial data is still an answer, for example: These have recorded raises: Name (Seed $20M, led by Lux Capital).
If the question asks for a specific round such as Series A and the records show a different round, report the round that is written down.
Do not invent people, startups, organizations, or numbers. Mention only names that appear in the records.
Reply with exactly "Not in the data." only when no record matches the question. Write at most 4 short sentences.`;

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

export function refusedForLackOfData(answer: string): boolean {
  return answer.trim().toLowerCase().replace(/[.!]+$/g, "") === "not in the data";
}

function evidenceClauses(detail: string, pattern: RegExp): string[] {
  return detail
    .split(" · ")
    .map((part) => part.trim())
    .filter((part) => pattern.test(part));
}

function asksAboutFunding(question: string): boolean {
  return /\b(raised|raises|raising|funding|funded|fundraise|investors?|backed by|series\s+[a-e]|pre-seed|seed)\b/i.test(question);
}

/** Names the matching records. Funding questions lead with rounds, amounts, and funding news when those fields are present. */
export function answerFromRecords(hits: AskHit[], question = ""): string {
  if (hits.length === 0) return NOT_IN_THE_DATA;
  const raises = asksAboutFunding(question)
    ? hits
        .map((hit) => ({ hit, clause: evidenceClauses(hit.detail, /^(round:|total:|funding news:)/i).slice(0, 3).join("; ") }))
        .filter((row) => row.clause)
    : [];
  if (asksAboutFunding(question)) {
    if (raises.length) {
      const lines = raises.slice(0, 8).map((row) => `${row.hit.name} (${row.clause})`);
      const more = raises.length > 8 ? ` and ${raises.length - 8} more` : "";
      return `These have recorded raises: ${lines.join("; ")}${more}.`;
    }
    const backed = hits
      .map((hit) => ({ hit, clause: evidenceClauses(hit.detail, /^investors:/i)[0] ?? "" }))
      .filter((row) => row.clause);
    if (backed.length) {
      const lines = backed.slice(0, 8).map((row) => `${row.hit.name} (${row.clause})`);
      const more = backed.length > 8 ? ` and ${backed.length - 8} more` : "";
      return `These have recorded backing: ${lines.join("; ")}${more}.`;
    }
    const names = hits
      .slice(0, 8)
      .map((hit) => hit.name)
      .join(", ");
    const more = hits.length > 8 ? ` and ${hits.length - 8} more` : "";
    return `No recorded raise is attached yet. Matching records: ${names}${more}.`;
  }
  return fallbackAnswer(hits);
}
