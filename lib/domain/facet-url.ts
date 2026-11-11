/**
 * Serialize / hydrate company FacetState into shareable URL query params.
 * Keys: q, sector, kind, campus, stage, status, flag, year, hq, country, recency,
 *       sectorMissing, yearMissing, sort, feed, more, c (selected company).
 */
import { stageFilter, fundingStageLabel } from "./funding-stage";
import type { DirectorySort } from "./directory";
import {
  type FlagId,
  type RecencyId,
  type StatusId,
} from "@/lib/domain/sample-facets";

/** Mirrors components/sample-instrument FacetState (kept here to avoid client import). */
export type FacetState = {
  query: string;
  sector: string | null;
  sectorMissing: boolean;
  kind: string | null;
  stage: string | null;
  campus: string | null;
  country: string | null;
  recency: RecencyId | null;
  foundedYear: number | null;
  yearMissing: boolean;
  status: StatusId | null;
  flag: FlagId | null;
  hqRegion: string | null;
  network?: string | null;
  missing?: string | null;
};

export function emptyFacets(): FacetState {
  return {
    query: "",
    sector: null,
    sectorMissing: false,
    kind: null,
    stage: null,
    campus: null,
    country: null,
    recency: null,
    foundedYear: null,
    yearMissing: false,
    status: null,
    flag: null,
    hqRegion: null,
    network: null,
    missing: null,
  };
}

export type BrowseFeed = "directory" | "leaderboard" | "world";

export type BrowseUrlOpts = {
  feed?: BrowseFeed;
  facets?: Partial<FacetState> | FacetState;
  sort?: DirectorySort;
  more?: number;
  /** Selected company id for map/list continuity */
  c?: string | null;
  basePath?: string;
};

const STATUS_OK = new Set(["active", "acquired", "closed", "unknown"]);
const FLAG_OK = new Set(["new", "signaled", "funded", "founders"]);
const RECENCY_OK = new Set(["month", "year", "older", "future", "none"]);

export function facetsFromSearchParams(
  sp: Record<string, string | undefined> | URLSearchParams,
): FacetState {
  const get = (key: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
    return sp[key];
  };
  const base = emptyFacets();
  const q = get("q")?.trim() ?? "";
  const sector = get("sector")?.trim() || null;
  const kind = get("kind")?.trim() || null;
  const campus = get("campus")?.trim() || null;
  const stage = stageFilter(get("stage")) || null;
  const statusRaw = get("status")?.trim()?.toLowerCase() || null;
  const status = statusRaw && STATUS_OK.has(statusRaw) ? (statusRaw as StatusId) : null;
  const flagRaw = get("flag")?.trim()?.toLowerCase() || null;
  const flag = flagRaw && FLAG_OK.has(flagRaw) ? (flagRaw as FlagId) : null;
  const yearRaw = get("year")?.trim();
  let foundedYear: number | null = null;
  const yearMissing = get("yearMissing") === "1" || yearRaw === "missing";
  if (yearRaw && yearRaw !== "missing") {
    const n = Number(yearRaw);
    if (Number.isFinite(n)) foundedYear = n;
  }
  const hqRegion = get("hq")?.trim() || get("hqRegion")?.trim() || null;
  const country = get("country")?.trim() || null;
  const recencyRaw = get("recency")?.trim()?.toLowerCase() || null;
  const recency = recencyRaw && RECENCY_OK.has(recencyRaw) ? (recencyRaw as RecencyId) : null;
  const sectorMissing = get("sectorMissing") === "1";

  return {
    ...base,
    query: q,
    network: get("network")?.trim() || null,
    missing: get("missing")?.trim() || null,
    sector,
    sectorMissing,
    kind,
    stage,
    campus,
    country,
    recency,
    foundedYear,
    yearMissing,
    status,
    flag,
    hqRegion,
  };
}

export function browseHref(opts: BrowseUrlOpts): string {
  const query = new URLSearchParams();
  const feed = opts.feed ?? "directory";
  if (feed && feed !== "directory") query.set("feed", feed);

  const f = { ...emptyFacets(), ...(opts.facets ?? {}) };
  if (f.network) query.set("network", f.network);
  if (f.missing) query.set("missing", f.missing);
  if (f.sector) query.set("sector", f.sector);
  if (f.sectorMissing) query.set("sectorMissing", "1");
  if (f.kind) query.set("kind", f.kind);
  if (f.campus) query.set("campus", f.campus);
  if (f.stage) query.set("stage", f.stage);
  if (f.status) query.set("status", f.status);
  if (f.flag) query.set("flag", f.flag);
  if (f.yearMissing) query.set("year", "missing");
  else if (f.foundedYear != null) query.set("year", String(f.foundedYear));
  if (f.hqRegion) query.set("hq", f.hqRegion);
  if (f.country) query.set("country", f.country);
  if (f.recency) query.set("recency", f.recency);
  const q = f.query?.trim();
  if (q) query.set("q", q);

  if (opts.sort && opts.sort !== "rank") query.set("sort", opts.sort);
  if (opts.more && opts.more > 1) query.set("more", String(opts.more));
  if (opts.c) query.set("c", opts.c);

  const base = opts.basePath ?? "/companies";
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}

export function activeFacetChips(
  facets: FacetState,
  labels: {
    sector?: string | null;
    kind?: string | null;
    campus?: string | null;
    stage?: string | null;
    status?: string | null;
    flag?: string | null;
    year?: string | null;
    hq?: string | null;
    country?: string | null;
    recency?: string | null;
  } = {},
): { key: keyof FacetState | "query"; label: string; clear: Partial<FacetState> }[] {
  const chips: { key: keyof FacetState | "query"; label: string; clear: Partial<FacetState> }[] = [];
  if (facets.network) chips.push({key:"network",label:facets.network,clear:{network:null}});
  if (facets.missing) chips.push({key:"missing",label:`Missing ${facets.missing}`,clear:{missing:null}});
  if (facets.query.trim()) {
    chips.push({ key: "query", label: `“${facets.query.trim()}”`, clear: { query: "" } });
  }
  if (facets.status) {
    chips.push({
      key: "status",
      label: labels.status ?? facets.status,
      clear: { status: null },
    });
  }
  if (facets.flag) {
    chips.push({ key: "flag", label: labels.flag ?? facets.flag, clear: { flag: null } });
  }
  if (facets.foundedYear != null || facets.yearMissing) {
    chips.push({
      key: "foundedYear",
      label: labels.year ?? (facets.yearMissing ? "Year unknown" : String(facets.foundedYear)),
      clear: { foundedYear: null, yearMissing: false },
    });
  }
  if (facets.stage) {
    chips.push({ key: "stage", label: labels.stage ?? fundingStageLabel(facets.stage), clear: { stage: null } });
  }
  if (facets.sector || facets.sectorMissing) {
    chips.push({
      key: "sector",
      label: labels.sector ?? (facets.sectorMissing ? "No sector" : facets.sector!),
      clear: { sector: null, sectorMissing: false },
    });
  }
  if (facets.kind) {
    chips.push({ key: "kind", label: labels.kind ?? facets.kind, clear: { kind: null } });
  }
  if (facets.campus) {
    chips.push({ key: "campus", label: labels.campus ?? facets.campus, clear: { campus: null } });
  }
  if (facets.hqRegion) {
    chips.push({ key: "hqRegion", label: labels.hq ?? facets.hqRegion, clear: { hqRegion: null } });
  }
  if (facets.country) {
    chips.push({ key: "country", label: labels.country ?? facets.country, clear: { country: null } });
  }
  if (facets.recency) {
    chips.push({ key: "recency", label: labels.recency ?? facets.recency, clear: { recency: null } });
  }
  return chips;
}
