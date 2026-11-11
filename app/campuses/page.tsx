import Link from 'next/link';
import { campusSlug, shortCampusLabel } from '@/lib/domain/campuses';
import { listUniversities } from '@/lib/domain/queries';
import { loadDirectory } from '@/lib/domain/directory';
import { rankGroups } from '@/lib/domain/scout-workspace';
import { CampusesTheme } from '@/components/campuses-theme';
import { loadCorpusTotals } from '@/lib/domain/corpus-totals';

export default function CampusesPage() {
  const universities = listUniversities();
  const byId = new Map(universities.map(university => [university.id, university]));
  const companies = loadDirectory().cards;
  const ranks = rankGroups(companies, 'campus');
  const rankedIds = new Set(ranks.map(row => row.id));
  const rows = ranks.flatMap((rank, index) => {
    const university = byId.get(rank.id);
    return university ? [{ ...university, companyCount: rank.companies, rank: index + 1 }] : [];
  });
  const other = universities.filter(row => !rankedIds.has(row.id) && row.founderCount > 0)
    .sort((a,b) => b.founderCount - a.founderCount || a.name.localeCompare(b.name))
    .map(row => ({ ...row, companyCount: 0, rank: 0 }));
  const totals = loadCorpusTotals();
  return <div className="sample-paper min-h-[calc(100dvh-48px)]" data-campuses-index="">
    <CampusesTheme />
    <div className="mx-auto max-w-[1200px] px-3 py-3 sm:px-5 sm:py-6">
      <div className="border-b border-line pb-4" data-campuses-hero="">
        <h1 className="scout-display text-[28px] leading-tight sm:text-[48px]">Campus rankings</h1>
        <p className="mt-2 text-sm tabular-nums" data-campuses-stats="">
          <strong>{ranks.length.toLocaleString('en-US')}</strong> campuses with companies · <strong>{companies.length.toLocaleString('en-US')}</strong> companies · <strong>{totals.foundersIndexed.toLocaleString('en-US')}</strong> indexed founders
        </p>
        <details className="mt-2 max-w-3xl text-sm text-fg-2"><summary className="cursor-pointer py-2">How campuses are ranked</summary>
          <p>Ranked by distinct companies in the scouting list. Ties use recorded signals, then campus name. These are the same company counts shown in the dashboard and company directory. Founders are counted by unique person ID in the full founder index. A company or founder linked to several campuses counts once at each campus, so campus totals overlap.</p>
        </details>
        <Link href="/companies" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-link underline">Browse all companies ↗</Link>
      </div>
      <div className="mt-4 overflow-hidden border border-line bg-white" data-campuses-table="">
        <div className="hidden grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_5.5rem_5rem] gap-2 border-b border-line px-3 py-3 text-[10px] uppercase tracking-wider text-fg-2 sm:grid">
          <span>#</span><span>Campus</span><span>Country</span><span className="text-right">Founders</span><span className="text-right">Companies</span><span className="text-right">Sources</span>
        </div>
        <ol className="divide-y divide-line" data-campuses-cards="">
          {[...rows,...other].map(row => {
            const label = shortCampusLabel(row.id,row.name);
            return <li key={row.id} className="campus-index-row" data-campus-id={row.id}>
              <span className="campus-rank">{row.rank ? String(row.rank).padStart(2,'0') : '—'}</span>
              <Link href={`/campuses/${campusSlug(label)}`} className="campus-name hover:underline">{label}</Link>
              <span className="campus-country">{row.country?.trim() || 'Not on record'}</span>
              <Link href={`/founders?campus=${encodeURIComponent(row.id)}`} className="campus-founders hover:underline" aria-label={`${label}: ${row.founderCount} indexed founders`}>{row.founderCount.toLocaleString('en-US')}</Link>
              <span className="campus-meta">
                <Link href={`/companies?campus=${encodeURIComponent(row.id)}`} className="hover:underline" aria-label={`${label}: ${row.companyCount} companies`}>
                  <span className="sm-only-label">{row.companyCount.toLocaleString('en-US')} companies</span><span className="desk-only-num">{row.companyCount.toLocaleString('en-US')}</span>
                </Link>
                <span><span className="sm-only-label">{row.sourcesConfigured.toLocaleString('en-US')} sources</span><span className="desk-only-num">{row.sourcesConfigured.toLocaleString('en-US')}</span></span>
              </span>
            </li>;
          })}
        </ol>
      </div>
    </div>
  </div>;
}
