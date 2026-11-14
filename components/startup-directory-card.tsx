"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShortlistStar } from "./entity-marks";
import { useUserPipeline } from "./user-pipeline-provider";
import { userStartupPreview, userFounderPreview } from "@/lib/domain/user-preview";
import type { FounderPreview, FounderPreviewLink } from "@/lib/domain/founder-preview";
import styles from "./startup-directory-card.module.css";
import { DrawnMark, imageIsFlat } from "./drawn-mark";
import type { StartupCard, StartupCardFounder, StartupLinkKind } from "@/lib/domain/startup-card";
import { networkExplorationHref } from "@/lib/domain/exploration-navigation";
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

function CompanyLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const src = logoUrl?.startsWith("/") && !logoUrl.startsWith("//") ? logoUrl : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className={styles.logo} aria-hidden="true">
      {src && src !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={64} height={64} onError={() => setFailedSrc(src)} onLoad={(event) => { if (imageIsFlat(event.currentTarget)) setFailedSrc(src); }} />
      ) : <DrawnMark name={name} className="h-8 w-8" />}
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
    ["Region", card.region || "Not on record"],
    ["Team size", card.teamSize ? card.teamSize.replace(/\d[\d,]*/g, value => Number(value.replaceAll(",", "")).toLocaleString("en-US")) : "Not on record"],
    ["Status", card.status || "Not on record"],
    ["Founded", card.foundedYear || "Not on record"],
    [card.campuses.length > 1 ? "Campuses" : "Campus", card.campuses.join(", ") || "Not on record"],
  ].filter((fact): fact is string[] => fact !== null);

  return (
    <article data-testid="startup-directory-card" className={`${styles.card} ${embedded ? styles.embedded : ""}`}>
      <DirectoryHeader id={card.id} name={card.name} subtitle={card.subtitle} logoUrl={card.logoUrl}
        entityType="project" campus={card.campuses[0]} websiteUrl={card.websiteUrl} onClose={onClose} sector={card.sector}
        links={card.links.map(link => ({ kind: link.kind, url: link.url, label: `${LINK_LABEL[link.kind]}${link.confirmed === false ? " (unverified)" : ""}` }))} />
      <div className={styles.body}>
        {card.description && <p className={styles.description}>{card.description}</p>}
        {facts.length > 0 && <dl className={styles.facts}>{facts.map(([label, value]) => (
          <div key={label}><dt>{label}:</dt><dd>{value}</dd></div>
        ))}</dl>}
        {card.verifiedOn && <p className={styles.verified}><span aria-hidden="true">✓</span> Verified {card.verifiedOn}{card.verifiedSource ? ` · ${card.verifiedSource}` : ""}</p>}
        {!card.verifiedOn && card.verificationStatus && <p className={styles.verified}>{card.verificationStatus === "confirmed" ? "✓ Confirmed company" : card.verificationStatus === "user-added" ? "Added by you" : "Verification pending"}</p>}
        {card.sourceLink && <a className={styles.sourceLink} href={card.sourceLink.url} target="_blank" rel="noopener noreferrer" title={card.sourceLink.label} aria-label={`Source: ${card.sourceLink.label}`}>Source <span aria-hidden="true">↗</span></a>}
        <section className={styles.founders} aria-label="Founders">
          <h3>Founders</h3>
          {card.founders.length === 0 ? <p className={styles.empty}>Founder details haven’t been added yet.</p> : (
            <ul>{card.founders.map(founder => {
              const meta = founderMeta(founder);
              return (
                <li key={founder.id} className={styles.founder}>
                  <FounderAvatar name={founder.name} photoUrl={founder.photoUrl} />
                  <div className={styles.founderInfo}>
                    <Link className={styles.founderName} href={`/founder/discover?founder=${encodeURIComponent(founder.id)}`} onClick={event => { if (onFounderSelect?.(founder.id)) event.preventDefault(); }}>{founder.name}</Link>
                    {founder.role && <p className={styles.role}>{founder.role}</p>}
                    {meta && <p className={styles.founderMeta}><SchoolIcon /><span>{meta}</span></p>}
                  </div>
                  {founder.linkedinUrl && founder.linkedinConfidence ? (
                    <a className={styles.linkedin} href={founder.linkedinUrl} target="_blank" rel="noopener noreferrer"
                      aria-label={`LinkedIn for ${founder.name}${founder.linkedinConfidence === "likely" ? " (likely match)" : founder.linkedinConfidence === "unverified" ? " (unverified)" : ""}`}
                      title={founder.linkedinConfidence === "confirmed" ? "Verified public LinkedIn profile" : founder.linkedinConfidence === "likely" ? "Likely LinkedIn profile; not confirmed" : "User-added LinkedIn; not confirmed"}>
                      <span>in</span>{founder.linkedinConfidence !== "confirmed" && <small>{founder.linkedinConfidence === "likely" ? "Likely" : "Unverified"}</small>}
                    </a>
                  ) : null}
                </li>
              );
            })}</ul>
          )}
        </section>
        {children}
        <ExploreConnections id={card.id} kind="startup" />
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

function DirectoryHeader({ id, name, subtitle, logoUrl, entityType, campus, websiteUrl, onClose, sector, links }: {
  id: string; name: string; subtitle: string | null; logoUrl?: string | null;
  entityType: "person" | "project"; campus?: string; websiteUrl?: string | null;
  onClose?: () => void; sector?: string | null; links: FounderPreviewLink[];
}) {
  return <header className={styles.header}>
    <div className={styles.identity}>
      {entityType === "person" ? <FounderAvatar name={name} photoUrl={null} /> : <CompanyLogo name={name} logoUrl={logoUrl} />}
      <div className={styles.heading}><h2>{name}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <div className={styles.actions}>
        <ShortlistStar entityType={entityType} entityId={id} name={name} campusName={campus} websiteUrl={websiteUrl} />
        {onClose && <button type="button" onClick={onClose} aria-label={`Close ${entityType === "person" ? "founder" : "startup"} card`}><CloseIcon /></button>}
      </div>
    </div>
    {sector && <div className={styles.badges}><span>{sector}</span></div>}
    {links.length > 0 && <nav className={styles.socials} aria-label={`${name} links`}>
      {links.map(link => <a key={`${link.kind}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}>
        {link.kind in LINK_LABEL ? <LinkMark kind={link.kind as StartupLinkKind} /> : <span className={styles.linkMark}>{{ twitter: "𝕏", scholar: "sch", substack: "S", huggingface: "HF", devpost: "D" }[link.kind] ?? "↗"}</span>}
      </a>)}
    </nav>}
  </header>;
}

export function FounderDirectoryCard({ card, onClose, onStartupSelect, children }: {
  card: FounderPreview; onClose: () => void; onStartupSelect: (id: string) => boolean; children?: ReactNode;
}) {
  return <article data-testid="founder-directory-card" className={styles.card}>
    <DirectoryHeader id={card.id} name={card.name} subtitle={card.subtitle} entityType="person"
      campus={card.schools[0]} onClose={onClose} links={card.links} />
    <div className={styles.body}>
      <dl className={styles.facts}>
        {card.schools.length > 0 && <div><dt>{card.schools.length > 1 ? "Schools" : "School"}:</dt><dd>{card.schools.join(" · ")}</dd></div>}
        {card.classYear && <div><dt>Class:</dt><dd>{card.classYear}{card.classYearSource && <a href={card.classYearSource} target="_blank" rel="noopener noreferrer" aria-label="Class year source"> ↗</a>}</dd></div>}
      </dl>
      {card.verifiedOn ? <p className={styles.verified}>✓ Verified {card.verifiedOn}</p> : card.verificationStatus && <p className={styles.verified}>{card.verificationStatus === "confirmed" ? "✓ Confirmed founder" : card.verificationStatus === "user-added" ? "Added by you" : "Verification pending"}</p>}
      <section className={styles.founders} aria-label="Founded companies">
        <h3>Founded</h3>
        {card.companies.length ? <ul>{card.companies.map(company => <li key={company.id} className={styles.founder}>
          <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
          <div className={styles.founderInfo}>
            <Link className={styles.founderName} href={`/startup/${encodeURIComponent(company.id)}?from=map`} onClick={event => { if (onStartupSelect(company.id)) event.preventDefault(); }}>{company.name}</Link>
            {company.role && <p className={styles.role}>{company.role}</p>}
            {company.description && <p className={styles.companyDescription}>{company.description}</p>}
          </div>
          {company.websiteUrl && <a className={styles.companyWebsite} href={company.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`Website for ${company.name}`} title={`Website for ${company.name}`}><GlobeIcon /></a>}
        </li>)}</ul> : <p className={styles.empty}>No founded company recorded yet.</p>}
      </section>
      {children}
      <ExploreConnections id={card.id} kind="founder" />
      <Link className={styles.fullRecord} href={card.recordHref}>{card.verificationStatus === "user-added" ? "View pipeline record" : "View full founder record"} <span aria-hidden="true">↗</span></Link>
    </div>
  </article>;
}

function ExploreConnections({id,kind}:{id:string;kind:'founder'|'startup'}) {
  const [returnTo,setReturnTo]=useState('/');
  useEffect(()=>{setReturnTo(window.location.pathname+window.location.search);},[id]);
  if(returnTo.startsWith('/networks')||id.startsWith('user_')||id.startsWith('ufounder_'))return null;
  return <Link className={styles.fullRecord} href={networkExplorationHref({entity:id,kind,returnTo})}>Explore connections <span aria-hidden="true">↗</span></Link>;
}

function useRecordCard<T extends { id: string }>(kind: "startup" | "founder", id: string, initial: T | null) {
  const ready = initial?.id === id ? initial : null;
  const [result, setResult] = useState<{ id: string; card: T | null; settled: boolean }>({ id, card: ready, settled: !!ready });
  useEffect(() => {
    if (!id || id.startsWith("user_") || id.startsWith("ufounder_") || initial?.id === id) return;
    const controller = new AbortController();
    fetch(`/api/${kind}-card?id=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() as Promise<{ card: T | null }> : Promise.reject(new Error("Card unavailable")))
      .then(data => setResult({ id, card: data.card, settled: true }))
      .catch(() => { if (!controller.signal.aborted) setResult({ id, card: null, settled: true }); });
    return () => controller.abort();
  }, [kind, id, initial]);
  return ready ? { card: ready, settled: true } : result.id === id ? result : { card: null, settled: false };
}

export function useStartupCard(id: string, initial: StartupCard | null) {
  const { state } = useUserPipeline();
  const result = useRecordCard("startup", id, initial);
  const local = state.startups.find(startup => startup.id === id);
  return id.startsWith("user_") ? { card: local ? userStartupPreview(local) : null, settled: true } : result;
}

function EntityCardPanel({ id, kind, onClose, onFounderSelect, onStartupSelect, children }: {
  id: string; kind: "startup" | "founder"; onClose: () => void;
  onFounderSelect?: (id: string) => boolean; onStartupSelect?: (id: string) => boolean; children?: ReactNode;
}) {
  const [selection, setSelection] = useState({ id, kind });
  const panelRef = useRef<HTMLElement>(null);
  const { state } = useUserPipeline();
  const startup = useStartupCard(selection.kind === "startup" ? selection.id : "", null);
  const fetchedFounder = useRecordCard<FounderPreview>("founder", selection.kind === "founder" ? selection.id : "", null);
  const founder = selection.id.startsWith("ufounder_") ? { card: userFounderPreview(selection.id, state.startups), settled: true } : fetchedFounder;
  const current = selection.kind === "startup" ? startup : founder;
  const original = selection.kind === kind && selection.id === id;
  const select = (nextKind: "startup" | "founder", nextId: string) => {
    const handled = nextKind === "startup" ? onStartupSelect?.(nextId) : onFounderSelect?.(nextId);
    if (!handled) setSelection({ id: nextId, kind: nextKind });
    return true;
  };
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [selection.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return <aside ref={panelRef} tabIndex={-1} role="dialog" aria-label={current.card ? `${current.card.name} ${selection.kind}` : selection.kind === "startup" ? "Startup" : "Founder"} className={styles.panel}>
    {!original && <button type="button" className={styles.back} onClick={() => setSelection({ id, kind })}>← Back to {kind}</button>}
    {selection.kind === "startup" && startup.card ? <StartupDirectoryCard key={selection.id} card={startup.card} onClose={onClose} onFounderSelect={nextId => select("founder", nextId)}>{original ? children : null}</StartupDirectoryCard>
      : selection.kind === "founder" && founder.card ? <FounderDirectoryCard key={selection.id} card={founder.card} onClose={onClose} onStartupSelect={nextId => select("startup", nextId)}>{original ? children : null}</FounderDirectoryCard>
      : <div className={styles.loading}><p role="status">{current.settled ? "This record is unavailable." : `Loading ${selection.kind}…`}</p><button type="button" onClick={onClose} aria-label={`Close ${selection.kind} card`}><CloseIcon /></button></div>}
  </aside>;
}

type PanelProps = { id: string; onClose: () => void; onFounderSelect?: (id: string) => boolean; onStartupSelect?: (id: string) => boolean; children?: ReactNode };
export function StartupCardPanel(props: PanelProps) { return <EntityCardPanel key={props.id} {...props} kind="startup" />; }
export function FounderCardPanel(props: PanelProps) { return <EntityCardPanel key={props.id} {...props} kind="founder" />; }

function CardSheet({ kind, className, ...props }: PanelProps & { kind: "startup" | "founder"; className?: string }) {
  return <div className={`${styles.sheet} ${className ?? "fixed inset-y-3 right-3 z-[210] flex w-[min(280px,calc(100%-24px))] justify-end max-sm:inset-y-2 max-sm:right-2 max-sm:w-[calc(100%-16px)]"}`} onClick={event => event.stopPropagation()}>
    <EntityCardPanel key={props.id} {...props} kind={kind} />
  </div>;
}
export function StartupCardSheet(props: PanelProps & { className?: string }) { return <CardSheet {...props} kind="startup" />; }
export function FounderCardSheet(props: PanelProps & { className?: string }) { return <CardSheet {...props} kind="founder" />; }
