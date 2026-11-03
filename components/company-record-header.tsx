"use client";

import Link from "next/link";
import type { FacetCompany } from "@/lib/domain/sample-facets";
import { LogoMark } from "./sample-instrument";
import { useUserPipeline } from "./user-pipeline-provider";
import styles from "./company-mobile.module.css";

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
};

export function CompanyPeers({ companies, subjectId, campus }: { companies: FacetCompany[]; subjectId?: string; campus?: string | null }) {
  const rows = companies.filter(c => c.id !== subjectId).slice().sort((a, b) => (b.signals ?? 0) - (a.signals ?? 0) || a.name.localeCompare(b.name)).slice(0, 6);
  if (!rows.length) return null;
  return <section className={styles.peers} data-dossier-peers-section="" aria-label="Similar companies">
    <div className={styles.sectionHeading}><h2>Similar companies</h2><span>{campus ? `Also at ${campus}` : "Related sector"}</span></div>
    <ol data-dossier-signal-timeline="">
      {rows.map((company, index) => <li key={company.id}>
        <span className={styles.peerRank}>{String(index + 1).padStart(2, "0")}</span>
        <Link href={`/startup/${company.id}`} className={styles.peerLink}>{company.name}</Link>
        <span className={styles.peerReason}>{company.sector || company.signalLabel || "Company record"}</span>
      </li>)}
    </ol>
  </section>;
}

export function CompanyRecordHeader({ dossier, peers, campusShort }: { dossier: CompanyDossier; peers: FacetCompany[]; campusShort: string }) {
  const pipeline = useUserPipeline();
  const saved = pipeline.state.links.some(l => l.entityType === "project" && l.entityId === dossier.id);
  const founders = dossier.founderProfiles?.length ? dossier.founderProfiles : (dossier.founders ?? []).map(name => ({ name, url: null, confirmed: false }));
  return <header className={styles.companyHeader} data-company-mobile-hero="" data-dossier-hero="" data-summary-card="">
    <Link href="/companies" className={styles.backLink}>← All companies</Link>
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
    <div className={styles.mobilePeers}><CompanyPeers companies={peers} subjectId={dossier.id} campus={dossier.schoolId ? campusShort : null} /></div>
  </header>;
}
