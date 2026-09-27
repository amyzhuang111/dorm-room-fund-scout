// Streams a short answer grounded in searchPeople / searchStartups /
// searchOrganizations / searchInvestors. Tool results are the only records
// the client is allowed to list. If those results are empty, the answer is
// a fixed sentence — model prose is discarded so it cannot invent rows.

import { isStepCount, streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { searchInvestors, searchOrganizations, searchPeople, searchStartups, isKnownAskId } from "./ask-query";
import type { AskHit } from "./ask-types";
import { askAiLanguageModel } from "./ask-model";

const EMPTY_ANSWER = "Nothing in the Campus Scout database matched that question.";

const SYSTEM = `You are Ask AI for Campus Scout, a database of campus founders, startups, organizations, and investors.
Answer only by calling the search tools. Never invent a person, startup, club, investor, campus, or count.
The interface lists the tool results separately. Write 2-4 sentences about what those results show.
If every tool returns count 0, say that nothing in the Campus Scout database matched. Do not guess names.
As of September 2026, freshmen are class of 2030, sophomores 2029, juniors 2028, and seniors 2027.
Campus names: Penn, Berkeley, Stanford, MIT, Harvard, Columbia, Princeton, CMU, Michigan, Georgia Tech, Waterloo.
Sector words: AI, healthcare, fintech. "a16z speedrun" is an investor name. "M&T" is an organization name.
"Top-tier clubs with the most founders" means search_organizations with typeIncludes "club". Results are already ordered by linked founders; mention each directory tier. Use topTier only when the question asks for tier S or tier 1 specifically.
"Building in" a sector means search_people with building true and that sector.
"Backed by" means the investor argument. Recent grads use enrollment recent_grad.`;

const peopleInput = z.object({
  campus: z.string().nullish().describe("Campus short name, e.g. Penn or Berkeley"),
  enrollment: z.enum(["current_student", "recent_grad", "older_alumni"]).nullish(),
  standing: z.enum(["freshman", "sophomore", "junior", "senior"]).nullish(),
  classYear: z.number().int().nullish().describe("Graduation year such as 2028"),
  organization: z.string().nullish().describe("Club, lab, or program, e.g. M&T"),
  sector: z.string().nullish().describe("AI, healthcare, fintech, …"),
  investor: z.string().nullish().describe("Investor or program backing the startup, e.g. a16z speedrun"),
  city: z.string().nullish().describe("Headquarters city, e.g. NYC"),
  founderOnly: z.boolean().nullish(),
  building: z.boolean().nullish().describe("Person is building a startup"),
  verification: z.enum(["confirmed", "partial", "unverified"]).nullish(),
  name: z.string().nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
});

const startupInput = z.object({
  campus: z.string().nullish(),
  sector: z.string().nullish(),
  investor: z.string().nullish(),
  city: z.string().nullish(),
  verification: z.enum(["confirmed", "partial", "unverified"]).nullish(),
  name: z.string().nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
});

const orgInput = z.object({
  campus: z.string().nullish(),
  tier: z.enum(["S", "A", "B", "C", "D"]).nullish(),
  topTier: z.boolean().nullish().describe("Directory tiers S and A"),
  typeIncludes: z.string().nullish().describe("Substring of the directory type, e.g. club"),
  name: z.string().nullish(),
  minFounders: z.number().int().min(0).max(500).nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
});

const investorInput = z.object({
  name: z.string().nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
});

export interface AskStreamEvent {
  type: "text" | "matches" | "error";
  text?: string;
  matches?: AskHit[];
  message?: string;
}

function keepKnown(matches: AskHit[] | undefined, into: AskHit[], seen: Set<string>): void {
  for (const hit of matches ?? []) {
    if (!hit || seen.has(hit.id) || !isKnownAskId(hit.id)) continue;
    if (into.length >= 40) return;
    seen.add(hit.id);
    into.push(hit);
  }
}

export async function streamAsk(question: string, send: (event: AskStreamEvent) => void, model: LanguageModel | null = askAiLanguageModel()): Promise<void> {
  if (!model) {
    send({ type: "error", message: "Ask AI needs an API key" });
    return;
  }

  const hits: AskHit[] = [];
  const seen = new Set<string>();
  let buffer = "";
  let sentText = false;

  const publish = () => {
    if (hits.length) send({ type: "matches", matches: hits.slice() });
  };
  const flushText = () => {
    if (!buffer || hits.length === 0) return;
    send({ type: "text", text: buffer });
    buffer = "";
    sentText = true;
  };

  const result = streamText({
    model,
    system: SYSTEM,
    prompt: question,
    temperature: 0.2,
    maxRetries: 1,
    timeout: 25_000,
    stopWhen: isStepCount(4),
    prepareStep: ({ steps }) => ({ toolChoice: steps.length === 0 ? "required" : "auto" }),
    tools: {
      search_people: tool({
        description: "Search people in the Campus Scout database. Returns only stored records.",
        inputSchema: peopleInput,
        execute: async (input) => searchPeople(input),
      }),
      search_startups: tool({
        description: "Search investable startups in the Campus Scout database. Returns only stored records.",
        inputSchema: startupInput,
        execute: async (input) => searchStartups(input),
      }),
      search_organizations: tool({
        description: "Search hotspot organizations (clubs, labs, fellowships, accelerators), ranked by linked founders. Returns only directory rows.",
        inputSchema: orgInput,
        execute: async (input) => searchOrganizations(input),
      }),
      search_investors: tool({
        description: "Search investors recorded on startups in Campus Scout. Returns only stored investor names.",
        inputSchema: investorInput,
        execute: async (input) => searchInvestors(input),
      }),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === "tool-result") {
      const output = part.output as { matches?: AskHit[] } | undefined;
      keepKnown(output?.matches, hits, seen);
      publish();
      flushText();
    } else if (part.type === "text-delta") {
      buffer += part.text;
      flushText();
    } else if (part.type === "error") {
      throw part.error instanceof Error ? part.error : new Error("Ask AI stream failed");
    }
  }

  if (hits.length === 0) {
    send({ type: "matches", matches: [] });
    send({ type: "text", text: EMPTY_ANSWER });
    return;
  }
  if (!sentText) {
    const fallback = buffer.trim() || `${hits.length} Campus Scout records matched.`;
    send({ type: "text", text: fallback });
  }
}
