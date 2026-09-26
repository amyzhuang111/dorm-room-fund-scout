import Link from "next/link";
import { ownWebsite } from "@/lib/domain/company-link";

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M4.5 8h15M4.5 16h15" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CompanyWebsiteIcon({ url, name }: { url?: string | null; name: string }) {
  const site = ownWebsite(url);
  if (!site) return null;
  return (
    <a
      href={site}
      target="_blank"
      rel="noopener noreferrer"
      title={`Visit ${name} website`}
      aria-label={`Visit ${name} website`}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-c bg-white text-link hover:border-accent"
    >
      <GlobeIcon />
    </a>
  );
}

export function CompanyNameLink({
  id,
  name,
  websiteUrl,
  className,
}: {
  id: string;
  name: string;
  websiteUrl?: string | null;
  className?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Link href={`/startup/${id}`} className={className ?? "font-medium text-foreground hover:text-link"}>
        {name}
      </Link>
      <CompanyWebsiteIcon url={websiteUrl} name={name} />
    </span>
  );
}
