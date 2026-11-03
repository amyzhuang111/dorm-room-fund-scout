"use client";

import Link from "next/link";
import type { CompanyRecommendations } from "@/lib/domain/company-recommendations";
import { LogoMark } from "./sample-instrument";
import { useUserPipeline } from "./user-pipeline-provider";
import styles from "./company-mobile.module.css";
import { companyRecordHref } from "@/lib/ui/company-browse-path";
import { requestCompanyBrowseRestore } from "@/lib/client/company-browse-position";

export type CompanyDossier = {
  id?: string;
  name: string;
  campus?: string | null;
  schoolId?: string | null;
  sectorId?: string | null;
  sector?: string | null;
  year?: number | null;
  primaryProgram?: string | null;
  founders?: string[];
  founderConfirmed?: boolean;
  founderProfiles?: { name: string; url: string | null; confirmed: boolean }[];
  signals?: number;
  operatingStatus?: string | null;
  latestSignalAt?: string | null;
  logoUrl?: string | null;
  pitch?: string | null;
  stage?: string | null;
  signalLabel?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  sourceUrl?: string | null;
  peerCount?: number;
  recommendations?: CompanyRecommendations;
  returnTo?: string | null;
};

export function CompanyPeers({ recommendations, returnTo }: { recommendations?: CompanyRecommendations; returnTo?: string | null }) {
  if (!recommendations?.rows.length) return null;
  const title = recommendations.scope === "signals" ? "More companies" : "Similar companies";
  return <section className={styles.peers} data-dossier-peers-section="" aria-label={title}>
    <div className={styles.sectionHeading}><h2>{title}</h2><span>{recommendations.context}</span></div>
    <ol data-dossier-signal-timeline="">
      {recommendations.rows.map((company, index) => <li key={company.id}>
        <span className={styles.peerRank}>{String(index + 1).padStart(2, "0")}</span>
        <Link href={companyRecordHref(company.id, returnTo)} className={styles.peerLink}>{company.name}</Link>
        <span className={styles.peerReason} title={company.detail}>{company.reason}</span>
      </li>)}
    </ol>
    <Link className={styles.peerBrowse} href={recommendations.href}>{recommendations.linkLabel}<span aria-hidden="true"> →</span></Link>
  </section>;
}

export function CompanyRecordHeader({ dossier }: { dossier: CompanyDossier }) {
  const pipeline = useUserPipeline();
  const saved = pipeline.state.links.some(l => l.entityType === "project" && l.entityId === dossier.id);
  const founders = dossier.founderProfiles?.length ? dossier.founderProfiles : (dossier.founders ?? []).map(name => ({ name, url: null, confirmed: false }));
  return <header className={styles.companyHeader} data-company-mobile-hero="" data-dossier-hero="" data-summary-card="">
    <Link href={dossier.returnTo || "/companies"} scroll={!dossier.returnTo} onNavigate={() => dossier.returnTo && requestCompanyBrowseRestore(dossier.returnTo)} className={styles.backLink}>{dossier.returnTo ? "← Back to results" : "← All companies"}</Link>
    <div className={styles.companyTitle}>
      <LogoMark name={dossier.name} logoUrl={dossier.logoUrl} size={44} />
      <div><p className={styles.eyebrow}>Company record</p><h1 data-company-name-lead="">{dossier.name}</h1></div>
    </div>
    {dossier.pitch && <p className={styles.pitch} data-dossier-pitch="">{dossier.pitch}</p>}
    <p className={styles.identity} data-full-record-identity="">
      <strong>{dossier.campus || "Campus not on record"}</strong>
      {dossier.year != null && <span>Founded {dossier.year}</span>}
      {dossier.stage && <span>{dossier.stage}</span>}
      {dossier.primaryProgram && <span>{dossier.primaryProgram}</span>}
      {!!dossier.signals && <span>{dossier.signals.toLocaleString("en-US")} {dossier.signals === 1 ? "signal" : "signals"} on record</span>}
    </p>
    <div className={styles.founders} data-full-record-founders-peek="" data-dossier-founders-lead="">
      <p className={styles.eyebrow}>Founders</p>
      {founders.length ? <ul>{founders.map((founder, index) => <li key={`${founder.name}-${index}`}>
        {founder.url ? <a href={founder.url} target="_blank" rel="noopener noreferrer" aria-label={`${founder.name} on LinkedIn`}>{founder.name}<span aria-hidden="true"> ↗</span></a> : <span>{founder.name}</span>}
        {founder.confirmed && <span className={styles.confirmed} data-full-record-confirmed="" title="This founder's LinkedIn profile is confirmed in the stored record.">Confirmed</span>}
      </li>)}</ul> : <p>Names not on record</p>}
      {founders.some(f => f.confirmed) && <p className={styles.verificationNote}>Confirmed refers to the linked founder profile.</p>}
    </div>
    <div className={styles.companyActions}>
      {dossier.websiteUrl && <a href={dossier.websiteUrl} target="_blank" rel="noopener noreferrer">Website ↗</a>}
      {dossier.linkedinUrl && <a href={dossier.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>}
      {dossier.id && <button type="button" aria-pressed={saved} onClick={() => saved ? pipeline.unstar("project", dossier.id!) : pipeline.star({ entityType: "project", entityId: dossier.id!, name: dossier.name, campusName: dossier.campus ?? null, websiteUrl: dossier.websiteUrl ?? null })}>{saved ? "Saved ✓" : "Save company"}</button>}
      <a href="#evidence">Sources</a>
      {saved && <p className={styles.saveStatus} role="status">{pipeline.storage === "remote" ? "Saved to your pipeline." : "Saved in this browser."} <Link href="/startup/pipeline">View pipeline</Link></p>}
    </div>
    <div className={styles.mobilePeers}><CompanyPeers recommendations={dossier.recommendations} returnTo={dossier.returnTo} /></div>
  </header>;
}
