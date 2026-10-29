"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { StartupCard, StartupCardFounder, StartupLinkKind } from "@/lib/domain/startup-card";
const LINK_LABEL: Record<StartupLinkKind, string> = {
  website: "Website",
  linkedin: "LinkedIn",
  x: "X",
  crunchbase: "Crunchbase",
  facebook: "Facebook",
  github: "GitHub",
  productHunt: "Product Hunt",
};

function faviconUrlForWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return null;
  }
}

function personInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function companyInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9&+\s.-]/g, " ").trim();
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean).filter((p) => !/^(inc|llc|ltd|co|corp|the|and|&)$/i.test(p));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase();
}

function CompanyLogo({ name, websiteUrl }: { name: string; websiteUrl: string | null }) {
  const src = faviconUrlForWebsite(websiteUrl);
  const [ok, setOk] = useState(false);
  const mono = (
    <div
      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#2F4FD8]/40 bg-[linear-gradient(145deg,#EEF1FB,#E0E6F8)] font-mono text-[18px] font-semibold tracking-tight text-[#2F4FD8] shadow-[inset_0_0_0_1px_rgba(47,79,216,0.12)]"
      aria-hidden
      title={name}
    >
      {companyInitials(name).slice(0, 2)}
    </div>
  );
  if (!src || !ok) {
    return (
      <span className="relative inline-grid shrink-0">
        {mono}
        {src ? (
          <Image
            src={src}
            alt=""
            width={1}
            height={1}
            unoptimized
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            onLoadingComplete={(img) => {
              if (img.naturalWidth > 16) setOk(true);
            }}
            onError={() => setOk(false)}
          />
        ) : null}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={56}
      height={56}
      unoptimized
      className="h-14 w-14 shrink-0 rounded-xl border border-neutral-200 bg-white object-contain p-2 shadow-sm"
      onError={() => setOk(false)}
    />
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 3.2 12.8 12.8M12.8 3.2 3.2 12.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="8" cy="8" rx="3" ry="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 8h12M3.2 5h9.6M3.2 11h9.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function LinkMark({ kind }: { kind: StartupLinkKind }) {
  if (kind === "website") return <GlobeIcon />;
  const text = kind === "linkedin" ? "in" : kind === "x" ? "𝕏" : kind === "crunchbase" ? "cb" : kind === "facebook" ? "f" : kind === "github" ? "gh" : "ph";
  return <span className="text-[11px] font-bold leading-none">{text}</span>;
}

function SchoolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-neutral-500">
      <path d="M8 2.2 1.5 5.5 8 8.8l6.5-3.3L8 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M3.8 7.1v3.2c0 .2 1.6 2.2 4.2 2.2s4.2-2 4.2-2.2V7.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function founderMeta(founder: StartupCardFounder): string | null {
  const place = [founder.program, founder.school].filter(Boolean).join(" · ");
  const parts = [place, founder.linkedinFollowers != null ? `${founder.linkedinFollowers.toLocaleString()} LinkedIn followers` : null, founder.yearsExperience != null ? `${founder.yearsExperience} years experience` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function StartupDirectoryCard({
  card,
  onClose,
  embedded = false,
}: {
  card: StartupCard;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const name = embedded ? (
    <h2 className="text-xl font-bold leading-tight text-black">{card.name}</h2>
  ) : (
    <h2 className="text-xl font-bold leading-tight text-black">
      <Link href={`/startup/${card.id}`} className="hover:underline">
        {card.name}
      </Link>
    </h2>
  );
  const body = (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo name={card.name} websiteUrl={card.websiteUrl} />
        <div className={`min-w-0 flex-1 ${onClose ? "pr-8" : ""}`}>
          {name}
          {card.subtitle && <p className="mt-1 text-sm text-neutral-600">{card.subtitle}</p>}
        </div>
      </div>

      {card.sector && (
        <p className="mt-4">
          <span className="inline-flex rounded-full bg-ember px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-foreground">{card.sector}</span>
        </p>
      )}

      {card.links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.links.map((link) => (
            <a
              key={link.kind}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={LINK_LABEL[link.kind]}
              title={LINK_LABEL[link.kind]}
              className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 bg-white text-black shadow-sm hover:border-neutral-400"
            >
              <LinkMark kind={link.kind} />
            </a>
          ))}
        </div>
      )}

      {card.description && (
        <>
          <hr className="my-4 border-neutral-200" />
          <p className="text-lg leading-snug text-black">{card.description}</p>
        </>
      )}

      <dl className="mt-4 space-y-2 text-sm text-black">
        {card.region && (
          <div className="grid grid-cols-[7.25rem_1fr] gap-2">
            <dt className="font-bold">Region</dt>
            <dd>{card.region}</dd>
          </div>
        )}
        {card.teamSize && (
          <div className="grid grid-cols-[7.25rem_1fr] gap-2">
            <dt className="font-bold">Team size</dt>
            <dd>{card.teamSize}</dd>
          </div>
        )}
        {card.status && (
          <div className="grid grid-cols-[7.25rem_1fr] gap-2">
            <dt className="font-bold">Status</dt>
            <dd>{card.status}</dd>
          </div>
        )}
        {card.campuses.length > 0 && (
          <div className="grid grid-cols-[7.25rem_1fr] gap-2">
            <dt className="font-bold">{card.campuses.length > 1 ? "Campuses" : "Campus"}</dt>
            <dd>{card.campuses.join(", ")}</dd>
          </div>
        )}
      </dl>

      {card.verifiedOn && (
        <p className="mt-3 text-xs text-neutral-600">
          ✓ verified {card.verifiedOn}
          {card.verifiedSource ? ` · ${card.verifiedSource}` : ""}
        </p>
      )}

      <section className="mt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cobalt">Founders</h3>
        {card.founders.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No founders on record.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {card.founders.map((founder) => {
              const meta = founderMeta(founder);
              return (
                <li key={founder.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                  <FounderAvatar name={founder.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-black">{founder.name}</p>
                    {founder.role && <p className="text-sm text-neutral-700">{founder.role}</p>}
                    {meta && (
                      <p className="mt-0.5 flex items-start gap-1 text-xs text-neutral-600">
                        <SchoolIcon />
                        <span>{meta}</span>
                      </p>
                    )}
                  </div>
                  {founder.linkedinUrl && founder.linkedinConfidence === "confirmed" ? (
                    <a
                      href={founder.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`LinkedIn for ${founder.name}`}
                      title="Verified public LinkedIn profile"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#0a66c2] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#004182]"
                    >
                      in
                    </a>
                  ) : (
                    <span className="shrink-0 rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-2 py-1 font-mono text-[10px] text-[color:var(--fg-3,#5C647A)]">
                      Not on record
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
  if (embedded) {
    return (
      <div data-testid="startup-directory-card" className="space-y-3 bg-transparent p-0 shadow-none">
        <header className="space-y-1.5">
          <div className="flex items-start gap-2.5">
            <CompanyLogo name={card.name} websiteUrl={card.websiteUrl} />
            <div className="min-w-0 flex-1">
              {name}
              {card.subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--fg-2,#3F465C)] sm:text-[14px]">{card.subtitle}</p> : null}
              {card.sector ? (
                <p className="mt-1.5">
                  <span className="inline-flex rounded-sm border border-[color:var(--ember,#D96B1C)]/40 bg-[color:var(--ember,#D96B1C)]/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ember,#D96B1C)]">{card.sector}</span>
                </p>
              ) : null}
            </div>
          </div>
          {card.description ? <p className="text-[14px] leading-snug text-[color:var(--fg,#0B0E17)] sm:text-[15px]">{card.description}</p> : null}
        </header>

        <section>
          <h3 className="border-b border-[color:var(--line,#E1E5EF)] pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Founders</h3>
          {card.founders.length === 0 ? (
            <p className="mt-1.5 text-sm text-[color:var(--fg-3,#5C647A)]">No founders on record.</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {card.founders.map((founder) => {
                const meta = founderMeta(founder);
                return (
                  <li key={founder.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-sm border border-[color:var(--line,#E1E5EF)] border-l-[3px] border-l-[color:var(--cobalt,#2F4FD8)] bg-[color:var(--bg,#FFFFFF)] p-2">
                    <FounderAvatar name={founder.name} />
                    <div className="min-w-0">
                      <p className="break-words text-[13px] font-semibold leading-snug text-[color:var(--fg,#0B0E17)] sm:text-[14px]">{founder.name}</p>
                      {founder.role ? <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--fg-2,#3F465C)]">{founder.role}</p> : null}
                      {meta ? (
                        <p className="mt-1 flex items-start gap-1 text-xs leading-snug text-[color:var(--fg-3,#5C647A)]">
                          <SchoolIcon />
                          <span className="min-w-0 break-words">{meta}</span>
                        </p>
                      ) : null}
                    </div>
                    {founder.linkedinUrl && founder.linkedinConfidence === "confirmed" ? (
                      <a
                        href={founder.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`LinkedIn for ${founder.name}`}
                        title="Verified public LinkedIn profile"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#0a66c2] px-2 py-1 text-xs font-semibold text-white hover:bg-[#004182]"
                      >
                        in
                      </a>
                    ) : (
                      <span className="inline-flex max-w-[5.5rem] shrink-0 flex-col rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-1.5 py-1 text-center font-mono text-[9px] leading-tight text-[color:var(--fg-3,#5C647A)]">
                        Not on record
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="border-b border-[color:var(--line,#E1E5EF)] pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Signals</h3>
          <dl className="mt-1.5 space-y-1.5 text-sm text-[color:var(--fg,#0B0E17)]">
            {card.region ? (
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Region</dt>
                <dd>{card.region}</dd>
              </div>
            ) : null}
            {card.campuses.length > 0 ? (
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">{card.campuses.length > 1 ? "Campuses" : "Campus"}</dt>
                <dd>{card.campuses.join(", ")}</dd>
              </div>
            ) : null}
            {card.status ? (
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Status</dt>
                <dd>{card.status}</dd>
              </div>
            ) : null}
            {card.teamSize ? (
              <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--fg-3,#5C647A)]">Team</dt>
                <dd>{card.teamSize}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="pb-1">
          <h3 className="border-b border-[color:var(--line,#E1E5EF)] pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--cobalt,#2F4FD8)]">Links</h3>
          {card.links.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {card.links.map((link) => (
                <li key={link.kind}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 items-center gap-2 rounded-md border border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg,#FFFFFF)] px-3 font-mono text-[12px] text-[color:var(--fg,#0B0E17)] hover:border-[color:var(--cobalt,#2F4FD8)]"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center text-[color:var(--cobalt,#2F4FD8)]">
                      <LinkMark kind={link.kind} />
                    </span>
                    <span className="min-w-0 truncate">{LINK_LABEL[link.kind]}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1.5 rounded-sm border border-dashed border-[color:var(--line,#E1E5EF)] bg-[color:var(--bg-sunken,#F3F5F9)] px-2.5 py-2">
              <p className="font-mono text-[11px] text-[color:var(--fg-3,#5C647A)]">Not on record</p>
              <p className="mt-0.5 break-words text-[11px] leading-snug text-[color:var(--fg-3,#5C647A)]">No verified website or social links stored.</p>
            </div>
          )}
        </section>
      </div>
    );
  }
  return (
    <div data-testid="startup-directory-card" className="relative flex h-full min-h-0 flex-col bg-white">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg bg-white text-black hover:bg-neutral-100">
          <CloseIcon />
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
    </div>
  );
}

function FounderAvatar({ name }: { name: string }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[color:var(--cobalt-haze,#E8ECFA)] font-mono text-[11px] font-bold text-[color:var(--cobalt,#2F4FD8)] sm:h-10 sm:w-10 sm:text-xs" aria-hidden>
      {personInitials(name)}
    </div>
  );
}

export function useStartupCard(id: string, initial: StartupCard | null): { card: StartupCard | null; settled: boolean } {
  const ready = initial?.id === id ? initial : null;
  const [card, setCard] = useState<StartupCard | null>(ready);
  const [settled, setSettled] = useState(ready != null || id.startsWith("user_"));
  const [forId, setForId] = useState(id);
  if (forId !== id) {
    setForId(id);
    const next = initial?.id === id ? initial : null;
    setCard(next);
    setSettled(next != null || id.startsWith("user_"));
  }

  useEffect(() => {
    if (id.startsWith("user_")) return;
    if (initial?.id === id) return;
    let cancel = false;
    fetch(`/api/startup-card?id=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ card: StartupCard | null }>) : null))
      .then((data) => {
        if (cancel) return;
        setCard(data?.card ?? null);
        setSettled(true);
      })
      .catch(() => {
        if (cancel) return;
        setCard(null);
        setSettled(true);
      });
    return () => {
      cancel = true;
    };
  }, [id, initial]);

  return { card, settled };
}

export function StartupCardPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { card, settled } = useStartupCard(id, null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label={card?.name ? `${card.name} startup` : "Startup"}
      className="flex h-full w-full flex-col overflow-hidden bg-white text-black shadow-[0_8px_30px_rgba(28,21,37,0.12)] sm:w-[440px] sm:max-w-[470px] sm:border-l sm:border-neutral-200"
    >
      {card ? (
        <StartupDirectoryCard card={card} onClose={onClose} />
      ) : (
        <div className="flex items-start justify-between gap-3 p-4">
          <p className="text-sm text-neutral-600">{settled ? "This startup is not on record." : "Loading startup…"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-black hover:bg-neutral-100">
            <CloseIcon />
          </button>
        </div>
      )}
    </aside>
  );
}

export function StartupCardSheet({ id, onClose, className }: { id: string; onClose: () => void; className?: string }) {
  return (
    <div className={className ?? "absolute inset-0 z-30 flex justify-end max-sm:fixed max-sm:z-50"}>
      <StartupCardPanel id={id} onClose={onClose} />
    </div>
  );
}
