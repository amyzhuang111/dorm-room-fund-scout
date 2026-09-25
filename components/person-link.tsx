import type { PersonLinkTarget } from "@/lib/domain/person-link";

function LinkedInIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V24h-4V8.5zM8.5 8.5h3.8v2.1h.1c.5-1 1.8-2.2 3.8-2.2 4.1 0 4.8 2.7 4.8 6.2V24h-4v-7.7c0-1.8 0-4.1-2.5-4.1s-2.9 2-2.9 4V24h-4V8.5z"
      />
    </svg>
  );
}

export function PersonLinkButton({ link, name }: { link: PersonLinkTarget | null; name?: string }) {
  if (!link) return <span className="text-[11px] text-muted">No public profile</span>;
  const unverified = link.kind === "unverified";
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={unverified ? "A name match that was not confirmed against this person's school or company" : link.label}
      aria-label={name ? `${link.label} for ${name}` : link.label}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        unverified
          ? "border-warn/40 bg-warn-bg text-warn"
          : "border-border-c bg-white text-link hover:border-accent"
      }`}
    >
      {link.kind === "linkedin" && <LinkedInIcon />}
      {link.label}
    </a>
  );
}
