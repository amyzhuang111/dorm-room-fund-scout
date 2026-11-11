import { Suspense } from 'react';
import { CampusWorkspace } from '@/components/campus-workspace';
import { GlobeBoot } from '@/components/map-boot';
import { loadHeroStats } from '@/lib/domain/hero-stats';
import { loadCorpusTotals } from '@/lib/domain/corpus-totals';

export default function Home() {
  const stats = loadHeroStats();
  const totals = loadCorpusTotals();
  const campuses = stats.universities.filter(u => u.lat != null && u.lon != null).map(u => ({ id:u.id,name:u.name,lat:u.lat!,lon:u.lon!,country:u.country?.trim() || 'Unknown',founders:u.founderCount,signals:u.signalCount }));
  const support = process.env.NEXT_PUBLIC_SCOUT_SUPPORT_URL;
  const supportUrl = support && /^https:\/\/(?:www\.)?(?:buymeacoffee\.com|ko-fi\.com)\/[^\s]+$/.test(support) ? support : undefined;
  return <><GlobeBoot /><Suspense fallback={<div className="p-6 text-sm text-blue-700">Loading Campus Scout workspace…</div>}><CampusWorkspace campuses={campuses} companyCount={totals.investableCompanies} founderCount={totals.foundersIndexed} updatedAt={stats.updatedAt} supportUrl={supportUrl} /></Suspense></>;
}
