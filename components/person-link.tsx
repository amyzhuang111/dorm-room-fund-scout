import type { PersonLinkTarget } from "@/lib/domain/person-link";
import { profileLabel, type ProfileIconLink } from "@/lib/domain/profile-links";

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

function ProfileGlyph({ type }: { type: ProfileIconLink["type"] }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", "aria-hidden": true as const, className: "shrink-0" };
  if (type === "github") {
    return (
      <svg {...common} viewBox="0 0 16 16">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.68 7.68 0 0 1 8 4.84c.68.003 1.36.092 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    );
  }
  if (type === "scholar") {
    return (
      <svg {...common}>
        <path fill="currentColor" d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zm0 8.5L5.2 9 12 5.5 18.8 9 12 11.5zM5 13.2V16c0 1.7 3.1 3 7 3s7-1.3 7-3v-2.8l-7 3.8-7-3.8z" />
      </svg>
    );
  }
  if (type === "website") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12h18M4.5 8h15M4.5 16h15" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (type === "twitter") {
    return (
      <svg {...common}>
        <path fill="currentColor" d="M14.7 3h2.6l-5.7 6.5L18.5 21h-5.2l-4.1-5.3L4.6 21H2l6.1-7L1.7 3h5.3l3.7 4.9L14.7 3zm-.9 16.2h1.4L6.3 4.7H4.8l9 14.5z" />
      </svg>
    );
  }
  if (type === "substack") {
    return (
      <svg {...common}>
        <path fill="currentColor" d="M4 4h16v2.2H4V4zm0 4.2h16v2.2H4V8.2zM4 13.1l8 6.4 8-6.4v-2.2H4v2.2z" />
      </svg>
    );
  }
  if (type === "huggingface") {
    return (
      <svg {...common}>
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2zm-3.2 8.1a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm6.4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zM8.2 14.2c.7 1.6 2.1 2.6 3.8 2.6s3.1-1 3.8-2.6"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path fill="currentColor" d="M7 3h10v2h-3.2l1.4 8.2A4 4 0 1 1 12.6 17H8.4a4 4 0 1 1-2.6-3.8L7.2 5H4V3h3zm-1.5 12a2 2 0 1 0 .001 4.001A2 2 0 0 0 5.5 15zm10 0a2 2 0 1 0 .001 4.001A2 2 0 0 0 15.5 15z" />
    </svg>
  );
}

export function ProfileIconLinks({ links, name }: { links: ProfileIconLink[]; name?: string }) {
  if (links.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {links.map((link) => {
        const label = profileLabel(link.type);
        const unverified = link.status === "unverified";
        const tip = unverified ? `${label} (unverified). This page was not checked against this person's school or company.` : label;
        const accessible = name ? `${label}${unverified ? " (unverified)" : ""} for ${name}` : tip;
        return (
          <a
            key={`${link.type}:${link.url}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={tip}
            aria-label={accessible}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border bg-white ${
              unverified ? "border-dashed border-muted text-muted hover:border-accent" : "border-border-c text-link hover:border-accent"
            }`}
          >
            <ProfileGlyph type={link.type} />
          </a>
        );
      })}
    </span>
  );
}
