import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { domainKey, isHidden } from "@/lib/domain/feedback";
import { buildHref } from "@/lib/domain/url";
import { topConnectors } from "@/lib/domain/connectors";
import { listNews } from "@/lib/domain/news";
import { TopConnectors } from "@/components/top-connectors";
import { CompanyWebsiteIcon } from "@/components/company-website";
import { CampusSeal } from "@/components/campus-seal";
import { LogoMark } from "@/components/sample-instrument";
import { localCompanyLogoUrl } from "@/lib/domain/local-logos";
import { PrecollegeBadges } from "@/components/badges";
import type { PrecollegeSignalView } from "@/lib/domain/precollege";

interface SignalRow {
  id: string;
  project_id: string;
  project_kind: string;
  project_name: string;
  website_url: string | null;
  primary_link: string | null;
  founder_name: string | null;
  university_name: string | null;
  university_ids: string | null;
  signal_type: string;
  current_observation: string;
  significance_note: string | null;
  source_date: string | null;
  source_name: string | null;
  source_url: string | null;
  created_at: string;
}

const SIGNALS_PAGE_SIZE = 40;

const TYPE_LABEL: Record<string, string> = {
  demo: "Product launch",
  continued_dev: "Technical release",
  award: "Award",
  funding: "Funding",
  customer_evidence: "Customer evidence",
  team_change: "Team change",
  accelerator: "Accelerator",
  launch: "Launch",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Stored precision only. A month or a year never gains a day. */
function formatSignalDate(value: string): string {
  const stored = value.trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored);
  if (full) {
    const month = MONTHS[Number(full[2]) - 1];
    const day = Number(full[3]);
    if (month && day >= 1 && day <= 31) return `${month} ${day}, ${full[1]}`;
  }
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(stored);
  if (monthOnly) {
    const month = MONTHS[Number(monthOnly[2]) - 1];
    if (month) return `${month} ${monthOnly[1]}`;
  }
  if (/^\d{4}$/.test(stored)) return stored;
  return stored;
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function formatMonthDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface PrecollegeFeedRow {
  id: string;
  person_id: string;
  person_name: string;
  founder_status: string | null;
  university_id: string | null;
  university_name: string | null;
  signal_type: string;
  tier: number;
  label: string;
  year: number | null;
  match_status: "confirmed" | "likely";
  source_url: string;
  excerpt: string;
}

function listPrecollegeFeed(): PrecollegeFeedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.person_id, pe.name as person_name, pe.founder_status,
              (SELECT a.university_id FROM affiliations a WHERE a.person_id = pe.id LIMIT 1) as university_id,
              (SELECT u.name FROM affiliations a JOIN universities u ON u.id = a.university_id WHERE a.person_id = pe.id LIMIT 1) as university_name,
              s.signal_type, s.tier, s.label, s.year, s.match_status, s.source_url, s.excerpt
       FROM precollege_signals s
       JOIN people pe ON pe.id = s.person_id
       ORDER BY s.tier ASC, s.match_status ASC, pe.name`
    )
    .all() as PrecollegeFeedRow[];
}

function listAllSignals(): SignalRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.project_id, p.kind as project_kind, p.name as project_name, p.website_url, p.primary_link,
              (SELECT pe.name FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = p.id AND ppr.role LIKE '%founder%' LIMIT 1) as founder_name,
              (SELECT group_concat(name, ' · ') FROM (
                 SELECT DISTINCT u.name as name FROM (
                   SELECT a.university_id as id FROM person_project_roles ppr JOIN affiliations a ON a.person_id = ppr.person_id
                    WHERE ppr.project_id = s.project_id AND a.university_id IS NOT NULL
                   UNION
                   SELECT r.target_entity_id FROM relationships r
                    WHERE r.source_entity_type = 'project' AND r.source_entity_id = s.project_id AND r.target_entity_type = 'university'
                 ) ids JOIN universities u ON u.id = ids.id
              )) as university_name,
              (SELECT group_concat(id, ',') FROM (
                 SELECT DISTINCT u.id as id FROM (
                   SELECT a.university_id as id FROM person_project_roles ppr JOIN affiliations a ON a.person_id = ppr.person_id
                    WHERE ppr.project_id = s.project_id AND a.university_id IS NOT NULL
                   UNION
                   SELECT r.target_entity_id FROM relationships r
                    WHERE r.source_entity_type = 'project' AND r.source_entity_id = s.project_id AND r.target_entity_type = 'university'
                 ) ids JOIN universities u ON u.id = ids.id
              )) as university_ids,
              s.signal_type, s.current_observation, s.significance_note, s.source_date, s.created_at,
              (SELECT src.name FROM claims c JOIN sources src ON src.id = c.source_id WHERE c.id IN (SELECT value FROM json_each(s.claim_ids_json)) ORDER BY c.retrieved_at DESC LIMIT 1) as source_name,
              (SELECT c.source_url FROM claims c WHERE c.id IN (SELECT value FROM json_each(s.claim_ids_json)) AND c.source_url IS NOT NULL AND c.source_url != '' ORDER BY c.retrieved_at DESC LIMIT 1) as source_url
       FROM signals s JOIN projects p ON p.id = s.project_id
       ORDER BY (s.source_date IS NULL OR trim(s.source_date) = ''), s.source_date DESC, s.created_at DESC`
    )
    .all() as SignalRow[];
}

export default async function SignalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const universities = listUniversities();
  const review = await readReviewState();
  const allSignals = listAllSignals().filter(
    (s) =>
      !isHidden(review.records, {
        entityType: "project",
        entityId: s.project_id,
        name: s.project_name,
        domain: domainKey(s.website_url || s.primary_link),
      })
  );
  const types = [...new Set(allSignals.map((s) => s.signal_type))];
  const precollegeFeed = listPrecollegeFeed();
  const precollegeOn = sp.precollege === "any" || sp.precollege === "1" || sp.precollege === "2";

  const signals = allSignals.filter((s) => {
    if (precollegeOn) return false;
    if (sp.university && !(s.university_ids ?? "").split(",").includes(sp.university)) return false;
    if (sp.type && sp.type !== "press" && s.signal_type !== sp.type) return false;
    return true;
  });
  const precollege = precollegeFeed.filter((row) => {
    if (!precollegeOn) return false;
    if (sp.university && row.university_id !== sp.university) return false;
    if (sp.precollege === "1" && row.tier !== 1) return false;
    if (sp.precollege === "2" && row.tier !== 2) return false;
    return true;
  });

  const press = sp.type === "press" ? listNews({ limit: 40 }) : [];
  const connectorsOn = sp.connectors === "1";
  const basePath = "/signals";
  const withSourceDate = allSignals.filter((s) => Boolean(s.source_date && s.source_date.trim())).length;
  const withoutSourceDate = allSignals.length - withSourceDate;
  const page = Math.max(1, Number(sp.page || "1") || 1);
  const feedTotal = precollegeOn ? precollege.length : sp.type === "press" ? press.length : signals.length;
  const pageCount = Math.max(1, Math.ceil(feedTotal / SIGNALS_PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const sliceStart = (pageSafe - 1) * SIGNALS_PAGE_SIZE;
  const pressPage = press.slice(sliceStart, sliceStart + SIGNALS_PAGE_SIZE);
  const precollegePage = precollege.slice(sliceStart, sliceStart + SIGNALS_PAGE_SIZE);
  const signalsPage = signals.slice(sliceStart, sliceStart + SIGNALS_PAGE_SIZE);
  const hrefPage = (n: number) => buildHref(basePath, sp, { page: n <= 1 ? null : String(n) });
  const filtersActive = Boolean(sp.university || sp.type || sp.precollege || sp.connectors);
  const campusChips = universities
    .filter((u) => allSignals.some((s) => (s.university_ids ?? "").split(",").includes(u.id)))
    .filter((u, i, arr) => sp.university === u.id || i < 24 || arr.length <= 24);

  return (
    <div className="mx-auto max-w-[1100px] px-3 pb-10 pt-5 sm:px-6 sm:pb-12 sm:pt-8" data-signals-page="">
      <p className="scout-kicker">Activity</p>
      <h1 className="mt-0.5 scout-display text-[28px] leading-none text-[color:var(--fg,#0B0E17)] sm:text-[40px]">Signals</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[color:var(--fg-2,#3F465C)] sm:text-[14px]">
        Recent company and founder activity, by date, for every campus that has a stored signal.
      </p>
      <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[color:var(--fg-3,#5C647A)]">
        {withSourceDate.toLocaleString("en-US")} with a source date · {withoutSourceDate.toLocaleString("en-US")} indexed without one · listed source date first
      </p>

      {/* Count + rows first; filter cloud collapsed so feed clears the fold */}
      {connectorsOn ? (
        <TopConnectors lists={topConnectors(sp.university)} activeCampus={sp.university ?? null} basePath={basePath} current={sp} />
      ) : (
      <>
      {!precollegeOn && sp.type !== "press" ? (
        <p className="mt-3 font-mono text-[13px] tabular-nums text-[color:var(--fg-2,#3F465C)]">
          <span className="num font-bold text-[color:var(--ember,#D96B1C)]">{feedTotal.toLocaleString("en-US")}</span>
          {" signals"}
          {feedTotal > SIGNALS_PAGE_SIZE ? (
            <>
              {" · page "}
              {pageSafe.toLocaleString("en-US")}
              {" of "}
              {pageCount.toLocaleString("en-US")}
              {" · "}
              {SIGNALS_PAGE_SIZE}
              {" per page"}
            </>
          ) : null}
        </p>
      ) : null}

      <details className="mt-2 border-b border-[color:var(--line,#E1E5EF)] pb-2" data-signals-filters="">
        <summary className="cursor-pointer list-none font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)] [&::-webkit-details-marker]:hidden">
          {filtersActive ? "Filters on" : "Filters"}
          <span className="ml-2 font-normal normal-case tracking-normal text-[color:var(--fg-3,#5C647A)]">
            {filtersActive ? " · tap to change" : " · campus, type, connectors"}
          </span>
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <Link
            href={buildHref(basePath, sp, { connectors: connectorsOn ? null : "1", precollege: null, type: null, page: null })}
            className={`rounded-full border px-2 py-0.5 ${connectorsOn ? "border-[color:var(--fg,#0B0E17)] bg-[color:var(--fg,#0B0E17)] text-white" : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg,#0B0E17)]"}`}
          >
            Top connectors
          </Link>
          {!connectorsOn && (
            <>
              {(
                [
                  ["any", "Pre-college excellence"],
                  ["1", "Tier 1"],
                  ["2", "Tier 2"],
                ] as const
              ).map(([val, label]) => (
                <Link
                  key={val}
                  href={buildHref(basePath, sp, { precollege: sp.precollege === val ? null : val, type: null, page: null })}
                  className={`rounded-full border px-2 py-0.5 ${sp.precollege === val ? "border-[color:var(--fg,#0B0E17)] bg-[color:var(--fg,#0B0E17)] text-white" : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg,#0B0E17)]"}`}
                >
                  {label}
                </Link>
              ))}
              {campusChips.map((u) => (
                <Link
                  key={u.id}
                  href={buildHref(basePath, sp, { university: sp.university === u.id ? null : u.id, page: null })}
                  className={`rounded-full border px-2 py-0.5 ${sp.university === u.id ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white" : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg-3,#5C647A)]"}`}
                >
                  {u.name}
                </Link>
              ))}
              {types.map((t) => (
                <Link
                  key={t}
                  href={buildHref(basePath, sp, { type: sp.type === t ? null : t, page: null })}
                  className={`rounded-full border px-2 py-0.5 ${sp.type === t ? "border-[color:var(--ember,#D96B1C)] bg-[color:var(--ember,#D96B1C)] text-white" : "border-[color:var(--line,#E1E5EF)] text-[color:var(--fg-3,#5C647A)]"}`}
                >
                  {TYPE_LABEL[t] ?? t}
                </Link>
              ))}
            </>
          )}
          {filtersActive ? (
            <Link href={basePath} className="rounded-full border border-[color:var(--line,#E1E5EF)] px-2 py-0.5 text-[color:var(--cobalt,#2F4FD8)] underline">
              Clear
            </Link>
          ) : null}
        </div>
      </details>

      <ul className="mt-3 space-y-2">
        {pressPage.map((item) => (
          <li key={item.id} className="rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-raised,#FFFFFF)] p-3">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium text-fg">
              {item.headline}
            </a>
            <p className="num mt-1 text-[12px] text-fg-3">
              {item.sourceName}
              {item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ""}
              {item.campuses[0] ? ` · ${item.campuses[0].name}` : ""}
            </p>
          </li>
        ))}
        {precollegePage.map((row) => {
          const view: PrecollegeSignalView = {
            signalType: row.signal_type as PrecollegeSignalView["signalType"],
            tier: row.tier === 1 ? 1 : 2,
            label: row.label,
            year: row.year,
            matchStatus: row.match_status,
            sourceUrl: row.source_url,
          };
          const pool = row.founder_status === "potential" ? "potential" : null;
          return (
            <li key={row.id} className="rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-3">
              <Link
                href={buildHref("/founders", {}, { founder: row.person_id, pool, university: row.university_id })}
                className="text-sm font-medium text-foreground hover:text-link"
              >
                {row.person_name}
                {row.university_name ? ` · ${row.university_name}` : ""}
              </Link>
              <p className="mt-1">
                <PrecollegeBadges signals={[view]} />
              </p>
              <p className="mt-1 text-sm text-foreground">{row.excerpt}</p>
              <p className="mt-1.5 text-xs text-muted">
                Tier {row.tier} · {row.match_status === "confirmed" ? "confirmed" : "likely"} ·{" "}
                <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-link underline">
                  source
                </a>
              </p>
            </li>
          );
        })}
        {signalsPage.map((s, signalIndex) => {
          // Signals span both formed companies (Startup Scout) and hackathon-style
          // submissions/evidence (Founder Scout, kind='project') — only kind='company'
          // rows resolve on /startup/discover (see queries.ts listCandidateProjects),
          // so route each signal to whichever product surface actually has it.
          const detailHref = s.project_kind === "company" ? `/startup/${s.project_id}` : `/map/network?project=${s.project_id}`;
          const footerDate = s.source_date ? formatSignalDate(s.source_date) : `Discovered ${formatMonthDay(s.created_at)}`;
          const lowConfidence = (s.significance_note ?? "").startsWith("Low confidence");
          const featured = signalIndex === 0 && pageSafe === 1 && !precollegeOn && sp.type !== "press";
          return (
            <li
              key={s.id}
              className={
                featured
                  ? "relative rounded-md border border-[color:var(--cobalt,#2F4FD8)]/35 bg-[color:var(--bg,#FFFFFF)] p-3.5 pl-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-md before:bg-[color:var(--cobalt,#2F4FD8)]"
                  : "rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] p-3"
              }
              data-signal-featured={featured ? "1" : undefined}
            >
              {featured ? (
                <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--cobalt,#2F4FD8)]">
                  Featured
                </p>
              ) : null}
              <span className="inline-flex items-center gap-2">
                {s.project_kind === "company" && localCompanyLogoUrl(s.project_id) ? (
                  <LogoMark name={s.project_name} logoUrl={localCompanyLogoUrl(s.project_id)} size={featured ? 28 : 22} />
                ) : (
                  <CampusSeal label={s.university_name} size={featured ? "md" : "sm"} />
                )}
                <Link href={detailHref} className={`font-medium text-foreground hover:text-link ${featured ? "text-[15px]" : "text-sm"}`}>
                  {s.founder_name ?? s.project_name}
                  {s.university_name ? ` · ${s.university_name}` : ""}
                </Link>
                {s.project_kind === "company" && <CompanyWebsiteIcon url={s.website_url} name={s.project_name} />}
              </span>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-link">{TYPE_LABEL[s.signal_type] ?? s.signal_type}</p>
              <p className={`mt-1 text-foreground ${featured ? "text-[15px] leading-snug" : "text-sm"}`}>{s.current_observation}</p>
              {s.significance_note && lowConfidence ? <p className="mt-1 text-sm text-muted">{s.significance_note}</p> : null}
              {s.significance_note && !lowConfidence ? <p className="mt-1 text-sm text-muted">Why it matters: {s.significance_note}</p> : null}
              <p className="mt-1.5 text-xs text-muted">
                {s.source_name ? <span>{s.source_name}</span> : null}
                {s.source_name && s.source_url ? " · " : null}
                {s.source_url ? (
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-link underline">
                    {sourceHost(s.source_url)}
                  </a>
                ) : s.source_name ? null : (
                  "Source unknown"
                )}
                {" · "}
                {footerDate}
              </p>
            </li>
          );
        })}
        {signals.length === 0 && precollege.length === 0 && press.length === 0 && <p className="text-sm text-muted">No signals match these filters.</p>}
      </ul>
      {feedTotal > SIGNALS_PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums" data-signals-pager="">
          {pageSafe > 1 ? (
            <Link href={hrefPage(pageSafe - 1)} className="rounded-sm border border-border-c px-2.5 py-1.5 text-foreground hover:border-accent">
              Previous
            </Link>
          ) : null}
          <span className="text-muted">
            {sliceStart + 1}-{Math.min(sliceStart + SIGNALS_PAGE_SIZE, feedTotal)} of {feedTotal.toLocaleString("en-US")}
          </span>
          {pageSafe < pageCount ? (
            <Link href={hrefPage(pageSafe + 1)} className="rounded-sm border border-border-c px-2.5 py-1.5 text-foreground hover:border-accent">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}
