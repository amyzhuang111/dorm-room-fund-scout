import {filterPeopleCorpus,peopleCorpusToCsv} from '@/lib/domain/people-corpus';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const rows=filterPeopleCorpus(Object.fromEntries(new URL(request.url).searchParams));
  return new Response(peopleCorpusToCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="campus-scout-people-class-years.csv"','Cache-Control':'no-store'}});
}
