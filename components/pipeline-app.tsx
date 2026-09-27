"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PIPELINE_STAGES, type PipelineStage, type UserStartup } from "@/lib/domain/user-pipeline";
import type { IntroPanel } from "@/lib/domain/who-can-intro";
import { AddStartupForm } from "./add-startup-form";
import { UserAddedBadge, VerifiedByUserBadge } from "./entity-marks";
import { PipelineSourceFields } from "./pipeline-source-fields";
import { PipelineSourceMix } from "./pipeline-source-mix";
import { useUserPipeline } from "./user-pipeline-provider";

export function PipelineApp({ campuses }: { campuses: { id: string; name: string }[] }) {
  const pipeline = useUserPipeline();
  const params = useSearchParams();
  const requested = params.get("edit");
  const outreachId = params.get("outreach");
  const referrerId = params.get("referrer");
  const [creating, setCreating] = useState(params.get("add") === "1");
  const [editingId, setEditingId] = useState<string | null>(requested);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const editing = pipeline.state.startups.find((startup) => startup.id === (editingId ?? requested)) ?? null;
  const showForm = creating || !!editing;

  const cards = [
    ...pipeline.state.startups.map((startup) => ({ kind: "startup" as const, startup, stage: startup.stage })),
    ...pipeline.state.links.map((link) => ({ kind: "link" as const, link, stage: link.stage })),
  ];

  return (
    <div className="mx-auto max-w-[1400px] p-4 text-black sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Pipeline</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-700">
            Startups and founders you have verified, plus anyone you star from search or a detail page. Move a card between stages, edit it, or delete it.
          </p>
        </div>
        <button type="button" onClick={() => { setCreating(true); setEditingId(null); }} className="rounded-md border border-black bg-black px-3 py-1.5 text-sm font-medium text-white">
          Add startup / founder
        </button>
      </div>

      {pipeline.storage === "local" && (
        <div id="setup" className="mt-4 rounded-md border border-black bg-white p-3 text-sm">
          <p className="font-semibold">{pipeline.notice ?? "Entries are saved only in this browser."}</p>
          <p className="mt-1 text-neutral-800">They will not be here on another device until you connect a free database. No paid service is required.</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium underline">One-time setup</summary>
            <SetupSteps />
          </details>
        </div>
      )}
      {pipeline.storage !== "local" && <div id="setup" />}

      <PipelineSourceMix state={pipeline.state} />

      {outreachId && referrerId && <OutreachRequest entityId={outreachId} referrerId={referrerId} />}

      {showForm && (
        <div className="mt-4">
          <AddStartupForm
            campuses={campuses}
            initial={editing}
            onCancel={() => {
              setCreating(false);
              setEditingId(null);
            }}
            onSaved={() => {
              setCreating(false);
              setEditingId(null);
            }}
          />
        </div>
      )}

      <div className="mt-5 flex gap-3 overflow-x-auto pb-3">
        {PIPELINE_STAGES.map((stage) => {
          const list = cards.filter((card) => card.stage === stage);
          return (
            <section key={stage} className="w-72 shrink-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                {stage} <span className="font-medium">({list.length})</span>
              </h2>
              <div className="mt-2 space-y-2">
                {list.map((card) =>
                  card.kind === "startup" ? (
                    <StartupCard
                      key={card.startup.id}
                      startup={card.startup}
                      confirmDelete={confirmDelete === card.startup.id}
                      onStage={(next) => pipeline.setStartupStage(card.startup.id, next)}
                      onSource={(next) => pipeline.setStartupSource(card.startup.id, next.sourcedVia, next.referrer)}
                      onEdit={() => {
                        setEditingId(card.startup.id);
                        setCreating(false);
                      }}
                      onAskDelete={() => setConfirmDelete(card.startup.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onDelete={() => {
                        pipeline.deleteStartup(card.startup.id);
                        setConfirmDelete(null);
                        if (editingId === card.startup.id) setEditingId(null);
                      }}
                    />
                  ) : (
                    <article key={card.link.id} className="rounded-md border border-black bg-white p-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={card.link.entityType === "project" ? `/startup/${card.link.entityId}` : `/founder/discover?founder=${card.link.entityId}&enroll=current_student,recent_grad,older_alumni`} className="font-medium underline">
                          {card.link.name}
                        </Link>
                        <span className="text-[10px] uppercase tracking-wide text-neutral-600">{card.link.entityType === "project" ? "Startup" : "Founder"}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-700">{card.link.campusName ?? "Campus not recorded"}</p>
                      {card.link.verificationUrl && (
                        <p className="mt-1">
                          <VerifiedByUserBadge url={card.link.verificationUrl} />
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StageSelect value={card.link.stage} onChange={(next) => pipeline.setLinkStage(card.link.id, next)} />
                        <button type="button" onClick={() => pipeline.removeLink(card.link.id)} className="text-xs underline">
                          Remove
                        </button>
                      </div>
                      <PipelineSourceFields
                        compact
                        sourcedVia={card.link.sourcedVia}
                        referrer={card.link.referrer}
                        onChange={(next) => pipeline.setLinkSource(card.link.id, next.sourcedVia, next.referrer)}
                      />
                    </article>
                  )
                )}
                {list.length === 0 && <p className="rounded-md border border-dashed border-black/30 px-2 py-3 text-xs text-neutral-600">Nothing in {stage}.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OutreachRequest({ entityId, referrerId }: { entityId: string; referrerId: string }) {
  const pipeline = useUserPipeline();
  const [panel, setPanel] = useState<IntroPanel | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/drf/intros?id=${encodeURIComponent(entityId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<IntroPanel>) : null))
      .then((payload) => {
        if (!cancel) setPanel(payload);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [entityId]);

  if (failed) return <p className="mt-4 text-sm text-neutral-800">The intro path could not be loaded.</p>;
  if (!panel) return <p className="mt-4 text-sm text-neutral-700">Loading intro…</p>;
  const path = panel.paths.find((item) => item.alumPersonId === referrerId);
  if (!panel.target || !path) {
    return <p className="mt-4 rounded-md border border-black bg-white p-3 text-sm">That referrer is not a recorded path for this startup.</p>;
  }
  const line = `${path.alumName} — ${path.reason}`.slice(0, 120);
  const existing = pipeline.state.links.find((link) => link.entityType === panel.target!.kind && link.entityId === panel.target!.id);
  return (
    <section className="mt-4 rounded-md border border-black bg-white p-3 text-sm">
      <h2 className="font-semibold">Add to outreach</h2>
      <p className="mt-1">
        {panel.target.name}
        {panel.target.campusName ? ` · ${panel.target.campusName}` : ""}
      </p>
      <p className="mt-1">
        <span className="font-semibold uppercase">{path.strength}</span> · {path.reason}
        {path.throughFounder ? `, with ${path.throughFounder}` : ""}
      </p>
      <p className="mt-1 text-neutral-800">Referrer: {path.alumName}{[path.role, path.firm].filter(Boolean).length ? ` · ${[path.role, path.firm].filter(Boolean).join(", ")}` : ""}</p>
      {saved || existing?.referrer === line ? (
        <p className="mt-2 font-semibold">In the pipeline, with {path.alumName} as the referrer.</p>
      ) : (
        <button
          type="button"
          className="mt-2 rounded-md border border-black bg-black px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => {
            if (existing) pipeline.setLinkSource(existing.id, "alum_referral", line);
            else {
              pipeline.star({
                entityType: panel.target!.kind,
                entityId: panel.target!.id,
                name: panel.target!.name,
                campusName: panel.target!.campusName,
                websiteUrl: panel.target!.websiteUrl,
                sourcedVia: "alum_referral",
                referrer: line,
              });
            }
            setSaved(true);
          }}
        >
          {existing ? "Attach referrer" : "Add to outreach"}
        </button>
      )}
    </section>
  );
}

function StageSelect({ value, onChange }: { value: PipelineStage; onChange: (stage: PipelineStage) => void }) {
  return (
    <select aria-label="Pipeline stage" value={value} onChange={(event) => onChange(event.target.value as PipelineStage)} className="rounded-md border border-black bg-white px-2 py-1 text-xs">
      {PIPELINE_STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {stage}
        </option>
      ))}
    </select>
  );
}

function StartupCard({
  startup,
  confirmDelete,
  onStage,
  onSource,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  startup: UserStartup;
  confirmDelete: boolean;
  onStage: (stage: PipelineStage) => void;
  onSource: (next: { sourcedVia: UserStartup["sourcedVia"]; referrer: string | null }) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-md border border-black bg-white p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/startup/${startup.id}`} className="font-medium underline">
          {startup.name}
        </Link>
        <UserAddedBadge />
      </div>
      <p className="mt-0.5 text-xs text-neutral-700">{startup.campusName}</p>
      {startup.description && <p className="mt-1 text-xs">{startup.description}</p>}
      {startup.founders.length > 0 && <p className="mt-1 text-xs text-neutral-800">{startup.founders.map((founder) => founder.name).join(", ")}</p>}
      {startup.fundingStage && <p className="mt-1 text-xs text-neutral-700">{startup.fundingStage}</p>}
      <p className="mt-1">
        <VerifiedByUserBadge url={startup.verificationUrl} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StageSelect value={startup.stage} onChange={onStage} />
        <button type="button" onClick={onEdit} className="text-xs underline">
          Edit
        </button>
        {confirmDelete ? (
          <>
            <button type="button" onClick={onDelete} className="text-xs font-semibold underline">
              Confirm delete
            </button>
            <button type="button" onClick={onCancelDelete} className="text-xs underline">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={onAskDelete} className="text-xs underline">
            Delete
          </button>
        )}
      </div>
      <PipelineSourceFields compact sourcedVia={startup.sourcedVia} referrer={startup.referrer} onChange={onSource} />
    </article>
  );
}

function SetupSteps() {
  return (
    <div className="mt-2 space-y-3 text-sm leading-relaxed">
      <p>Pick one free store. Connect it from the Vercel project, redeploy, and reload this page. The banner disappears when the database is reachable.</p>
      <div>
        <p className="font-semibold">Upstash Redis (no SQL)</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Open the Vercel project → Storage → Marketplace → Upstash Redis, and create a free database.</li>
          <li>Connect it to this project. Vercel writes <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> (or <code>KV_REST_API_URL</code> and <code>KV_REST_API_TOKEN</code>).</li>
          <li>Redeploy. Entries sync across browsers. Nothing else to create.</li>
        </ol>
      </div>
      <div>
        <p className="font-semibold">Neon Postgres or Supabase</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>From the same Marketplace screen, add Neon Postgres (free) or Supabase (free).</li>
          <li>Connect it so Vercel sets <code>POSTGRES_URL</code> or <code>DATABASE_URL</code> to a <code>postgres://</code> URL.</li>
          <li>Redeploy. The first pipeline save creates the table <code>scout_user_pipeline</code>. You do not run SQL by hand.</li>
        </ol>
      </div>
      <p>If both Redis and Postgres are set, Postgres is used. Local <code>.env.local</code> can hold the same variable names for <code>next dev</code>.</p>
    </div>
  );
}
