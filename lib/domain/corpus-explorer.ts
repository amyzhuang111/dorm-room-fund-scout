/**
 * Full-corpus explorer rows from real directory + company_facts fields only.
 * Nothing invented; missing values stay null and render as Not available.
 */
import { getDb } from "@/lib/db/client";
import {
  buildDirectoryFromDb,
  type DirectoryCard,
  type DirectorySort,
  directorySortOf,
  searchDirectory,
  sortDirectory,
} from "@/lib/domain/directory";
import { localCompanyLogoUrl } from "@/lib/domain/local-logos";

export const CORPUS_PAGE_SIZE = 25;

export type CorpusSort = DirectorySort | "signals" | "founded";

export interface CorpusRow {
  id: string;
  name: string;
  campus: string | null;
  sector: string | null;
  stage: string | null;
  foundedYear: number | null;
  hq: string | null;
  status: string | null;
  signals: number;
  latestSignalAt: string | null;
  signalLabel: string | null;
  primaryProgram: string | null;
  ycBatch: string | null;
  founders: string[];
  founderCount: number;
  website: string | null;
  fundingText: string | null;
  logoUrl: string | null;
  kind: string;
  scoutingStatus: string;
  verification: string;
  sourceUrls: string[];
  campusIds: string[];
}

export interface CorpusPage {
  rows: CorpusRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function ycBatchFromPrograms(programs: string[]): string | null {
  for (const p of programs) {
    const m = p.match(/Y Combinator(?:\s+(.+))?/i);
    if (m) return (m[1] ?? "Y Combinator").trim() || "Y Combinator";
  }
  return null;
}

function factMaps(): {
  website: Map<string, string>;
  funding: Map<string, string>;
  ycBatch: Map<string, string>;
} {
  const db = getDb();
  const website = new Map<string, string>();
  const funding = new Map<string, string>();
  const ycBatch = new Map<string, string>();
  const rows = db
    .prepare(
      `SELECT project_id, fact_key, value_text, detail_json
       FROM company_facts
       WHERE fact_key IN ('website', 'funding_total', 'funding_round', 'investor')`
    )
    .all() as { project_id: string; fact_key: string; value_text: string; detail_json: string }[];
  for (const row of rows) {
    if (row.fact_key === "website" && row.value_text && !website.has(row.project_id)) {
      website.set(row.project_id, row.value_text);
    }
    if (row.fact_key === "funding_total" && row.value_text && !funding.has(row.project_id)) {
      funding.set(row.project_id, row.value_text);
    }
    if (row.fact_key === "funding_round" && row.value_text && !funding.has(row.project_id)) {
      try {
        const detail = JSON.parse(row.detail_json || "{}") as { amountText?: string; stage?: string };
        const amount = typeof detail.amountText === "string" ? detail.amountText.trim() : "";
        const stage = typeof detail.stage === "string" ? detail.stage.trim() : "";
        const label = amount && stage ? `${stage} ${amount}` : amount || stage || row.value_text;
        if (label) funding.set(row.project_id, label);
      } catch {
        funding.set(row.project_id, row.value_text);
      }
    }
    if (row.fact_key === "investor" && /y combinator/i.test(row.value_text)) {
      try {
        const detail = JSON.parse(row.detail_json || "{}") as { batch?: string };
        const batch = typeof detail.batch === "string" && detail.batch.trim() ? detail.batch.trim() : null;
        if (!ycBatch.has(row.project_id)) ycBatch.set(row.project_id, batch ?? "Y Combinator");
      } catch {
        if (!ycBatch.has(row.project_id)) ycBatch.set(row.project_id, "Y Combinator");
      }
    }
  }
  return { website, funding, ycBatch };
}

export function cardToCorpusRow(
  card: DirectoryCard,
  extras?: { website?: string | null; fundingText?: string | null; ycBatch?: string | null }
): CorpusRow {
  return {
    id: card.id,
    name: card.name,
    campus: card.school,
    sector: card.sector,
    stage: card.stage,
    foundedYear: card.foundedYear,
    hq: card.hqRegion,
    status: card.operatingStatus,
    signals: card.signals,
    latestSignalAt: card.latestSignalAt,
    signalLabel: card.signalLabel,
    primaryProgram: card.primaryProgram,
    ycBatch: extras?.ycBatch ?? ycBatchFromPrograms(card.programs),
    founders: card.founders,
    founderCount: card.founders.length,
    website: extras?.website ?? null,
    fundingText: extras?.fundingText ?? null,
    logoUrl: card.logoUrl ?? localCompanyLogoUrl(card.id),
    kind: "company", scoutingStatus: "Needs review", verification: "unverified", sourceUrls: [], campusIds: card.schoolId ? [card.schoolId] : [],
  };
}

export function loadCorpusRows(): CorpusRow[] {
  const { cards } = buildDirectoryFromDb({ includeAll: true });
  const db = getDb();
  const extras = factMaps();
  const meta = new Map((db.prepare("SELECT id,kind,website_url,is_investable_candidate,excluded_reason,verification_status FROM projects").all() as {id:string;kind:string;website_url:string|null;is_investable_candidate:number;excluded_reason:string|null;verification_status:string|null}[]).map(r=>[r.id,r]));
  const sources = new Map<string, Set<string>>();
  for (const r of db.prepare("SELECT entity_id id,source_url url FROM claims WHERE entity_type='project' UNION SELECT project_id id,source_url url FROM company_facts").all() as {id:string;url:string|null}[]) {
    if (r.url && /^https?:\/\//i.test(r.url)) { const set=sources.get(r.id)??new Set<string>();set.add(r.url);sources.set(r.id,set); }
  }
  const campuses = new Map<string, Set<string>>();
  for(const r of db.prepare(`SELECT r.project_id id,a.university_id campus FROM person_project_roles r JOIN affiliations a ON a.person_id=r.person_id WHERE a.university_id IS NOT NULL
    UNION SELECT source_entity_id id,target_entity_id campus FROM relationships WHERE source_entity_type='project' AND target_entity_type='university' AND relationship_type='affiliated_with'`).all() as {id:string;campus:string}[]) {
    const set=campuses.get(r.id)??new Set<string>();set.add(r.campus);campuses.set(r.id,set);
  }
  return cards.map(card => {
    const m=meta.get(card.id)!;
    return {...cardToCorpusRow(card,{website:m.website_url??extras.website.get(card.id)??null,fundingText:extras.funding.get(card.id)??null,ycBatch:extras.ycBatch.get(card.id)}),
      kind:m.kind, scoutingStatus:m.kind !== 'company' ? 'Project / team' : m.is_investable_candidate ? 'Scouting list' : m.excluded_reason === 'unverified recency' || !m.excluded_reason ? 'Needs review' : 'Excluded from scouting list',
      verification:m.verification_status||'unverified',sourceUrls:[...(sources.get(card.id)??[])].sort(),campusIds:[...(campuses.get(card.id)??[])]};
  });
}
export type CorpusOptions = { q?:string; sector?:string; campus?:string; sort?:string; scope?:string; kind?:string; page?:number };
export function filterCorpus(opts: CorpusOptions = {}): CorpusRow[] {
  let rows=loadCorpusRows();
  const {cards}=buildDirectoryFromDb({includeAll:true});
  const allow=new Set(searchDirectory(cards,opts.q).filter(c=>!opts.sector||c.sectorId===opts.sector).map(c=>c.id));
  rows=rows.filter(r=>allow.has(r.id)&&(!opts.campus||r.campusIds.includes(opts.campus))&&(!opts.kind||r.kind===opts.kind));
  if(opts.scope==='scout')rows=rows.filter(r=>r.scoutingStatus==='Scouting list');
  if(opts.scope==='review')rows=rows.filter(r=>r.scoutingStatus==='Needs review');
  if(opts.scope==='excluded')rows=rows.filter(r=>r.scoutingStatus==='Excluded from scouting list');
  return sortCorpus(rows,corpusSortOf(opts.sort));
}

function sortCorpus(rows: CorpusRow[], sort: CorpusSort): CorpusRow[] {
  const copy = [...rows];
  if (sort === "signals") {
    copy.sort((a, b) => b.signals - a.signals || a.name.localeCompare(b.name));
    return copy;
  }
  if (sort === "founded") {
    copy.sort((a, b) => {
      const ay = a.foundedYear ?? -1;
      const by = b.foundedYear ?? -1;
      if (ay !== by) return by - ay;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }
  // Reuse directory sort via card-shaped shim for name/recent/stage/rank
  const asCards = copy.map(
    (r) =>
      ({
        id: r.id,
        name: r.name,
        description: null,
        school: r.campus,
        schoolId: null,
        schoolSlug: null,
        sectorId: null,
        sector: r.sector,
        stage: r.stage,
        signalLabel: null,
        signalKind: null,
        signals: r.signals,
        founders: r.founders,
        latestSignalAt: r.latestSignalAt,
        logoUrl: r.logoUrl,
        foundedYear: r.foundedYear,
        operatingStatus: (r.status as "acquired" | "dead" | null) ?? null,
        hqRegion: r.hq,
        primaryProgram: r.primaryProgram,
        programs: r.primaryProgram ? [r.primaryProgram] : [],
      }) satisfies DirectoryCard
  );
  const sorted = sortDirectory(asCards, sort);
  const byId = new Map(copy.map((r) => [r.id, r]));
  return sorted.map((c) => byId.get(c.id)!).filter(Boolean);
}

export function corpusSortOf(value: string | undefined): CorpusSort {
  if (value === "signals" || value === "founded") return value;
  return directorySortOf(value);
}
export function paginateCorpus(opts: CorpusOptions): CorpusPage {
  const pageSize = CORPUS_PAGE_SIZE;
  const page = Number.isFinite(opts.page) ? Math.max(1, Math.floor(opts.page!)) : 1;
  const rows = filterCorpus(opts);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export function corpusToCsv(rows: CorpusRow[]): string {
  const headers = [
    "id",
    "name",
    "campus",
    "sector",
    "stage",
    "founded_year",
    "hq",
    "status",
    "signals",
    "latest_signal_at",
    "signal_label",
    "primary_program",
    "yc_batch",
    "founder_count",
    "founders",
    "website",
    "funding", "record_type", "scouting_status", "verification_status", "source_urls",
  ];
  const esc = (v: string | number | null | undefined) => {
    if (v == null || v === "") return "";
    const raw = String(v);
    const s = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.name,
        r.campus,
        r.sector,
        r.stage,
        r.foundedYear,
        r.hq,
        r.status,
        r.signals,
        r.latestSignalAt,
        r.signalLabel,
        r.primaryProgram,
        r.ycBatch,
        r.founderCount,
        r.founders.join(" · "),
        r.website,
        r.fundingText, r.kind, r.scoutingStatus, r.verification, r.sourceUrls.join(" | "),
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export interface CorpusFillRates {
  total: number;
  stage: number;
  founded: number;
  sector: number;
  funding: number;
  website: number;
}

/** Counts derived from all stored projects, as in the unfiltered /data view. */
export function loadCorpusFillRates(): CorpusFillRates {
  const rows = loadCorpusRows();
  const total = rows.length;
  return {
    total,
    stage: rows.filter((r) => r.stage).length,
    founded: rows.filter((r) => r.foundedYear != null).length,
    sector: rows.filter((r) => r.sector).length,
    funding: rows.filter((r) => r.fundingText).length,
    website: rows.filter((r) => r.website).length,
  };
}

