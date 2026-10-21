// Structured intent for Ask AI. Parsed in code before any model call so
// retrieval can filter records instead of hoping the model ignores them.

import { CAMPUSES } from "./campuses";

export type AskStage =
  | "pre-seed"
  | "angel"
  | "seed"
  | "series a"
  | "series b"
  | "series c"
  | "series d"
  | "series e"
  | "bootstrapped"
  | "unfunded";

export interface AskIntent {
  campus: string | null;
  /** Phrase in the question that named the campus, used to strip name leftovers. */
  campusPhrase: string | null;
  stage: AskStage | null;
  stagePhrase: string | null;
  sector: string | null;
  sectorPhrase: string | null;
  year: number | null;
  confirmedOnly: boolean;
  founderName: string | null;
  companyName: string | null;
  /** Residual name when the question does not say founder vs company. */
  name: string | null;
  startupFocus: boolean;
  founderFocus: boolean;
}

export interface FundingRoundView {
  stage: string | null;
  amountText: string | null;
  date: string | null;
  leads: string[];
}

export interface FundingInvestorView {
  name: string;
  round: string | null;
  kind: string | null;
  batch: string | null;
}

export interface FundingEventView {
  amount: number | null;
  instrument: string | null;
  date: string | null;
}

export interface FundingView {
  rounds: FundingRoundView[];
  investors: FundingInvestorView[];
  events: FundingEventView[];
  news: string[];
  fundingTotal: string | null;
  description: string | null;
}

export interface FundingFit {
  fits: boolean;
  /** Higher means a closer stage match. Zero means the record does not match. */
  relevance: number;
  /** YYYY-MM-DD, empty when no date is recorded. */
  recency: string;
  /** Actual recorded stage, for the card and the answer. */
  label: string;
}

const EXTRA_CAMPUS_ALIASES: { label: string; names: string[] }[] = [
  { label: "Penn", names: ["wharton", "wharton school", "the wharton school", "u penn", "pennsylvania"] },
];

const STAGE_PATTERNS: { stage: AskStage; re: RegExp }[] = [
  { stage: "pre-seed", re: /\bpre[-\s]*seeds?\b/i },
  { stage: "series a", re: /\bseries[\s-]*a\b/i },
  { stage: "series b", re: /\bseries[\s-]*b\b/i },
  { stage: "series c", re: /\bseries[\s-]*c\b/i },
  { stage: "series d", re: /\bseries[\s-]*d\b/i },
  { stage: "series e", re: /\bseries[\s-]*e\b/i },
  { stage: "angel", re: /\bangels?\b|\bfriends\s*(?:and|&)\s*family\b/i },
  { stage: "bootstrapped", re: /\bboot[\s-]*strapp(?:ed|ing)?\b|\bself[\s-]*funded\b/i },
  { stage: "unfunded", re: /\bunfunded\b|\bno funding\b|\bwithout funding\b|\bnot funded\b|\bzero funding\b|\bno (?:priced )?rounds?\b|\bhas(?: not|n't) raised\b|\bno raise\b/i },
  { stage: "seed", re: /\bseeds?\b/i },
];

const STAGE_FORMS: { stage: AskStage; form: string }[] = [
  { stage: "pre-seed", form: "preseed" },
  { stage: "bootstrapped", form: "bootstrapped" },
  { stage: "unfunded", form: "unfunded" },
  { stage: "series a", form: "seriesa" },
  { stage: "series b", form: "seriesb" },
  { stage: "series c", form: "seriesc" },
  { stage: "series d", form: "seriesd" },
  { stage: "series e", form: "seriese" },
  { stage: "angel", form: "angel" },
  { stage: "seed", form: "seed" },
];

const SECTOR_PATTERNS: { sector: string; re: RegExp; forms: string[] }[] = [
  { sector: "healthcare", re: /\b(?:digital[\s-]?health|health[\s-]?tech|health[\s-]?care|med[\s-]?tech|bio[\s-]?tech)\b/i, forms: ["healthcare", "healthtech", "medtech", "biotech", "digitalhealth"] },
  { sector: "robotics", re: /\brobotics?\b/i, forms: ["robotics", "robotic"] },
  { sector: "AI", re: /\bartificial intelligence\b|\bai\b/i, forms: ["ai"] },
  { sector: "fintech", re: /\bfintech\b/i, forms: ["fintech", "fintec"] },
  { sector: "climate", re: /\bclimate\b/i, forms: ["climate"] },
  { sector: "edtech", re: /\bedtech\b|\beducation tech\b/i, forms: ["edtech"] },
  { sector: "crypto", re: /\b(?:crypto|web3)\b/i, forms: ["crypto", "web3"] },
  { sector: "cybersecurity", re: /\bcybersecurity\b|\bcyber security\b/i, forms: ["cybersecurity"] },
  { sector: "dev tools", re: /\bdevtools\b|\bdev tools\b/i, forms: ["devtools"] },
];

const NAME_STOP = new Set([
  "any",
  "all",
  "some",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "which",
  "who",
  "are",
  "was",
  "has",
  "have",
  "most",
  "top",
  "tier",
  "building",
  "backed",
  "recent",
  "grads",
  "grad",
  "founders",
  "founder",
  "founded",
  "clubs",
  "club",
  "students",
  "student",
  "people",
  "person",
  "startup",
  "startups",
  "company",
  "companies",
  "campus",
  "show",
  "list",
  "only",
  "confirmed",
  "verified",
  "funding",
  "funded",
  "round",
  "rounds",
  "raised",
  "raises",
  "raising",
  "preseed",
  "seed",
  "angel",
  "series",
  "bootstrapped",
  "bootstrap",
  "unfunded",
  "named",
  "called",
  "please",
  "about",
  "into",
  "over",
  "their",
  "there",
  "these",
  "those",
  "early",
  "stage",
  "stages",
  "money",
  "check",
  "checks",
]);

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const EARLY_BANDS = new Set(["pre-seed", "angel", "friends", "grant", "fellowship", "prize"]);

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length]!;
}

function tokenClose(token: string, target: string): boolean {
  if (token === target) return true;
  if (target.length < 4 || token.length < 4) return false;
  if (Math.abs(token.length - target.length) > 2) return false;
  const limit = target.length >= 8 ? 2 : 1;
  return levenshtein(token, target) <= limit;
}

function campusRows(): { phrase: string; label: string }[] {
  const rows: { phrase: string; label: string }[] = [];
  for (const campus of CAMPUSES) {
    for (const name of [campus.shortLabel, campus.name, ...campus.aliases]) {
      const phrase = name.toLowerCase().replace(/\s+/g, " ").trim();
      if (phrase) rows.push({ phrase, label: campus.shortLabel });
    }
  }
  for (const extra of EXTRA_CAMPUS_ALIASES) {
    for (const name of extra.names) rows.push({ phrase: name, label: extra.label });
  }
  rows.sort((a, b) => b.phrase.length - a.phrase.length);
  return rows;
}

const CAMPUS_ROWS = campusRows();

function findCampus(question: string): { label: string; phrase: string } | null {
  const lower = question.toLowerCase();
  for (const row of CAMPUS_ROWS) {
    if (row.phrase.length < 2) continue;
    if (new RegExp(`\\b${escapeReg(row.phrase)}\\b`, "i").test(lower)) return row;
  }
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
  let best: { label: string; phrase: string; score: number } | null = null;
  for (const row of CAMPUS_ROWS) {
    const words = row.phrase.split(/\s+/).filter(Boolean);
    if (words.length === 1 && words[0]!.length < 5) continue;
    if (words.length > tokens.length) continue;
    for (let i = 0; i <= tokens.length - words.length; i += 1) {
      const slice = tokens.slice(i, i + words.length);
      if (!words.every((word, index) => tokenClose(slice[index]!, word))) continue;
      if (!best || row.phrase.length > best.score) best = { label: row.label, phrase: slice.join(" "), score: row.phrase.length };
    }
  }
  return best ? { label: best.label, phrase: best.phrase } : null;
}

function findStage(question: string): { stage: AskStage; phrase: string } | null {
  for (const pattern of STAGE_PATTERNS) {
    const match = question.match(pattern.re);
    if (match?.[0]) return { stage: pattern.stage, phrase: match[0] };
  }
  const tokens = question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !NAME_STOP.has(token));
  const windows = tokens.map((token, index) => (tokens[index + 1] ? `${token}${tokens[index + 1]}` : token));
  for (const window of [...tokens, ...windows]) {
    let best: { stage: AskStage; form: string; dist: number } | null = null;
    for (const form of STAGE_FORMS) {
      if (form.form.length < 4) continue;
      const dist = levenshtein(window, form.form);
      const limit = form.form.length >= 8 ? 2 : 1;
      if (dist === 0 || (dist <= limit && Math.abs(window.length - form.form.length) <= limit)) {
        if (!best || dist < best.dist) best = { stage: form.stage, form: form.form, dist };
      }
    }
    if (best && best.dist > 0) return { stage: best.stage, phrase: window };
  }
  return null;
}

function findSector(question: string): { sector: string; phrase: string } | null {
  for (const pattern of SECTOR_PATTERNS) {
    const match = question.match(pattern.re);
    if (match?.[0]) return { sector: pattern.sector, phrase: match[0] };
  }
  const tokens = question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 5);
  for (const token of tokens) {
    for (const pattern of SECTOR_PATTERNS) {
      for (const form of pattern.forms) {
        if (form.length < 5) continue;
        if (tokenClose(token, form)) return { sector: pattern.sector, phrase: token };
      }
    }
  }
  return null;
}

function expandYear(raw: string): number {
  const value = Number(raw);
  if (raw.length === 4) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

function findYear(question: string): number | null {
  const named = question.match(/\b(?:class of|cohort|year)\s+'?(\d{2,4})\b/i);
  if (named?.[1]) return expandYear(named[1]);
  const year = question.match(/\b(20\d{2})\b/);
  return year?.[1] ? Number(year[1]) : null;
}

function residualName(question: string, consumed: string[]): string | null {
  let text = ` ${question.toLowerCase()} `;
  const phrases = [...consumed].filter((phrase) => phrase.trim().length >= 2).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    text = text.replace(new RegExp(`\\b${escapeReg(phrase.toLowerCase())}\\b`, "g"), " ");
  }
  const tokens = text
    .split(/[^a-z0-9']+/)
    .filter((token) => token.length >= 3 && !NAME_STOP.has(token) && !/^\d+$/.test(token));
  if (!tokens.length || tokens.length > 4) return null;
  return tokens.join(" ");
}

export function parseAskIntent(question: string): AskIntent {
  const campus = findCampus(question);
  const stage = findStage(question);
  const sector = findSector(question);
  const year = findYear(question);
  const confirmedOnly = /\b(?:only\s+confirmed|confirmed\s+only|verified\s+only|only\s+verified)\b/i.test(question);
  const founderFocus = /\bfounders?\b|\bfounded by\b/i.test(question);
  const startupFocus = /\b(?:startups?|compan(?:y|ies))\b/i.test(question) && !founderFocus;
  const name = residualName(question, [campus?.phrase ?? "", stage?.phrase ?? "", sector?.phrase ?? "", confirmedOnly ? "confirmed only" : "", year ? String(year) : ""]);
  return {
    campus: campus?.label ?? null,
    campusPhrase: campus?.phrase ?? null,
    stage: stage?.stage ?? null,
    stagePhrase: stage?.phrase ?? null,
    sector: sector?.sector ?? null,
    sectorPhrase: sector?.phrase ?? null,
    year,
    confirmedOnly,
    founderName: name && founderFocus && !startupFocus ? name : null,
    companyName: name && startupFocus && !founderFocus ? name : null,
    name: name && founderFocus === startupFocus ? name : null,
    startupFocus,
    founderFocus,
  };
}

export function stageLabel(stage: AskStage): string {
  if (stage === "pre-seed") return "Pre-seed";
  if (stage === "series a" || stage === "series b" || stage === "series c" || stage === "series d" || stage === "series e") {
    return `Series ${stage.slice(-1).toUpperCase()}`;
  }
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function nearestStages(stage: AskStage): AskStage[] {
  switch (stage) {
    case "pre-seed":
      return ["seed", "angel", "series a", "series b"];
    case "angel":
      return ["pre-seed", "seed", "series a"];
    case "seed":
      return ["pre-seed", "series a", "series b"];
    case "series a":
      return ["seed", "series b", "pre-seed"];
    case "series b":
      return ["series a", "series c", "seed"];
    case "series c":
      return ["series b", "series a", "seed"];
    case "series d":
      return ["series c", "series b"];
    case "series e":
      return ["series d", "series c"];
    case "bootstrapped":
      return ["unfunded", "pre-seed", "seed"];
    case "unfunded":
      return ["pre-seed", "bootstrapped", "seed"];
    default:
      return [];
  }
}

export function intentSummary(intent: AskIntent): string {
  const bits: string[] = [];
  if (intent.campus) bits.push(`campus ${intent.campus}`);
  if (intent.stage) bits.push(`stage ${stageLabel(intent.stage)}`);
  if (intent.sector) bits.push(`sector ${intent.sector}`);
  if (intent.year) bits.push(`year ${intent.year}`);
  if (intent.confirmedOnly) bits.push("confirmed only");
  if (intent.founderName) bits.push(`founder ${intent.founderName}`);
  if (intent.companyName) bits.push(`company ${intent.companyName}`);
  else if (intent.name) bits.push(`name ${intent.name}`);
  if (!bits.length) return "";
  const preseed =
    intent.stage === "pre-seed"
      ? "Pre-seed includes labelled pre-seed, angel, friends and family, accelerator checks, grants, fellowships, and companies with no priced round. Name the stage each record actually shows.\n"
      : "";
  return `Filters already applied: ${bits.join(", ")}. Every record below matches those filters.\n${preseed}`;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[_/&-]+/g, " ").replace(/\s+/g, " ").trim();
}

function textBands(value: string | null | undefined): string[] {
  const text = norm(value);
  if (!text) return [];
  const bands: string[] = [];
  if (/pre ?seed/.test(text)) bands.push("pre-seed");
  if (/\bangel\b/.test(text)) bands.push("angel");
  if (/friends (?:and )?family/.test(text)) bands.push("friends");
  if (/\bfellowship\b/.test(text)) bands.push("fellowship");
  if (/\bgrant\b/.test(text)) bands.push("grant");
  if (/\bprize\b/.test(text)) bands.push("prize");
  if (/\bseed\b/.test(text) && !/pre ?seed/.test(text)) bands.push("seed");
  for (const match of text.matchAll(/\bseries\s+([a-e])\b/g)) bands.push(`series ${match[1]}`);
  if (/\bprivate placement\b/.test(text)) bands.push("private placement");
  if (/\bventure\b/.test(text)) bands.push("venture");
  if (/\bgrowth\b/.test(text)) bands.push("growth");
  if (/\bbootstrap/.test(text) || /self funded/.test(text)) bands.push("bootstrapped");
  return bands;
}

function isPriced(band: string): boolean {
  return band === "seed" || band.startsWith("series ") || band === "venture" || band === "growth" || band === "private placement";
}

function isAccelerator(investor: FundingInvestorView): boolean {
  const kind = (investor.kind ?? "").toLowerCase();
  if (kind === "accelerator") return true;
  return /\b(y combinator|\byc\b|techstars)\b/i.test(investor.name);
}

function isGrantInvestor(investor: FundingInvestorView): boolean {
  const kind = (investor.kind ?? "").toLowerCase();
  return kind === "grant" || /fellowship/i.test(investor.name);
}

export function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})(?:-(\d{2}))?\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${(iso[3] ?? "01").padStart(2, "0")}`;
  const batch = text.match(/\b(winter|spring|summer|fall|autumn)\s+(20\d{2})\b/i);
  if (batch) {
    const month = { winter: "01", spring: "04", summer: "07", fall: "10", autumn: "10" }[batch[1]!.toLowerCase()];
    return `${batch[2]}-${month}-01`;
  }
  const long = text.match(/\b([A-Za-z]+)\.?\s+(\d{1,2})?,?\s*(20\d{2})\b/);
  if (long) {
    const month = MONTHS[long[1]!.toLowerCase()];
    if (month) return `${long[3]}-${month}-${(long[2] ?? "01").padStart(2, "0")}`;
  }
  const year = text.match(/\b(20\d{2})\b/);
  return year ? `${year[1]}-01-01` : "";
}

export function fundingRecency(view: FundingView): string {
  const texts = [
    ...view.rounds.map((round) => round.date),
    ...view.events.map((event) => event.date),
    ...view.investors.map((investor) => investor.batch),
    ...view.news,
  ];
  let best = "";
  for (const text of texts) {
    const key = dateKey(text);
    if (key > best) best = key;
  }
  return best;
}

export function viewMentionsYear(view: FundingView, year: number): boolean {
  const needle = String(year);
  const blob = [
    ...view.rounds.map((round) => `${round.stage ?? ""} ${round.date ?? ""} ${round.amountText ?? ""}`),
    ...view.events.map((event) => event.date ?? ""),
    ...view.investors.map((investor) => `${investor.batch ?? ""} ${investor.round ?? ""}`),
    ...view.news,
    view.description ?? "",
  ].join(" ");
  return blob.includes(needle);
}

function formatRound(round: FundingRoundView): string {
  const parts = [round.stage, round.amountText].filter((part): part is string => Boolean(part));
  let text = parts.join(" ");
  if (round.date) text = text ? `${text} (${round.date})` : round.date;
  if (round.leads.length) text = text ? `${text} led by ${round.leads.slice(0, 3).join(", ")}` : `led by ${round.leads.slice(0, 3).join(", ")}`;
  return text;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

export function recordedLabel(view: FundingView): string {
  const rounds = view.rounds.map(formatRound).filter(Boolean);
  const accelerators = view.investors
    .filter(isAccelerator)
    .slice(0, 2)
    .map((investor) => `${investor.name} accelerator${investor.batch ? ` (${investor.batch})` : ""}`);
  const grants = view.investors.filter(isGrantInvestor).slice(0, 2).map((investor) => investor.name);
  const parts = [...rounds, ...accelerators, ...grants];
  const covered = new Set(parts.flatMap((part) => textBands(part)));
  const news = view.news.find((headline) => textBands(headline).some((band) => !covered.has(band) && (EARLY_BANDS.has(band) || isPriced(band))));
  if (news) parts.push(clip(news, 120));
  if (!parts.length) return "no priced round recorded";
  return parts.slice(0, 3).join("; ");
}

function newsBands(view: FundingView): string[] {
  return view.news.flatMap((headline) => textBands(headline));
}

function roundBands(view: FundingView): string[] {
  return view.rounds.flatMap((round) => [...textBands(round.stage), ...textBands(round.amountText)]);
}

function investorRoundBands(view: FundingView): string[] {
  return view.investors.flatMap((investor) => textBands(investor.round));
}

function pricedFromEvents(view: FundingView): boolean {
  return view.events.some((event) => {
    const instrument = (event.instrument ?? "").toLowerCase();
    return (instrument === "equity" || instrument === "debt") && (event.amount ?? 0) >= 2_000_000;
  });
}

function hasPricedSignal(view: FundingView): boolean {
  const bands = [...roundBands(view), ...investorRoundBands(view), ...newsBands(view)];
  return bands.some(isPriced) || pricedFromEvents(view);
}

function earlyRelevance(view: FundingView): number {
  const bands = [...roundBands(view), ...investorRoundBands(view), ...newsBands(view)];
  if (bands.includes("pre-seed")) return 100;
  if (bands.includes("angel") || bands.includes("friends")) return 90;
  if (bands.includes("fellowship") || bands.includes("grant") || view.investors.some(isGrantInvestor) || view.events.some((event) => (event.instrument ?? "").toLowerCase() === "grant")) return 70;
  if (bands.includes("prize")) return 65;
  if (view.investors.some(isAccelerator)) return 60;
  return 0;
}

function unknownRound(view: FundingView): boolean {
  return view.rounds.some((round) => {
    const bands = [...textBands(round.stage), ...textBands(round.amountText)];
    if (!bands.length) return true;
    return bands.every((band) => !EARLY_BANDS.has(band) && !isPriced(band) && band !== "bootstrapped");
  });
}

function isEmptyFunding(view: FundingView): boolean {
  return !view.rounds.length && !view.events.length && !view.investors.length && !view.fundingTotal && !view.news.length;
}

function miss(recency: string, label: string): FundingFit {
  return { fits: false, relevance: 0, recency, label };
}

export function fundingFit(view: FundingView, stage: AskStage): FundingFit {
  const recency = fundingRecency(view);
  const label = recordedLabel(view);
  const bands = [...roundBands(view), ...investorRoundBands(view), ...newsBands(view)];
  const described = textBands(view.description);
  if (stage === "pre-seed") {
    if (hasPricedSignal(view)) return miss(recency, label);
    const early = earlyRelevance(view);
    if (unknownRound(view) && early === 0) return miss(recency, label);
    if (early > 0) return { fits: true, relevance: early, recency, label };
    if (!view.rounds.length && !pricedFromEvents(view)) return { fits: true, relevance: 40, recency, label };
    return miss(recency, label);
  }
  if (stage === "angel") {
    const ok = bands.includes("angel") || bands.includes("friends");
    return ok ? { fits: true, relevance: 100, recency, label } : miss(recency, label);
  }
  if (stage === "seed") {
    const ok = bands.includes("seed");
    return ok ? { fits: true, relevance: 100, recency, label } : miss(recency, label);
  }
  if (stage.startsWith("series ")) {
    const ok = bands.includes(stage);
    return ok ? { fits: true, relevance: 100, recency, label } : miss(recency, label);
  }
  if (stage === "bootstrapped") {
    const ok = (bands.includes("bootstrapped") || described.includes("bootstrapped")) && !hasPricedSignal(view);
    return ok ? { fits: true, relevance: 100, recency, label: label === "no priced round recorded" ? "bootstrapped" : label } : miss(recency, label);
  }
  if (stage === "unfunded") {
    const ok = isEmptyFunding(view);
    return ok ? { fits: true, relevance: 100, recency, label: "no recorded funding" } : miss(recency, label);
  }
  return miss(recency, label);
}

export function fuzzyNameHit(name: string, query: string): boolean {
  const left = name.toLowerCase();
  const right = query.toLowerCase().trim();
  if (!right) return true;
  if (left.includes(right)) return true;
  const tokens = right.split(/\s+/).filter((token) => token.length >= 3);
  if (!tokens.length) return false;
  const parts = left.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every((token) => parts.some((part) => part.includes(token) || (part.length >= 4 && token.length >= 4 && tokenClose(part, token))));
}

export function emptyFundingView(): FundingView {
  return { rounds: [], investors: [], events: [], news: [], fundingTotal: null, description: null };
}
