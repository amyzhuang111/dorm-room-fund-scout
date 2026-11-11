import type { Metadata } from "next";
import Link from "next/link";
import { listSources, listUniversities, sourceTypedCountsAll, type SourceTypedCounts } from "@/lib/domain/queries";
import { importReferralsCsv } from "@/lib/actions/import-csv";
import { buildSourceCards, compareTiers, SOURCE_CATALOGUE, type SourceCard, type Tier } from "@/lib/domain/source-quality";
import { SourceCardView } from "@/components/source-card";
import { buildHref } from "@/lib/domain/url";

export const metadata: Metadata = { title: "Sources" };

const VIEWS = ["registry", "playbook"] as const;
const REGISTRY_PAGE_SIZE = 25;

// UIUX_UPGRADE_CLAUDE.md §11 status vocabulary, mapped from our internal
// source.status values (unchanged internally so nothing else has to migrate).
const STATUS_DISPLAY: Record<string, string> = {
  unconfigured: "Not configured",
  available: "Ready to scan",
  failed: "Error",
  checked_no_new: "Complete",
};
const CAMPUS_LABEL: Record<string, string> = {
  univ_penn: "Penn",
  univ_berkeley: "Berkeley",
  univ_stanford: "Stanford",
  univ_mit: "MIT",
  univ_waterloo: "Waterloo",
  univ_lse: "LSE",
};

function sortCards(cards: SourceCard[], by: "founder" | "startup"): SourceCard[] {
  return [...cards].sort((a, b) => {
    const tierDiff = by === "founder" ? compareTiers(a.founderScoutTier, b.founderScoutTier) : compareTiers(a.startupScoutTier, b.startupScoutTier);
    if (tierDiff !== 0) return tierDiff;
    const statusRank = (s: SourceCard) => (s.status === "implemented" ? 0 : s.status === "checked_and_skipped" ? 1 : 2);
    const statusDiff = statusRank(a) - statusRank(b);
    if (statusDiff !== 0) return statusDiff;
    const freshA = a.live?.lastSuccessAt ?? "";
    const freshB = b.live?.lastSuccessAt ?? "";
    return freshB.localeCompare(freshA);
  });
}

export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v === sp.view) ?? "registry";
  const sortBy = sp.sortBy === "startup" ? "startup" : "founder";

  const sourceRows = listSources();
  const liveSources = sourceRows.map((s) => ({
    id: s.id,
    status: s.status,
    lastSuccessAt: s.lastSuccessAt,
    discoveredLeadCount: s.discoveredLeadCount,
    reviewedRelevantCount: s.reviewedRelevantCount,
    error: s.error,
    founderScoutTier: s.founderScoutTier,
    startupScoutTier: s.startupScoutTier,
    tierOverrideBy: s.tierOverrideBy,
    tierOverrideAt: s.tierOverrideAt,
    tierOverrideReason: s.tierOverrideReason,
    communitySignal: s.communitySignal,
  }));
  const allCards = buildSourceCards(liveSources);
  const universities = listUniversities();
  const cataloguedSourceIds = new Set(SOURCE_CATALOGUE.map((s) => s.dbSourceId).filter(Boolean));
  const suggestedSources = sourceRows.filter((s) =>
    s.family === "student_fund" && !cataloguedSourceIds.has(s.id)
    && (!sp.q || s.name.toLowerCase().includes(sp.q.toLowerCase()))
    && (!sp.campus || s.campuses.includes(sp.campus))
    && !sp.tier && (!sp.type || sp.type === "manual")
    && (!sp.role || sp.role === "discovery")
    && (!sp.status || sp.status === "unconfigured")
  );

  // Typed People/Projects/Ventures breakdown per source (UIUX_UPGRADE_CLAUDE.md §11).
  // One grouped query for all sources: the per-source helper ran ~5 queries each
  // across 424 sources and took ~26 s per request.
  const allTypedCounts = sourceTypedCountsAll();
  const typedCountsById = new Map<string, SourceTypedCounts>();
  for (const s of liveSources) {
    typedCountsById.set(s.id, allTypedCounts.get(s.id) ?? { people: 0, projects: 0, ventures: 0 });
  }

  let filtered = allCards;
  if (sp.q?.trim()) filtered = filtered.filter(c => c.name.toLowerCase().includes(sp.q!.trim().toLowerCase()));
  if (sp.campus) filtered = filtered.filter((c) => c.campus === sp.campus);
  if (sp.tier) filtered = filtered.filter((c) => c.founderScoutTier === sp.tier || c.startupScoutTier === sp.tier);
  if (sp.type) filtered = filtered.filter((c) => c.sourceType === sp.type);
  if (sp.role) filtered = filtered.filter((c) => c.role === sp.role);
  if (sp.status) filtered = filtered.filter((c) => c.status === sp.status);

  const sorted = sortCards(filtered, sortBy);

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="page-eyebrow">Source registry</p>
          <h1 className="page-title">Sources</h1>
          <p className="mt-1 text-sm text-muted">
            Source quality is not equal. Each source has two independent tiers · <strong>Founder Scout</strong> (how early/reliably it
            surfaces a builder before they are obvious) and <strong>Startup Scout</strong> (how well it surfaces formed, pitchable
            companies). Tier is never inferred from prestige · see the rationale on each card.
          </p>
        </div>
        <Link href="/sources/new-referral" className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
          + Add a manual referral
        </Link>
      </div>

      <Link href="/directories/lse" className="mt-4 inline-flex rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">LSE directory · reviewed companies and benchmarks →</Link>

      {sp.importError && <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-2.5 text-sm text-danger">{sp.importError}</div>}
      {sp.imported && (
        <div className="mt-3 rounded-md border border-ok/30 bg-ok/10 p-2.5 text-sm text-foreground">
          CSV import: {sp.imported} candidate(s) created, {sp.skipped ?? 0} row(s) skipped.
          {sp.skippedDetail && <p className="mt-1 text-xs text-muted">{sp.skippedDetail}</p>}
        </div>
      )}

      <div className="mt-4 flex gap-1 border-b border-border-c">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={buildHref("/signals/sources", sp, { view: v })}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${view === v ? "border-b-2 border-accent text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {v === "registry" ? "Registry" : "Campus Playbooks"}
          </Link>
        ))}
      </div>

      {suggestedSources.length > 0 && (
        <section className="mt-4 rounded-lg border border-border-c bg-white p-4" aria-labelledby="suggested-sources-heading">
          <h2 id="suggested-sources-heading" className="text-sm font-semibold text-foreground">Sources awaiting verification</h2>
          <p className="mt-1 text-xs text-muted">User-submitted programs to investigate. Source quality has not been rated.</p>
          <ul className="mt-3 space-y-3">
            {suggestedSources.map((source) => (
              <li key={source.id}>
                <p className="text-sm font-medium text-foreground">{source.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {source.campuses.map((id) => universities.find((university) => university.id === id)?.name ?? id).join(" · ")}
                  {" · Student-run fund / program · Unverified"}
                </p>
                <p className="mt-1 text-xs text-muted">{source.tierRationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "registry" && <RegistryView cards={sorted} sp={sp} sortBy={sortBy} typedCountsById={typedCountsById} />}
      {view === "playbook" && <PlaybookView cards={allCards} universities={universities} typedCountsById={typedCountsById} />}

      <div className="mt-8 rounded-md border border-border-c bg-surface p-3">
        <h2 className="text-sm font-semibold text-foreground">Bulk import manual referrals (CSV)</h2>
        <p className="mt-1 text-xs text-muted">
          Header row required: <code className="font-mono">companyName,description,websiteUrl,universityName,founderNames,founderStatus,noteBody,referrer</code>.{" "}
          <code className="font-mono">universityName</code> must match a known campus exactly · unmatched rows are skipped and listed, never
          guessed. Every row goes through the same screening gates as any other candidate.
        </p>
        <form action={importReferralsCsv} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="file" name="csvFile" accept=".csv,text/csv" required className="text-xs" />
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            Import
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-muted">
        {allCards.filter((c) => c.status === "implemented").length} implemented · {allCards.filter((c) => c.status === "checked_and_skipped").length}{" "}
        checked and deliberately skipped · {allCards.filter((c) => c.status === "unconfigured").length} not yet attempted, of{" "}
        {SOURCE_CATALOGUE.length} sources in the catalogue. The goal is a small number of excellent sources, not maximum source count.
      </p>
    </div>
  );
}

function RegistryTable({
  cards,
  sp,
  typedCountsById,
}: {
  cards: SourceCard[];
  sp: Record<string, string | undefined>;
  typedCountsById: Map<string, SourceTypedCounts>;
}) {
  const q = sp.q?.toLowerCase();
  const rows = cards.filter((c) => !q || c.name.toLowerCase().includes(q));
  return (
    <div>
      <form action="/signals/sources" method="get" className="mb-2">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search sources…"
          className="w-full max-w-xs rounded-md border border-border-c bg-surface px-2.5 py-1.5 text-xs"
        />
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-c text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5 font-medium">Campus</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Founder</th>
              <th className="px-2 py-1.5 font-medium">Startup</th>
              <th className="px-2 py-1.5 font-medium">Community</th>
              <th className="px-2 py-1.5 font-medium">Role</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">People</th>
              <th className="px-2 py-1.5 font-medium">Projects</th>
              <th className="px-2 py-1.5 font-medium">Ventures</th>
              <th className="px-2 py-1.5 font-medium">Yield</th>
              <th className="px-2 py-1.5 font-medium">Last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              // "Complete" means the configured scan finished, not that the ecosystem is fully covered.
              const statusLabel = !c.live
                ? "Not configured"
                : c.live.status === "available" && c.live.lastSuccessAt
                  ? "Complete"
                  : STATUS_DISPLAY[c.live.status] ?? c.live.status;
              const yieldPct =
                c.live && c.live.discoveredLeadCount > 0
                  ? `${Math.round((c.live.reviewedRelevantCount / c.live.discoveredLeadCount) * 100)}%`
                  : "-";
              const typed = c.dbSourceId ? typedCountsById.get(c.dbSourceId) : undefined;
              return (
                <tr key={c.id} className="border-b border-border-c">
                  <td className="px-2 py-2 font-medium text-foreground">{c.name}</td>
                  <td className="px-2 py-2 text-muted">{c.campus ? CAMPUS_LABEL[c.campus] ?? c.campus : "Global"}</td>
                  <td className="px-2 py-2 text-muted">{c.sourceType.replace(/_/g, " ")}</td>
                  <td className="px-2 py-2 text-muted">{c.founderScoutTier}</td>
                  <td className="px-2 py-2 text-muted">{c.startupScoutTier}</td>
                  <td className="px-2 py-2 text-muted capitalize">{c.live?.communitySignal?.confidence ?? "-"}</td>
                  <td className="px-2 py-2 text-muted capitalize">{c.role}</td>
                  <td className="px-2 py-2 text-muted">{statusLabel}</td>
                  <td className="px-2 py-2 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {typed ? typed.people : "-"}
                  </td>
                  <td className="px-2 py-2 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {typed ? typed.projects : "-"}
                  </td>
                  <td className="px-2 py-2 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {typed ? typed.ventures : "-"}
                  </td>
                  <td className="px-2 py-2 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {yieldPct}
                  </td>
                  <td className="px-2 py-2 text-muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {c.live?.lastSuccessAt?.slice(0, 10) ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Yield = reviewed-relevant ÷ discovered leads, for sources that have actually run.</p>
    </div>
  );
}

function RegistryView({
  cards,
  sp,
  sortBy,
  typedCountsById,
}: {
  cards: SourceCard[];
  sp: Record<string, string | undefined>;
  sortBy: "founder" | "startup";
  typedCountsById: Map<string, SourceTypedCounts>;
}) {
  // 424 sources rendered twice (table + cards) made this page ~2.8 MB; page it.
  const total = cards.length;
  const pageCount = Math.max(1, Math.ceil(total / REGISTRY_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const from = (page - 1) * REGISTRY_PAGE_SIZE;
  const pageCards = cards.slice(from, from + REGISTRY_PAGE_SIZE);
  const types = [...new Set(SOURCE_CATALOGUE.map((c) => c.sourceType))];
  const campuses = [...new Set(SOURCE_CATALOGUE.map((c) => c.campus).filter((c): c is string => !!c))];
  return (
    <div className="mt-3 space-y-6">
      <RegistryTable cards={pageCards} sp={sp} typedCountsById={typedCountsById} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Sort by:</span>
        <Link href={buildHref("/signals/sources", sp, { page: null, sortBy: "founder" })} className={sortBy === "founder" ? "font-semibold text-link" : "text-muted underline"}>
          Founder tier
        </Link>
        <Link href={buildHref("/signals/sources", sp, { page: null, sortBy: "startup" })} className={sortBy === "startup" ? "font-semibold text-link" : "text-muted underline"}>
          Startup tier
        </Link>
        <span className="mx-1 text-border-c">|</span>
        <Link href={buildHref("/signals/sources", sp, { page: null, campus: null, tier: null, type: null, role: null, status: null })} className="text-muted underline">
          Clear filters
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {campuses.map((c) => (
          <Link key={c} href={buildHref("/signals/sources", sp, { page: null, campus: sp.campus === c ? null : c })} className={`rounded-full border px-2 py-0.5 ${sp.campus === c ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted"}`}>
            {CAMPUS_LABEL[c] ?? c}
          </Link>
        ))}
        {(["S+", "S", "A", "B", "C", "D"] as Tier[]).map((t) => (
          <Link key={t} href={buildHref("/signals/sources", sp, { page: null, tier: sp.tier === t ? null : t })} className={`rounded-full border px-2 py-0.5 ${sp.tier === t ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted"}`}>
            Tier {t}
          </Link>
        ))}
        {types.map((t) => (
          <Link key={t} href={buildHref("/signals/sources", sp, { page: null, type: sp.type === t ? null : t })} className={`rounded-full border px-2 py-0.5 ${sp.type === t ? "border-accent bg-accent text-accent-foreground" : "border-border-c text-muted"}`}>
            {t.replace(/_/g, " ")}
          </Link>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {pageCards.map((c) => (
          <li key={c.id}>
            <SourceCardView card={c} typedCounts={c.dbSourceId ? typedCountsById.get(c.dbSourceId) : undefined} />
          </li>
        ))}
        {cards.length === 0 && <p className="text-sm text-muted">No sources match these filters.</p>}
      </ul>
      {total > REGISTRY_PAGE_SIZE && (
        <nav aria-label="Source pages" className="flex flex-wrap items-center gap-3 text-xs">
          {page > 1 ? (
            <Link href={buildHref("/signals/sources", sp, { page: page - 1 <= 1 ? null : String(page - 1) })} className="text-link underline">
              Previous
            </Link>
          ) : (
            <span className="text-muted">Previous</span>
          )}
          <span className="text-muted">
            Page {page} of {pageCount} · showing {from + 1}–{Math.min(total, from + REGISTRY_PAGE_SIZE)} of {total} sources
          </span>
          {page < pageCount ? (
            <Link href={buildHref("/signals/sources", sp, { page: String(page + 1) })} className="text-link underline">
              Next
            </Link>
          ) : (
            <span className="text-muted">Next</span>
          )}
        </nav>
      )}
    </div>
  );
}

function PlaybookView({
  cards,
  universities,
  typedCountsById,
}: {
  cards: SourceCard[];
  universities: { id: string; name: string }[];
  typedCountsById: Map<string, SourceTypedCounts>;
}) {
  const groups: { id: string | null; name: string }[] = [...universities.map((u) => ({ id: u.id, name: u.name })), { id: null, name: "Global / not campus-specific" }];
  return (
    <div className="mt-3 space-y-8">
      {groups.map((g) => {
        const groupCards = cards.filter((c) => c.campus === g.id);
        if (groupCards.length === 0) return null;
        const founderBest = groupCards.filter((c) => c.founderScoutTier === "S+" || c.founderScoutTier === "S" || c.founderScoutTier === "A").sort((a, b) => compareTiers(a.founderScoutTier, b.founderScoutTier));
        const startupBest = groupCards.filter((c) => c.startupScoutTier === "S+" || c.startupScoutTier === "S" || c.startupScoutTier === "A" || c.startupScoutTier === "B").sort((a, b) => compareTiers(a.startupScoutTier, b.startupScoutTier));
        const lowPriority = groupCards.filter((c) => c.founderScoutTier !== "S+" && c.founderScoutTier !== "S" && c.founderScoutTier !== "A" && (c.startupScoutTier === "C" || c.startupScoutTier === "D") && !startupBest.includes(c));

        return (
          <section key={g.name}>
            <h2 className="text-base font-semibold text-foreground">{g.name}</h2>
            <p className="mt-0.5 text-xs text-muted">Where should sourcing time actually go at this campus?</p>

            {founderBest.length > 0 && (
              <div className="mt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Best founder sources</h3>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {founderBest.map((c) => (
                    <SourceCardView key={c.id} card={c} compact typedCounts={c.dbSourceId ? typedCountsById.get(c.dbSourceId) : undefined} />
                  ))}
                </div>
              </div>
            )}

            {startupBest.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Startup sources</h3>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {startupBest.map((c) => (
                    <SourceCardView key={c.id} card={c} compact typedCounts={c.dbSourceId ? typedCountsById.get(c.dbSourceId) : undefined} />
                  ))}
                </div>
              </div>
            )}

            {lowPriority.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Low priority</h3>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {lowPriority.map((c) => (
                    <SourceCardView key={c.id} card={c} compact typedCounts={c.dbSourceId ? typedCountsById.get(c.dbSourceId) : undefined} />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

