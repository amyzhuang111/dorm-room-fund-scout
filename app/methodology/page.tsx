import fs from "node:fs";
import path from "node:path";
import { RUBRIC_DIMENSIONS, RUBRIC_VERSION } from "@/lib/scoring/rubric";
import { SCREENING_CONFIG } from "@/lib/screening/config";
import {
  openLaneDefinitionText,
  openLaneStrongDefinition,
  openLaneTopFundDefinition,
  openLaneDeskDefinition,
} from "@/lib/domain/open-lane";

function loadRecencyFunnel() {
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "corpus-snapshot.json"), "utf8"));
    return {
      investable: Number(snap.investableCompanies ?? 0),
      excludedOlderAlumni: Number(snap.excludedOlderAlumni ?? 0),
      unverifiedRecency: Number(snap.unverifiedRecency ?? 0),
      companiesTotal: Number(snap.companiesTotal ?? 0),
    };
  } catch {
    return { investable: 0, excludedOlderAlumni: 0, unverifiedRecency: 0, companiesTotal: 0 };
  }
}

export default function MethodologyPage() {
  const recency = loadRecencyFunnel();
  return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-5 pb-16 pt-10 sm:px-12 lg:grid-cols-[200px_minmax(0,680px)]">
      <nav className="micro sticky top-20 hidden space-y-3 lg:block" aria-label="On this page">
        <a href="#products" className="block text-fg-3">Products</a>
        <a href="#promotion" className="block text-fg-3">Promotion</a>
        <a href="#open-lane" className="block text-fg-3">Open lane</a>
        <a href="#founder-recency" className="block text-fg-3">Founder recency</a>
      </nav>
      <div className="max-w-[680px] space-y-8">
      <div>
        <p className="num text-[12px] text-fg-3">Rules reviewed 2026-09-18</p>
        <p className="page-eyebrow mt-3">How a record is scored</p>
        <h1 className="page-title">Methodology</h1>
        <p className="pull my-8">A default is never presented as your fund&apos;s official rubric.</p>
        <p className="mt-1 text-[17px] leading-7 text-fg-2">
          This is a scouting workspace any fund can use. Every rule below is tagged with where it came
          from · a published policy, internal sourcing guidance, or a proposed product default · so a default is never presented as your fund&apos;s
          official rubric.
        </p>
      </div>

      <section id="products">
        <h2 className="pt-8 text-2xl font-semibold tracking-[-0.02em] text-foreground">Founder Scout vs. Startup Scout</h2>
        <p className="mt-1 text-sm text-muted">
          These are two separate products sharing one workspace, not two views of the same list. <strong>Founder Scout</strong> tracks
          people and the project evidence attached to them · including hackathon submissions, which are founder evidence, not startups.
          <strong> Startup Scout</strong> tracks only formed (or plausibly forming) companies. A Cal Hacks/PennApps/TreeHacks submission
          enters as a project attached to its founders; it only becomes a Startup Scout candidate once there&apos;s independent evidence
          it&apos;s an actual (or plausibly forming) company · never automatically. Internally this is the <code className="font-mono text-xs">kind</code>{" "}
          field on a project (<code className="font-mono text-xs">project</code> vs. <code className="font-mono text-xs">company</code>);
          Startup Scout&apos;s queries only ever read <code className="font-mono text-xs">kind=&apos;company&apos;</code>.
        </p>
      </section>

      <section id="promotion">
        <h2 className="pt-8 text-2xl font-semibold tracking-[-0.02em] text-foreground">Founder candidate promotion</h2>
        <p className="mt-1 text-sm text-muted">
          Founder Scout Discover does not show every resolved person · only <strong>promoted</strong> candidates, per a deterministic rule
          in <code className="font-mono text-xs">lib/domain/promotion.ts</code>: a person is promoted if they&apos;re linked to a real
          company as a founder, hold a named leadership/technical-lead role, hold any specific named role (not a generic
          &quot;team member&quot; placeholder), or appear with a real role on 2+ distinct projects (repeat building). Club membership,
          hackathon attendance alone, or a directory listing never promotes someone by itself. A Devpost hackathon gallery&apos;s public
          team-member list never tells us who owned what, so every hackathon team member is recorded with the honest, non-differentiated
          role <code className="font-mono text-xs">team_member</code> · not <code className="font-mono text-xs">founder</code> · unless
          they separately hold a leadership role elsewhere.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Founder Signal</h2>
        <p className="mt-1 text-sm text-muted">
          Separate from source tier · a source&apos;s tier says how useful it is to scan, not how strong any individual person&apos;s
          evidence is. <code className="font-mono text-xs">lib/scoring/founder-signal.ts</code> computes 8 dimensions (ability to build,
          technical depth, repeat building, shipping velocity, project ambition, external validation, collaborator quality, momentum) from
          real rows only · unknown is never coerced to zero, and dimensions with no reliable deterministic source (technical depth, project
          ambition, momentum) always report unknown rather than being guessed at. A headline Founder Signal number only shows once real
          coverage clears a bar (≥50% of dimensions assessed, ability-to-build above &quot;none&quot;) · given how thin per-person evidence
          still is today (mostly single hackathon-team-membership claims, no per-founder GitHub resolution yet), most founders correctly
          show &quot;unassessed&quot; rather than an invented score.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Screening gates</h2>
        <p className="mt-1 text-sm text-muted">Each candidate is screened on six gates. A failed gate never contributes to the quality score · it routes the candidate to Exploration or excludes it as outside the current brief.</p>
        <ul className="mt-3 space-y-2">
          {Object.values(SCREENING_CONFIG).map((entry) => (
            <li key={entry.key} className="rounded-md border border-border-c bg-surface p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{entry.key.replace(/_/g, " ")}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">{entry.provenance.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 text-foreground">Value: {JSON.stringify(entry.value)}</p>
              <p className="mt-1 text-xs text-muted">{entry.reason}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Quality rubric (version {RUBRIC_VERSION})</h2>
        <p className="mt-1 text-sm text-muted">
          Proposed scouting weights, not an official fund rubric or a prediction of returns. Founder-related dimensions total 45%. Ratings
          are 0-5 or null · null is never silently treated as zero. A headline score only shows once coverage and the required dimensions
          (ability to build, domain knowledge/access, customer pain) are met.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-border-c text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1.5">Dimension</th>
              <th className="py-1.5">Weight</th>
            </tr>
          </thead>
          <tbody>
            {RUBRIC_DIMENSIONS.map((d) => (
              <tr key={d.key} className="border-b border-border-c">
                <td className="py-1.5 text-foreground">{d.label}</td>
                <td className="py-1.5 text-muted">{d.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>



      <section id="open-lane" data-methodology-open-lane="">
        <h2 className="pt-8 text-2xl font-semibold tracking-[-0.02em] text-foreground">Open lane on the map</h2>
        <p className="mt-1 text-sm text-muted">
          The desk map fold shows how many strong student founders still have no top fund on record. The wording below is
          generated from <code className="font-mono text-xs">lib/domain/open-lane.ts</code> so it cannot drift from the matcher.
        </p>
        <p className="mt-3 text-sm text-foreground" data-methodology-open-lane-def="">
          <span data-methodology-open-lane-def-strong="">{openLaneStrongDefinition()}</span>{" "}
          <span data-methodology-open-lane-def-top-fund="">{openLaneTopFundDefinition()}</span>{" "}
          <span data-methodology-open-lane-def-desk="">{openLaneDeskDefinition()}</span>
        </p>
        <p className="sr-only" data-methodology-open-lane-def-full="">
          {openLaneDefinitionText()}
        </p>
        <p className="mt-2 text-xs text-muted">
          Open lane = strong signal and no top fund on the founder&apos;s program list. Top VC names use the same
          <code className="font-mono text-xs"> investorFactIsTopVc </code> helper as the network heatmaps.
        </p>
      </section>

      <section id="founder-recency">
        <h2 className="pt-8 text-2xl font-semibold tracking-[-0.02em] text-foreground">Founder recency gate</h2>
        <p className="mt-1 text-sm text-muted">
          As of November 2026, a company is <strong>kept (investable)</strong> only when at least one named founder is a
          current student or an alum who graduated in <strong>2023 or later</strong>. Companies that fail that bar are
          excluded as older alumni. Companies we have not yet checked stay in an explicit{" "}
          <strong>unverified recency</strong> bucket — they are labeled as such and are <em>not</em> counted in the
          verified/investable totals on the home page, globe, or /data explorer.
        </p>
        <ul className="mt-3 space-y-2 text-sm" data-recency-funnel="">
          <li className="rounded-md border border-border-c bg-surface p-3">
            <span className="font-medium text-foreground">Kept / investable</span>
            <span className="ml-2 font-mono tabular-nums text-ok" data-count="recency-kept">{recency.investable.toLocaleString("en-US")}</span>
            <p className="mt-1 text-xs text-muted">Counted on the site as verified campus companies.</p>
          </li>
          <li className="rounded-md border border-border-c bg-surface p-3">
            <span className="font-medium text-foreground">Excluded · older alumni</span>
            <span className="ml-2 font-mono tabular-nums text-muted" data-count="recency-excluded">{recency.excludedOlderAlumni.toLocaleString("en-US")}</span>
            <p className="mt-1 text-xs text-muted">Public evidence shows every checked founder graduated before 2023.</p>
          </li>
          <li className="rounded-md border border-dashed border-border-c bg-surface-2 p-3">
            <span className="font-medium text-foreground">Unverified recency</span>
            <span className="ml-2 font-mono tabular-nums text-warn" data-count="recency-unverified">{recency.unverifiedRecency.toLocaleString("en-US")}</span>
            <p className="mt-1 text-xs text-muted">Not yet checked against LinkedIn / cohort / university pages. Not counted as verified.</p>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          Corpus companies total {recency.companiesTotal.toLocaleString("en-US")} · funnel numbers come from{" "}
          <code className="font-mono">data/corpus-snapshot.json</code> after each recency batch.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Signals</h2>
        <p className="mt-1 text-sm text-muted">
          Dated, substantive changes only · a first scan establishes a baseline, not growth. Footer edits, bot commits, dependency churn,
          and duplicate announcements are excluded by design; a failed fetch is never treated as a sign a company went inactive.
          Competition placements are labeled Award (not Grant) unless the source specifically calls them a grant.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Source quality tiering</h2>
        <p className="mt-1 text-sm text-muted">
          Every source has two independent tiers · Founder Scout and Startup Scout (S/A/B/C/D) · because a source can be excellent for
          finding builders early and mediocre for finding formed startups, or the reverse. Prestige is never the tier. The
          rationale is written against 7 dimensions (campus purity, earliness, evidence of building, selectivity, novelty, identity
          quality, extractability) on the <a href="/signals/sources" className="text-link underline">Sources</a> page. Manual overrides are
          sticky and always attributed (who/when/why) · re-ingesting never silently reverts one.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Portfolio handling</h2>
        <p className="mt-1 text-sm text-muted">
          A fund can keep an existing portfolio as a reference set. Those companies stay visible and are left out of new-target
          queues. This workspace does not ship a portfolio directory of its own.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">What&apos;s implemented vs. deferred</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-foreground">
          <li>✅ Schema, evidence-linked claims, deterministic gates and rubric, Table + Shortlist + University drawer + Pipeline + Signals + Sources.</li>
          <li>✅ Real ingestion across two campuses: Penn (Penn Labs directory, Venture Lab Startup Challenge, GitHub org enrichment, PennApps XXVI Devpost gallery) and Stanford (TreeHacks 2026 Devpost gallery) · 56 total candidates, all correctly unassessed/unverified rather than assumed eligible.</li>
          <li>✅ Fixed a real entity-resolution bug: people were being matched by display name alone across sources, silently merging different real people who share a common name. Now keyed on a real corroborating identifier where one exists (Devpost profile URL, Penn <code className="font-mono text-xs">pennkey</code>) · see README for the specific case caught and fixed.</li>
          <li>✅ Manual notes per company, preserved across ingestion refreshes and kept separate from sourced evidence.</li>
          <li>✅ Manual referral entry (single lead) at <code className="font-mono text-xs">/sources/new-referral</code>, plus CSV bulk import on <code className="font-mono text-xs">/sources</code> · both screened through the same gates as ingested candidates, with unmatched university names skipped and listed, never guessed.</li>
          <li>✅ Basic Network view for a selected university (server-rendered, capped at 60 nodes, keyboard-accessible node list).</li>
          <li>✅ Globe view on real MapLibre GL JS with its native 3D globe projection and the free OpenFreeMap &quot;positron&quot; vector style (the same stack dashboard.vclense.ch/ycglobe uses), with a floating glass campus-summary panel. Loaded from the CDN at runtime, not through Turbopack&apos;s bundle · Turbopack was found to break MapLibre&apos;s internal tile-loading Web Worker, which silently produced a map that painted only its flat background layer with zero tile requests ever firing. <strong>Actually visually verified</strong> with a real headless browser against the live production deployment: real continents/oceans/boundaries/labels and our own campus markers all confirmed rendering, and 8 real vector-tile requests confirmed firing. See README for the full root-cause writeup.</li>
          <li>✅ Source quality tiering · two independent tiers per source, campus playbooks, sticky manual overrides.</li>
          <li>✅ Real Berkeley sourcing (Cal Hacks 12.0, same Devpost pattern as PennApps/TreeHacks) · Berkeley now has real candidates, not just tier metadata.</li>
          <li>✅ UI/UX upgrade per a separate detailed spec: renamed Universe→Explore (with a redirect alias), new dark design tokens, search + Companies/Builders entity switch, reworked table columns and drawer ordering (Why look/Founder edge/Open question above the fold), a real compact Sources table with typed People/Projects/Ventures counts, and Signals filters/labels (also fixed a real bug: competition placements were mislabeled &quot;grant&quot; instead of &quot;award&quot;).</li>
          <li>✅ Split into Founder Scout / Startup Scout as two products under one &quot;Campus Scout&quot; nav, with the data-model correction described above (hackathon projects no longer masquerade as companies) · replaced the Companies/Builders entity switch entirely. Rebalanced the palette toward neutral gray/white, reserving purple for interaction/selection. Pipeline stages consolidated to New/Researching/Contact planned/Contacted/Meeting/Diligence/Passed (dropped the redundant &quot;Watching&quot; status · the watch queue keys off an explicit due date instead) with a board/table toggle and compact cards replacing the old chip wall. Verification page groups companies by their single primary blocker instead of a generic &quot;Needs research.&quot; Signals cards dropped the ingestion-log boilerplate and now show &quot;Discovered {"{"}date{"}"}&quot; instead of &quot;date unknown&quot; when the true event date isn&apos;t known. Sources&apos; Table/Registry/Playbook tabs collapsed to Registry/Playbooks, with tier/role/status/yield columns folded into one Registry table. Old routes (<code className="font-mono text-xs">/explore</code>, <code className="font-mono text-xs">/universe</code>, <code className="font-mono text-xs">/shortlist</code>, <code className="font-mono text-xs">/pipeline</code>) now redirect to their Startup Scout equivalents. See README for what wasn&apos;t done (Globe company-HQ mode, Network typed-edge rework, in-app scan-trigger UI).</li>
          <li>✅ Manual assessment UI (rate any candidate 0-5-or-unknown per dimension); rubric math is always computed deterministically, never by the rating form itself. New assessments are added to history, never overwrite a prior one.</li>
          <li>✅ Real ingestion at two more campuses via their real public accelerators: MIT (delta v, <code className="font-mono text-xs">fetch-mit-deltav.ts</code>) and Waterloo (Velocity, <code className="font-mono text-xs">fetch-velocity.ts</code>). Neither accelerator&apos;s own site exposes a per-founder detail page reliably enough to extract names without guessing, so companies are ingested honestly &quot;founders not yet identified&quot; where that&apos;s the case, still linked to their real accelerator/university evidence.</li>
          <li>✅ Two of the brief&apos;s previously-unconfigured P0 sources now real: Web Development at Berkeley (its own site has no team roster or project-credits page · real evidence instead comes from its GitHub org&apos;s commit history) and GRASP Lab (its Startups page is fully AJAX-loaded with no usable fallback · real evidence instead comes from a genuine WordPress REST API the site exposes). Both hand-verify every named founder against the actual page text rather than a generic parser, to avoid mistaking an advisor/faculty mention for a founding claim.</li>
          <li>✅ Possible-company detection: a person&apos;s own bio (currently: GitHub bio, the one place this app captures real personal bio text) can surface a company they say they&apos;re building, but it&apos;s never auto-created as a Startup Scout candidate · it&apos;s filed as a reviewable hint (shown as &quot;Possible company: X (unconfirmed)&quot; on their Founder Scout card) unless it corroborates a company they&apos;re already a confirmed founder of.</li>
          <li>✅ Canvas-view bottom result tray (compact cards for the current filtered result set) and a localStorage-backed &quot;remember the user&apos;s last view&quot; on Startup Scout&apos;s Globe/Table switch.</li>
          <li>⏳ Marker clustering for dense campus clusters · not needed yet at 5 campuses, but not implemented either.</li>
          <li>⏳ Most of the source catalogue in the brief (Penn Innovation Fund, VIP/VIP-X, Show HN, Hugging Face, other campuses&apos; adapters) · see Sources for exact status per source. PennApps&apos; own live site still has no gallery right now (pre-registration for a not-yet-run edition) · its real past-edition Devpost gallery is what got ingested instead, with affiliation honestly marked unverified rather than skipped outright.</li>
          <li>⏳ LLM-assisted assessment <em>proposals</em> · no provider configured, so rating is manual-only; none of the 8 shipped candidates are pre-rated (no invented scores).</li>
        </ul>
      </section>
      </div>
    </div>
  );
}
