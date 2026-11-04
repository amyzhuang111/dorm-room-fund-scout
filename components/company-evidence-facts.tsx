"use client";

import { useEffect, useState } from "react";
import type { ProjectDetail } from "@/lib/domain/queries";
import { displayedFunding } from "@/lib/domain/company-profile";

function sourceLabel(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Stored source"; } }

/** Fetch at most three full records; directory loading remains light. */
export function CompanyEvidenceFacts({ id }: { id: string }) {
  const [record, setRecord] = useState<ProjectDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project/${encodeURIComponent(id)}`).then(async (res) => {
      if (!res.ok) throw new Error("record");
      return res.json() as Promise<ProjectDetail>;
    }).then((data) => { if (!cancelled) setRecord(data); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  if (failed) return <div role="alert" className="workspace-result">Sources could not load. <button className="underline" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry evidence</button></div>;
  if (!record) return <p role="status" className="workspace-result">Loading sourced evidence…</p>;
  const funding = displayedFunding(record.profile);
  return <div className="comparison-evidence"><h3>Identity & source evidence</h3><dl>
    <div><dt>Company verification</dt><dd>{record.verificationStatus || "Not on record"}{record.lastVerifiedAt ? ` · ${record.lastVerifiedAt}` : ""}</dd>{record.verificationNote ? <dd className="workspace-result">{record.verificationNote}</dd> : null}</div>
    <div><dt>Founder identity & enrollment</dt><dd>{record.founderLinks.length ? <ul>{record.founderLinks.map((f) => <li key={f.personId}><strong>{f.name}</strong><p>{[f.school, f.graduationYear ? `Class of ${f.graduationYear}` : "Class year not on record", f.program, f.enrollmentLabel].filter(Boolean).join(" · ")}</p>{f.link ? <a href={f.link.url} target="_blank" rel="noopener noreferrer">{f.link.kind === "linkedin" ? "Confirmed LinkedIn identity" : f.link.kind === "likely" ? "Likely LinkedIn match" : f.link.label}</a> : <span>Identity source not on record</span>}</li>)}</ul> : "Not on record"}</dd></div>
    <div><dt>Capital on record</dt><dd>{funding?.text ?? "Not on record"}{funding?.sourceUrl ? <> · <a href={funding.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></> : null}</dd></div>
    <div><dt>Open eligibility questions</dt><dd>{record.gateOutcomes.filter((g) => g.result !== "pass").map((g) => g.rationale).join(" · ") || "No unresolved eligibility concerns on record"}</dd></div>
    <div><dt>Evidence collected</dt><dd>{record.claims.length.toLocaleString("en-US")} claims · {record.signals.length.toLocaleString("en-US")} signals</dd><dd><ul>{record.claims.slice(0, 3).map((c, index) => <li key={`${c.sourceUrl}-${index}`}><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{sourceLabel(c.sourceUrl)}</a></li>)}</ul></dd></div>
  </dl><p className="workspace-result">Confirmed LinkedIn identity does not establish current enrollment or investment eligibility.</p></div>;
}
