import type { ClaimRow } from "@/lib/domain/queries";
import { formatEvidenceDate, latestSourceCollection } from "@/lib/ui/company-evidence";

export function CompanyFactSource({ url, claims }: { url?: string | null; claims: ClaimRow[] }) {
  if (!url) return null;
  const collected = latestSourceCollection(claims, url);
  return <span className="mt-1 block text-[11px] leading-5 text-[color:var(--fg-3,#5C647A)]" data-fact-source="">
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-7 items-center text-[color:var(--cobalt,#2F4FD8)] underline underline-offset-2">Source ↗</a>
    {collected ? <> · collected <time dateTime={collected}>{formatEvidenceDate(collected)}</time></> : " · collection date not on record"}
  </span>;
}
