import Link from "next/link";
import { buildHref } from "@/lib/domain/url";
import { CAMPUSES, shortCampusLabel } from "@/lib/domain/campuses";
import { listSectorCounts, type CoverageState, type UniversitySummary } from "@/lib/domain/queries";
import { FeedbackSync } from "./feedback-sync";
import { CollapsibleSidebar } from "./collapsible-sidebar";
import { EnrollmentChips } from "./enrollment-chips";

const COVERAGE_LABEL: Record<CoverageState, { label: string; cls: string }> = {
  not_scanned: { label: "Not scanned", cls: "text-muted" },
  partial: { label: "Partial", cls: "text-warn" },
  up_to_date: { label: "Up to date", cls: "text-ok" },
  needs_attention: { label: "Needs attention", cls: "text-warn" },
};

function UniversityRow({
  u,
  basePath,
  current,
  mode,
}: {
  u: UniversitySummary;
  basePath: string;
  current: Record<string, string | undefined>;
  mode: "founder" | "startup";
}) {
  const coverage = COVERAGE_LABEL[u.coverage];
  const label = shortCampusLabel(u.id, u.name);
  const count = mode === "founder" ? u.founderCount : u.companyCount;
  const switchingCampus = current.university !== u.id;
  return (
    <Link
      // Switching to a different campus clears any open detail panel — its
      // company/founder almost certainly isn't from the newly selected campus,
      // and leaving it open silently would show a candidate that looks like it
      // belongs to a campus it doesn't.
      href={buildHref(basePath, current, switchingCampus ? { university: u.id, project: null } : { university: u.id })}
      title={u.name}
      aria-label={`${u.name} — ${coverage.label}`}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${current.university === u.id ? "bg-accent-subtle font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className={`text-[10px] ${coverage.cls}`}>{coverage.label}</span>
        {/* A campus that hasn't been scanned shows only its status, never a numeric "0" —
            unscanned is not the same claim as "zero found here." */}
        {u.sourcesConfigured > 0 && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{count}</span>}
      </span>
    </Link>
  );
}

const STARTUP_SAVED_VIEWS = [
  { val: null, label: "All discovered", dot: "var(--muted)" },
  { val: "top_prospects", label: "Ready to review", dot: "var(--ok)" },
  { val: "exploration", label: "Needs research", dot: "var(--accent)" },
  { val: "watch", label: "Watching", dot: "var(--warn)" },
  { val: "reference_outside_brief", label: "Outside brief", dot: "var(--muted)" },
] as const;

export function FilterSidebar({
  universities,
  basePath,
  current,
  mode = "startup",
}: {
  universities: UniversitySummary[];
  basePath: string;
  current: Record<string, string | undefined>;
  mode?: "founder" | "startup";
}) {
  const total = universities.reduce((sum, u) => sum + (mode === "founder" ? u.founderCount : u.companyCount), 0);
  const firstClassIds = new Set(CAMPUSES.filter((c) => c.firstClass).map((c) => c.id));
  const firstClass = universities.filter((u) => firstClassIds.has(u.id));
  const rest = universities.filter((u) => !firstClassIds.has(u.id));
  const scannedCount = universities.filter((u) => u.sourcesConfigured > 0).length;
  // Sector is a Startup Scout (kind='company') concept — skip the query on
  // Founder Scout pages. Only real, researched sector values ever appear
  // here (never a static/guessed list — most candidates are still
  // unresearched, per brief section 1, so there's nothing to list for them).
  const sectors = mode === "startup" ? listSectorCounts(current.university) : [];

  return (
    <CollapsibleSidebar>
    <aside className="w-full shrink-0 border-b border-border-c p-3 sm:w-[232px] sm:border-b-0 sm:border-r sm:p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="ui-label">Universities</span>
        {current.university && (
          <Link href={buildHref(basePath, current, { university: null })} className="text-[11px] text-accent underline">
            reset
          </Link>
        )}
      </div>
      <p className="-mt-2 mb-2 text-xs text-muted">
        {mode === "founder" ? `${total} founders` : `${total} startup candidates`} · {scannedCount} of {universities.length} campuses monitored
      </p>
      <ul className="space-y-0.5">
        <li>
          <Link
            href={buildHref(basePath, current, { university: null })}
            className={`block rounded-md px-2 py-1.5 text-sm ${!current.university ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
          >
            All campuses
          </Link>
        </li>
        {firstClass.map((u) => (
          <li key={u.id}>
            <UniversityRow u={u} basePath={basePath} current={current} mode={mode} />
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <details>
              <summary className="cursor-pointer list-none rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2">More universities…</summary>
              <ul className="mt-0.5 space-y-0.5 pl-1">
                {rest.map((u) => (
                  <li key={u.id}>
                    <UniversityRow u={u} basePath={basePath} current={current} mode={mode} />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>

      {mode === "startup" && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="ui-label">Saved views</span>
            {current.queue && (
              <Link href={buildHref(basePath, current, { queue: null })} className="text-[11px] text-accent underline">
                reset
              </Link>
            )}
          </div>
          <ul className="space-y-0.5">
            {STARTUP_SAVED_VIEWS.map(({ val, label, dot }) => (
              <li key={label}>
                <Link
                  href={buildHref(basePath, current, { queue: current.queue === val ? null : val })}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${current.queue === val ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
                >
                  <span className="status-dot" style={{ background: dot }} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <span className="ui-label">Review</span>
        <ul className="mt-1 space-y-0.5">
          {(
            [
              ["liked", "Liked"],
              ["hidden", "Hidden"],
              ["passed", "Passed"],
            ] as const
          ).map(([val, label]) => (
            <li key={val}>
              <Link
                href={buildHref(basePath, current, { feedback: current.feedback === val ? null : val })}
                className={`block rounded-md px-2 py-1 text-sm ${current.feedback === val ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-surface-2"}`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <EnrollmentChips basePath={basePath} current={current} />
      </div>

      {mode === "startup" && sectors.length > 0 && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="ui-label">Sectors</span>
            {current.sector && (
              <Link href={buildHref(basePath, current, { sector: null })} className="text-[11px] text-accent underline">
                reset
              </Link>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {sectors.map((s) => (
              <li key={s.tag}>
                <Link
                  href={buildHref(basePath, current, { sector: current.sector === s.tag ? null : s.tag })}
                  className={`inline-block rounded-full border px-2 py-0.5 text-xs ${current.sector === s.tag ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted hover:bg-surface-2 hover:text-foreground"}`}
                >
                  {s.label} <span className="tabular-nums">{s.count}</span>
                </Link>
              </li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-muted">By campus</summary>
            <ul className="mt-1 space-y-1">
              {sectors.map((s) => (
                <li key={`${s.tag}-campus`} className="text-[11px] text-muted">
                  <span className="text-foreground">{s.label}</span>
                  {s.byCampus.map((c) => (
                    <span key={c.universityId}>
                      {" "}
                      · {shortCampusLabel(c.universityId, c.name)} {c.count}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <FeedbackSync />
    </aside>
    </CollapsibleSidebar>
  );
}
