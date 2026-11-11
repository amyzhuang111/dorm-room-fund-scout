import { lseDirectory,filterLse,lseCsv } from '@/lib/domain/lse-directory';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const sp=new URL(request.url).searchParams;
  const rows=filterLse(lseDirectory(),{q:sp.get('q') ?? '',tier:sp.get('tier') ?? '',stage:sp.get('stage') ?? ''});
  return new Response('\uFEFF'+lseCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="lse-venture-benchmarks.csv"','Cache-Control':'no-store'}});
}
