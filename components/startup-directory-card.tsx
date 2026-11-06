"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShortlistStar } from "./entity-marks";
import styles from "./startup-directory-card.module.css";
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

function CompanyLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const src = logoUrl?.startsWith("/") && !logoUrl.startsWith("//") ? logoUrl : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={styles.logo} aria-hidden="true">
      {src && src !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={64} height={64} onError={() => setFailedSrc(src)} />
      ) : companyInitials(name).slice(0, 2)}
    </div>
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
  return <span className={styles.linkMark}>{text}</span>;
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
  const parts = [place, founder.linkedinFollowers != null ? `${founder.linkedinFollowers.toLocaleString("en-US")} LinkedIn followers` : null, founder.yearsExperience != null ? `${founder.yearsExperience} years experience` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Shared map/network preview. Only fields and links present in the record are shown. */
export function StartupDirectoryCard({
  card,
  onClose,
  embedded = false,
  onFounderSelect,
  children,
}: {
  card: StartupCard;
  onClose?: () => void;
  embedded?: boolean;
  onFounderSelect?: (id: string) => boolean;
  children?: ReactNode;
}) {
  const facts = [
    card.region ? ["Region", card.region] : null,
    card.teamSize ? ["Team size", card.teamSize.replace(/\d[\d,]*/g, value => Number(value.replaceAll(",", "")).toLocaleString("en-US"))] : null,
    card.status ? ["Status", card.status] : null,
    card.campuses.length ? [card.campuses.length > 1 ? "Campuses" : "Campus", card.campuses.join(", ")] : null,
  ].filter((fact): fact is string[] => fact !== null);

  return (
    <article data-testid="startup-directory-card" className={`${styles.card} ${embedded ? styles.embedded : ""}`}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <CompanyLogo name={card.name} logoUrl={card.logoUrl} />
          <div className={styles.heading}>
            <h2>{card.name}</h2>
            {card.subtitle && <p>{card.subtitle}</p>}
          </div>
          <div className={styles.actions}>
            <ShortlistStar entityType="project" entityId={card.id} name={card.name} campusName={card.campuses[0]} websiteUrl={card.websiteUrl} />
            {onClose && <button type="button" onClick={onClose} aria-label="Close startup card"><CloseIcon /></button>}
          </div>
        </div>
        {card.sector && <div className={styles.badges}><span>{card.sector}</span></div>}
        {card.links.length > 0 && (
          <nav className={styles.socials} aria-label={`${card.name} links`}>
            {card.links.map(link => (
              <a key={link.kind} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${LINK_LABEL[link.kind]}${link.confirmed === false ? " (unverified)" : ""}`} title={`${LINK_LABEL[link.kind]}${link.confirmed === false ? " (unverified)" : ""}`}>
                <LinkMark kind={link.kind} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <div className={styles.body}>
        {card.description && <p className={styles.description}>{card.description}</p>}
        {facts.length > 0 && <dl className={styles.facts}>{facts.map(([label, value]) => (
          <div key={label}><dt>{label}:</dt><dd>{value}</dd></div>
        ))}</dl>}
        {card.verifiedOn && <p className={styles.verified}><span aria-hidden="true">✓</span> Verified {card.verifiedOn}{card.verifiedSource ? ` · ${card.verifiedSource}` : ""}</p>}
        {!card.verifiedOn && card.verificationStatus && <p className={styles.verified}>{card.verificationStatus === "confirmed" ? "✓ Confirmed company" : "Verification pending"}</p>}
        {card.sourceLink && <a className={styles.sourceLink} href={card.sourceLink.url} target="_blank" rel="noopener noreferrer">{card.sourceLink.label} <span aria-hidden="true">↗</span></a>}
        <section className={styles.founders} aria-label="Founders">
          <h3>Founders</h3>
          {card.founders.length === 0 ? <p className={styles.empty}>Founder details haven’t been added yet.</p> : (
            <ul>{card.founders.map(founder => {
              const meta = founderMeta(founder);
              return (
                <li key={founder.id} className={styles.founder}>
                  <FounderAvatar name={founder.name} photoUrl={founder.photoUrl} />
                  <div className={styles.founderInfo}>
                    <Link className={styles.founderName} href={`/founders?founder=${encodeURIComponent(founder.id)}`} onClick={event => { if (onFounderSelect?.(founder.id)) event.preventDefault(); }}>{founder.name}</Link>
                    {founder.role && <p className={styles.role}>{founder.role}</p>}
                    {meta && <p className={styles.founderMeta}><SchoolIcon /><span>{meta}</span></p>}
                  </div>
                  {founder.linkedinUrl && founder.linkedinConfidence ? (
                    <a className={styles.linkedin} href={founder.linkedinUrl} target="_blank" rel="noopener noreferrer"
                      aria-label={`LinkedIn for ${founder.name}${founder.linkedinConfidence === "likely" ? " (likely match)" : ""}`}
                      title={founder.linkedinConfidence === "confirmed" ? "Verified public LinkedIn profile" : "Likely LinkedIn profile; not confirmed"}>
                      <span>in</span>{founder.linkedinConfidence === "likely" && <small>Likely</small>}
                    </a>
                  ) : null}
                </li>
              );
            })}</ul>
          )}
        </section>
        {children}
        {!embedded && <Link className={styles.fullRecord} href={`/startup/${encodeURIComponent(card.id)}?from=map`}>View full company record <span aria-hidden="true">↗</span></Link>}
      </div>
    </article>
  );
}

function FounderAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={styles.avatar} aria-hidden="true">
      {photoUrl && photoUrl !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" width={60} height={60} loading="lazy" onError={() => setFailedSrc(photoUrl)} />
      ) : personInitials(name)}
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

export function StartupCardPanel({ id, onClose, onFounderSelect, children }: { id: string; onClose: () => void; onFounderSelect?: (id: string) => boolean; children?: ReactNode }) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const { card, settled } = useStartupCard(id, null);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={card?.name ? `${card.name} startup` : "Startup"}
      className={styles.panel}
    >
      {card ? (
        <StartupDirectoryCard key={id} card={card} onClose={onClose} onFounderSelect={onFounderSelect}>{children}</StartupDirectoryCard>
      ) : (
        <div className="flex items-start justify-between gap-3 p-4">
          <p className="text-sm text-neutral-600">{settled ? "This startup is not on record." : "Loading startup…"}</p>
          <button type="button" onClick={onClose} aria-label="Close startup card" className="grid h-11 w-11 place-items-center rounded-lg text-black hover:bg-neutral-100">
            <CloseIcon />
          </button>
        </div>
      )}
    </aside>
  );
}

export function StartupCardSheet({ id, onClose, className }: { id: string; onClose: () => void; className?: string }) {
  return (
    <div className={`${styles.sheet} ${className ?? "fixed inset-y-3 right-3 z-[210] flex w-[min(440px,calc(100%-24px))] justify-end max-sm:inset-y-2 max-sm:right-2 max-sm:w-[calc(100%-16px)]"}`} onClick={event => event.stopPropagation()}>
      <StartupCardPanel id={id} onClose={onClose} />
    </div>
  );
}
