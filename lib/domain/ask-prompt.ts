import { intentSummary, parseAskIntent, stageLabel, type AskStage } from "./ask-intent";
import type { AskHit } from "./ask-types";

export const NOT_IN_THE_DATA = "Not in the data.";

export function onDeviceNote(quota: boolean, canRun: boolean): string | null {
  if (!canRun) return quota ? "Free Gemini quota reached. Showing the matching records." : null;
  return quota ? "Free Gemini quota reached, answering on your device" : "Answering on your device";
}

export const ASK_SYSTEM_PROMPT = `You answer questions about Campus Scout using only the records in the user message.
Answer the question directly in the first sentence.
List each matching startup with its recorded round, amount, date, investors, and founders when those fields are in the record.
Use the stage written on the record. A pre-seed question may include angel, friends and family, accelerator checks, grants, fellowships, and companies with no priced round; name the stage the record actually shows.
Cite only the provided records. Never invent people, startups, amounts, dates, investors, or rounds.
Reply with exactly "Not in the data." only when no record is provided. Write at most 6 short sentences.`;

export function recordsForPrompt(hits: AskHit[]): string {
  return hits
    .slice(0, 30)
    .map((hit, index) => `${index + 1}. ${hit.name} (${hit.kind}) — ${hit.detail} — ${hit.href}`)
    .join("\n");
}

export function askUserPrompt(question: string, hits: AskHit[], total?: number): string {
  const intent = parseAskIntent(question);
  const scope = total && total > hits.length ? `Showing the ${hits.length} most relevant of ${total} matching records.\n` : "";
  return `${intentSummary(intent)}${scope}Records:\n${recordsForPrompt(hits)}\n\nQuestion: ${question}`;
}

function detailPart(detail: string, prefix: string): string {
  const part = detail
    .split(" · ")
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(prefix));
  return part ? part.slice(prefix.length).trim() : "";
}

function cite(hit: AskHit): string {
  const recorded = detailPart(hit.detail, "recorded:");
  const founders = detailPart(hit.detail, "founders:");
  const bits = [recorded, founders ? `founders ${founders}` : ""].filter(Boolean);
  return bits.length ? `${hit.name} (${bits.join("; ")})` : hit.name;
}

export function noMatchAnswer(question: string, suggestion: { stage: AskStage; matches: AskHit[] } | null): string {
  const intent = parseAskIntent(question);
  if (!intent.stage) return NOT_IN_THE_DATA;
  const asked = stageLabel(intent.stage);
  const where = intent.campus ? ` for ${intent.campus}` : "";
  if (!suggestion || suggestion.matches.length === 0) return `No ${asked} records match${where}.`;
  const lines = suggestion.matches.slice(0, 5).map(cite);
  return `No ${asked} records match${where}. The nearest recorded stage is ${stageLabel(suggestion.stage)}: ${lines.join("; ")}.`;
}

function stageAnswer(question: string, hits: AskHit[], total: number): string {
  const intent = parseAskIntent(question);
  const stage = intent.stage as AskStage;
  const where = intent.campus ? `${intent.campus} ` : "";
  const shown = hits.slice(0, 8).map(cite);
  const more = hits.length > 8 ? ` and ${hits.length - 8} more` : "";
  const count = total > hits.length ? total : hits.length;
  const noun = intent.founderFocus && !intent.startupFocus ? "founders" : "startups";
  if (stage === "pre-seed") {
    const labelled = hits.some((hit) => /recorded:\s*pre-seed/i.test(hit.detail));
    const lead = labelled
      ? `${count} ${where}${noun} match pre-seed.`
      : `No round is labelled Pre-seed. ${count} early-stage ${where}${noun} match (accelerator checks, grants, fellowships, or no priced round).`;
    const list = total > hits.length ? `The most relevant include: ${shown.join("; ")}.` : `${shown.join("; ")}${more}.`;
    return `${lead} ${list}`;
  }
  const lead = `${count} ${where}${noun} match ${stageLabel(stage)}.`;
  const list = total > hits.length ? `The most relevant include: ${shown.join("; ")}.` : `${shown.join("; ")}${more}.`;
  return `${lead} ${list}`;
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

/** Names the matching records. Stage questions lead with the recorded stage, amount, date, investors, and founders. */
export function answerFromRecords(hits: AskHit[], question = "", total = hits.length): string {
  if (hits.length === 0) return NOT_IN_THE_DATA;
  if (parseAskIntent(question).stage) return stageAnswer(question, hits, total);
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
