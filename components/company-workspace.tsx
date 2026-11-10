"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { STATUS_LABEL, statusOf } from "@/lib/domain/sample-facets";
import { loadDirectoryClient } from "@/lib/client/directory-cache";
import type { DirectoryCard } from "@/lib/domain/directory";
import { matchesFeedback } from "@/lib/domain/feedback";
import { useFeedback } from "./feedback-provider";
import { CompanyReviewActions } from "./company-review-actions";
import { CompanyEvidenceFacts } from "./company-evidence-facts";

export function CompanyWorkspace({ mode }: { mode: "saved" | "compare" }) {
  const { records, remote } = useFeedback();
  const params = useSearchParams();
  const router = useRouter();
  const [catalog, setCatalog] = useState<DirectoryCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [mobileCompany, setMobileCompany] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadDirectoryClient().then((data) => { if (!cancelled) { setCatalog(data.cards); setFailed(false); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  const ids = [...new Set((params.get("ids") ?? "").split(",").filter(Boolean))].slice(0, 3);
  const saved = useMemo(() => (catalog ?? []).filter((card) => records.some((r) => r.action === "like" && matchesFeedback(r, { entityType: "project", entityId: card.id, name: card.name, domain: null }))), [catalog, records]);
  const outsideDirectory = catalog ? records.filter((r) => r.entityType === "project" && r.action === "like" && !catalog.some((c) => matchesFeedback(r, { entityType: "project", entityId: c.id, name: c.name, domain: null }))) : [];
  const unavailable = catalog ? ids.filter((id) => !catalog.some((c) => c.id === id)) : [];
  const choices = (catalog ?? []).filter((card) => !ids.includes(card.id) && [card.name, card.school, card.sector, ...card.founders].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const visible = (mode === "saved" ? saved : (catalog ?? []).filter((c) => ids.includes(c.id)))
    .filter((c) => mode === "compare" || [c.name, c.school, c.sector, ...c.founders].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => mode === "compare" ? ids.indexOf(a.id) - ids.indexOf(b.id) : sort === "recent" ? (b.latestSignalAt ?? "").localeCompare(a.latestSignalAt ?? "") || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  function select(next: string[]) { router.replace(`/compare?ids=${next.map(encodeURIComponent).join(",")}`, { scroll: false }); }
  const activeCompany = visible.some((c) => c.id === mobileCompany) ? mobileCompany : visible[0]?.id;
  return (
    <div className="company-workspace" data-scout-live="">
      <nav className="workspace-tabs" aria-label="Review workspace">
        <Link href="/work/shortlist" aria-current={mode === "saved" ? "page" : undefined}>Saved companies{catalog ? ` (${(saved.length + outsideDirectory.length).toLocaleString("en-US")})` : ""}</Link>
        <Link href="/compare" aria-current={mode === "compare" ? "page" : undefined}>Compare</Link>
        <Link href="/work/founders">Founder review</Link>
        <Link href="/work/pipeline">Pipeline</Link>
      </nav>
      <p className="workspace-kicker">Your research workspace</p>
      <h1>{mode === "saved" ? "A shortlist worth following." : "Compare the evidence."}</h1>
      <p className="workspace-intro">{mode === "saved" ? "Save companies while you explore. Return here to review their founders, campus and latest signals." : "Choose up to three companies. Compare stored facts, then open each record to assess its sources and founder identity."}</p>
      <p className="workspace-storage">{remote === "on" ? "Review changes are synced with your configured feedback store." : "Saved in this browser."}</p>
      {failed ? <div role="alert" className="workspace-empty"><h2>Company data could not load.</h2><p>Your saved selections are still in this browser.</p><button onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button></div> : !catalog ? <div role="status" className="workspace-empty">Loading company records…</div> : <>
          {mode === "compare" && visible.length > 1 ? <div className="comparison-mobile-switch" role="group" aria-label="Company to read">{visible.map((c) => <button key={c.id} type="button" aria-pressed={activeCompany === c.id} aria-controls={`compare-${c.id}`} onClick={() => setMobileCompany(c.id)}>{c.name}</button>)}</div> : null}
        {mode === "compare" && visible.length ? <button type="button" className="comparison-picker-toggle" aria-expanded={pickerOpen} aria-controls="comparison-picker" onClick={() => setPickerOpen((open) => !open)}>Edit comparison · {visible.length}/3 companies</button> : null}
        <div id="comparison-picker" className={mode === "compare" && visible.length ? "comparison-picker-content" : undefined} data-open={pickerOpen}>
        <div className="workspace-tools">
          <label>{mode === "saved" ? "Search saved companies" : "Find a company to add"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company, founder, campus or sector" /></label>
          {mode === "saved" ? <label>Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Company name</option><option value="recent">Latest dated signal</option></select></label> : null}
          <Link href="/companies">Explore companies →</Link>
        </div>
        {mode === "saved" && outsideDirectory.length ? <section className="workspace-empty"><h2>{outsideDirectory.length.toLocaleString("en-US")} saved records outside this directory</h2><p>These selections are preserved. Their full records may still be available even when they no longer appear in the eligible directory.</p><ul>{outsideDirectory.map((r) => <li key={r.entityId}><Link href={`/startup/${encodeURIComponent(r.entityId)}`}>{r.nameKey || r.entityId} →</Link></li>)}</ul></section> : null}
        {mode === "compare" && unavailable.length ? <div role="status" className="workspace-empty"><h2>Some selections are outside this directory.</h2><p>Remove them to choose another company.</p>{unavailable.map((id) => <button key={id} onClick={() => select(ids.filter((value) => value !== id))}>Remove unavailable selection</button>)}</div> : null}
        {mode === "compare" && ids.length < 3 ? <details className="workspace-picker" open={ids.length === 0 || Boolean(query)}><summary>{ids.length}/3 selected · Add {ids.length ? "another company" : "a company"}{query ? ` (${choices.length.toLocaleString("en-US")} matches)` : ""}</summary><ul>{choices.slice(0, 8).map((c) => <li key={c.id}><button onClick={() => { select([...ids, c.id]); setQuery(""); }}><strong>{c.name}</strong><span>{c.school ?? "Campus not on record"}</span><span aria-hidden>+</span></button></li>)}</ul></details> : null}
        </div>
        {visible.length === 0 ? <div className="workspace-empty"><h2>{mode === "compare" ? "Start with a company." : saved.length ? "No saved companies match." : "Your next discovery starts here."}</h2><p>{mode === "compare" ? "Use the search above to build a comparison." : saved.length ? "Try another founder, company or campus." : "Choose Save on a company in the directory or its full record."}</p>{query && mode === "saved" ? <button onClick={() => setQuery("")}>Clear search</button> : <Link href="/companies">Discover companies →</Link>}</div> : <>
          <p role="status" className="workspace-result">{visible.length.toLocaleString("en-US")} {mode === "saved" ? "saved companies shown" : "companies compared"} · Signals indicate collected evidence, not investment quality.</p>

          <div className={`workspace-grid ${mode === "compare" ? "is-comparison" : ""}`} style={{ "--comparison-columns": Math.min(visible.length, 3) } as CSSProperties}>
            {visible.map((c) => <article key={c.id} id={`compare-${c.id}`} className="workspace-company" data-mobile-active={mode === "compare" ? activeCompany === c.id : undefined}>
              <header><h2><Link href={`/startup/${c.id}`}>{c.name}</Link></h2>{mode === "compare" ? <button aria-label={`Remove ${c.name} from comparison`} onClick={() => select(ids.filter((id) => id !== c.id))}>Remove</button> : null}</header>
              <CompanyReviewActions id={c.id} name={c.name} showCompare={mode !== "compare"} />
              <dl>{[
                ["Founders", c.founders.join(" · ")], ["Campus", c.school], ["Product", c.description], ["Sector", c.sector], ["Stage", c.stage], ["Founded", c.foundedYear?.toString()], ["Headquarters", c.hqRegion], ["Programs / investors", c.programs?.join(" · ")], ["Operating status", c.operatingStatus === "public" ? "Public" : STATUS_LABEL[statusOf(c)]], ["Signals collected", c.signals.toLocaleString("en-US")], ["Latest source date", c.latestSignalAt?.replace(/-00/g, "")],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || <span className="workspace-missing">Not on record</span>}</dd></div>)}</dl>
              {mode === "compare" ? <CompanyEvidenceFacts id={c.id} /> : null}
              <Link className="workspace-record-link" href={`/startup/${c.id}#evidence`}>Review identity & sources →</Link>
            </article>)}
          </div>
        </>}
      </>}
    </div>
  );
}
