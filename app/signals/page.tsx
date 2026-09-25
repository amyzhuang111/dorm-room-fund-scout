import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listUniversities } from "@/lib/domain/queries";
import { readReviewState } from "@/lib/domain/review-server";
import { domainKey, isHidden } from "@/lib/domain/feedback";
import { buildHref } from "@/lib/domain/url";

interface SignalRow {
  id: string;
  project_id: string;
  project_kind: string;
  project_name: string;
  website_url: string | null;
  primary_link: string | null;
  founder_name: string | null;
  university_name: string | null;
  signal_type: string;
  current_observation: string;
  significance_note: string | null;
  source_date: string | null;
  source_name: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  demo: "Product launch",
  continued_dev: "Technical release",
  award: "Award",
  funding: "Funding",
  customer_evidence: "Customer evidence",
  team_change: "Team change",
};

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatMonthDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function listAllSignals(): SignalRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.project_id, p.kind as project_kind, p.name as project_name, p.website_url, p.primary_link,
              (SELECT pe.name FROM person_project_roles ppr JOIN people pe ON pe.id = ppr.person_id WHERE ppr.project_id = p.id AND ppr.role LIKE '%founder%' LIMIT 1) as founder_name,
              (SELECT u.name FROM affiliations a JOIN person_project_roles ppr ON ppr.person_id = a.person_id JOIN universities u ON u.id = a.university_id WHERE ppr.project_id = p.id LIMIT 1) as university_name,
              s.signal_type, s.current_observation, s.significance_note, s.source_date, s.created_at,
              (SELECT src.name FROM claims c JOIN sources src ON src.id = c.source_id WHERE c.id IN (SELECT value FROM json_each(s.claim_ids_json)) ORDER BY c.retrieved_at DESC LIMIT 1) as source_name
       FROM signals s JOIN projects p ON p.id = s.project_id
       ORDER BY s.created_at DESC`
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

  const signals = allSignals.filter((s) => {
    if (sp.university && s.university_name !== universities.find((u) => u.id === sp.university)?.name) return false;
    if (sp.type && s.signal_type !== sp.type) return false;
    return true;
  });

  const basePath = "/signals";
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Signals</h1>
      <p className="mt-1 text-sm text-muted">Recent company and founder activity.</p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {universities
          .filter((u) => allSignals.some((s) => s.university_name === u.name))
          .map((u) => (
            <Link
              key={u.id}
              href={buildHref(basePath, sp, { university: sp.university === u.id ? null : u.id })}
              className={`rounded-full border px-2 py-0.5 ${sp.university === u.id ? "border-accent bg-accent/10 text-accent" : "border-border-c text-muted"}`}
            >
              {u.name}
            </Link>
          ))}
        {types.map((t) => (
          <Link
            key={t}
            href={buildHref(basePath, sp, { type: sp.type === t ? null : t })}
            className={`rounded-full border px-2 py-0.5 ${sp.type === t ? "border-accent bg-accent/10 text-accent" : "border-border-c text-muted"}`}
          >
            {TYPE_LABEL[t] ?? t}
          </Link>
        ))}
        {(sp.university || sp.type) && (
          <Link href={basePath} className="rounded-full border border-border-c px-2 py-0.5 text-accent underline">
            Clear
          </Link>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {signals.map((s) => {
          // Signals span both formed companies (Startup Scout) and hackathon-style
          // submissions/evidence (Founder Scout, kind='project') — only kind='company'
          // rows resolve on /startup/discover (see queries.ts listCandidateProjects),
          // so route each signal to whichever product surface actually has it.
          const detailHref =
            s.project_kind === "company" ? `/startup/discover?project=${s.project_id}` : `/founder/network?project=${s.project_id}`;
          const footerDate = s.source_date ? formatMonthYear(s.source_date) : `Discovered ${formatMonthDay(s.created_at)}`;
          return (
            <li key={s.id} className="rounded-md border border-border-c bg-surface p-3">
              <Link href={detailHref} className="text-sm font-medium text-foreground hover:text-accent">
                {s.founder_name ?? s.project_name}
                {s.university_name ? ` · ${s.university_name}` : ""}
              </Link>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-accent">{TYPE_LABEL[s.signal_type] ?? s.signal_type}</p>
              <p className="mt-1 text-sm text-foreground">{s.current_observation}</p>
              {s.significance_note && <p className="mt-1 text-sm text-muted">Why it matters: {s.significance_note}</p>}
              <p className="mt-1.5 text-xs text-muted">
                {s.source_name ?? "Source unknown"} · {footerDate}
              </p>
            </li>
          );
        })}
        {signals.length === 0 && <p className="text-sm text-muted">No signals match these filters.</p>}
      </ul>
    </div>
  );
}
