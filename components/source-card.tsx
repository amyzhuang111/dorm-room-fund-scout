import type { SourceCard as SourceCardData } from "@/lib/domain/source-quality";
import type { SourceTypedCounts } from "@/lib/domain/queries";
import { ROLE_LABEL } from "@/lib/domain/source-quality";
import { COMMUNITY_SIGNAL_CATEGORY_LABEL } from "@/lib/domain/community-signal";
import { TierBadge, CommunityConfidenceBadge } from "./badges";
import { TierOverrideForm } from "./tier-override-form";
import { CommunitySignalForm } from "./community-signal-form";

const STATUS_LABEL: Record<string, string> = {
  implemented: "Implemented",
  unconfigured: "Not yet implemented",
  checked_and_skipped: "Checked & deliberately skipped",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  hackathon: "Hackathon",
  accelerator: "Accelerator / venture program",
  lab_or_research: "Lab / research",
  student_club: "Student club / builder org",
  competition: "Competition",
  code_host: "Code host",
  portfolio_directory: "Portfolio directory",
  manual: "Manual",
  directory: "Directory",
  event: "Event",
};

const CAMPUS_LABEL: Record<string, string> = {
  univ_penn: "Penn",
  univ_berkeley: "Berkeley",
  univ_stanford: "Stanford",
  univ_mit: "MIT",
  univ_waterloo: "Waterloo",
};

export function SourceCardView({ card, compact, typedCounts }: { card: SourceCardData; compact?: boolean; typedCounts?: SourceTypedCounts }) {
  return (
    <div className="rounded-md border border-border-c bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{card.name}</p>
          <p className="text-xs text-muted">
            {card.campus ? CAMPUS_LABEL[card.campus] ?? card.campus : "Global / not campus-specific"} · {SOURCE_TYPE_LABEL[card.sourceType]}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <TierBadge tier={card.founderScoutTier} label="Founder" />
          <TierBadge tier={card.startupScoutTier} label="Startup" />
          {card.live?.communitySignal && <CommunityConfidenceBadge confidence={card.live.communitySignal.confidence} />}
        </div>
      </div>

      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">{ROLE_LABEL[card.role]} source</p>

      {!compact && (
        <>
          <div className="mt-2">
            <p className="text-xs font-semibold text-foreground">Why it matters</p>
            <p className="text-xs text-muted">{card.whyItMatters}</p>
          </div>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-foreground">What to extract</p>
              <ul className="text-xs text-muted">
                {card.whatToExtract.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">What not to infer</p>
              <ul className="text-xs text-muted">
                {card.whatNotToInfer.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            <span className="font-semibold text-foreground">Tier rationale: </span>
            {card.tierRationale}
          </p>

          {card.live?.communitySignal && (
            <div className="mt-2 rounded-md border border-border-c bg-surface-2 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Community signal</span>
                <CommunityConfidenceBadge confidence={card.live.communitySignal.confidence} />
              </div>
              {card.live.communitySignal.categories.length > 0 && (
                <p className="mt-1 text-[11px] text-muted">
                  {card.live.communitySignal.categories.map((c) => COMMUNITY_SIGNAL_CATEGORY_LABEL[c]).join(" · ")}
                </p>
              )}
              {card.live.communitySignal.rationale && <p className="mt-1 text-xs text-foreground">{card.live.communitySignal.rationale}</p>}
              {(card.live.communitySignal.mentionCount != null || card.live.communitySignal.independentMentions != null) && (
                <p className="mt-1 text-[11px] text-muted">
                  {card.live.communitySignal.mentionCount ?? "—"} mention(s) · {card.live.communitySignal.independentMentions ?? "—"} independent ·{" "}
                  {card.live.communitySignal.lastCheckedAt?.slice(0, 10) ?? "date unknown"}
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                Source-priority input only — never scored into Founder Signal, eligibility, or investment score.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-2 px-2 py-0.5">{STATUS_LABEL[card.status]}</span>
        {card.live && (
          <>
            <span>last success {card.live.lastSuccessAt?.slice(0, 10) ?? "never"}</span>
            {typedCounts && (typedCounts.people > 0 || typedCounts.projects > 0 || typedCounts.ventures > 0) ? (
              <span>
                {typedCounts.people} people · {typedCounts.projects} projects · {typedCounts.ventures} ventures
              </span>
            ) : (
              <span>{card.live.discoveredLeadCount} raw entities</span>
            )}
          </>
        )}
        {!card.live && card.url.startsWith("http") && (
          <a href={card.url} target="_blank" rel="noopener noreferrer" className="text-link underline">
            {card.url}
          </a>
        )}
      </div>
      {card.statusNote && <p className="mt-1 text-xs text-muted">{card.statusNote}</p>}
      {card.live?.error && <p className="mt-1 text-xs text-danger">Error: {card.live.error}</p>}

      {card.live?.tierOverrideBy && (
        <p className="mt-1.5 rounded-md bg-surface-2 p-1.5 text-xs text-muted">
          Tier manually overridden by {card.live.tierOverrideBy} on {card.live.tierOverrideAt?.slice(0, 10)}: &quot;{card.live.tierOverrideReason}&quot;
        </p>
      )}

      {!compact && card.dbSourceId && (
        <div className="mt-2 space-y-1.5">
          <TierOverrideForm
            sourceId={card.dbSourceId}
            currentFounderTier={card.founderScoutTier}
            currentStartupTier={card.startupScoutTier}
            hasOverride={!!card.live?.tierOverrideBy}
          />
          <CommunitySignalForm sourceId={card.dbSourceId} current={card.live?.communitySignal ?? null} />
        </div>
      )}
    </div>
  );
}
