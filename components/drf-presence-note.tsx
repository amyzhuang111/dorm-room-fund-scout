export function DrfPresenceNote({
  presence,
}: {
  presence: { status: string; namedPartners: string; evidenceLinks: string[] } | null | undefined;
}) {
  if (!presence) return null;
  const link = presence.evidenceLinks[0] ?? null;
  return (
    <div className="mt-2 rounded-md border border-border-c bg-surface px-2.5 py-2 text-xs">
      <p className="text-muted">
        <span className="font-semibold uppercase tracking-wide">DRF </span>
        <span className="font-medium text-foreground">{presence.status}</span>
      </p>
      {presence.namedPartners ? <p className="mt-1 text-foreground">{presence.namedPartners}</p> : null}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium text-link hover:underline">
          Evidence
        </a>
      ) : null}
    </div>
  );
}
