"use client";

import Link from "next/link";
import { isUserAddedId, PIPELINE_STAGES, type PipelineStage } from "@/lib/domain/user-pipeline";
import { useUserPipeline } from "./user-pipeline-provider";

export function UserAddedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-black bg-black px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      User-added
    </span>
  );
}

export function VerifiedByUserBadge({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center rounded-full border border-black bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-black hover:text-white"
      title="Open the verification source"
    >
      Verified by user
    </a>
  );
}

export function ShortlistStar({
  entityType,
  entityId,
  name,
  campusName,
  websiteUrl,
}: {
  entityType: "project" | "person";
  entityId: string;
  name: string;
  campusName?: string | null;
  websiteUrl?: string | null;
}) {
  const pipeline = useUserPipeline();
  const added = isUserAddedId(entityId) || pipeline.state.startups.some((startup) => startup.id === entityId || startup.founders.some((founder) => founder.id === entityId));
  const starred = pipeline.state.links.some((link) => link.entityType === entityType && link.entityId === entityId);
  if (added) {
    return (
      <Link
        href="/startup/pipeline"
        aria-label={`${name} is in the pipeline`}
        title="In the pipeline"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-black bg-black text-xs text-white"
      >
        ★
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Remove ${name} from the pipeline` : `Add ${name} to the pipeline`}
      title={starred ? "In the pipeline" : "Add to pipeline"}
      onClick={() => {
        if (starred) pipeline.unstar(entityType, entityId);
        else
          pipeline.star({
            entityType,
            entityId,
            name,
            campusName: campusName ?? null,
            websiteUrl: websiteUrl ?? null,
          });
      }}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-black text-xs ${starred ? "bg-black text-white" : "bg-white text-black"}`}
    >
      ★
    </button>
  );
}

export function EntityMarks({
  entityType,
  entityId,
  name,
  campusName,
  websiteUrl,
}: {
  entityType: "project" | "person";
  entityId: string;
  name: string;
  campusName?: string | null;
  websiteUrl?: string | null;
}) {
  const { state } = useUserPipeline();
  const startup = state.startups.find((row) => row.id === entityId);
  const founderStartup = state.startups.find((row) => row.founders.some((founder) => founder.id === entityId));
  const link = state.links.find((row) => row.entityType === entityType && row.entityId === entityId);
  const added = !!startup || !!founderStartup || isUserAddedId(entityId);
  const verification = startup?.verificationUrl || founderStartup?.verificationUrl || link?.verificationUrl || null;
  return (
    <>
      <ShortlistStar entityType={entityType} entityId={entityId} name={name} campusName={campusName} websiteUrl={websiteUrl} />
      {added && <UserAddedBadge />}
      {verification && <VerifiedByUserBadge url={verification} />}
    </>
  );
}

export function PipelineStageEditor({
  entityType,
  entityId,
  name,
  campusName,
  websiteUrl,
}: {
  entityType: "project" | "person";
  entityId: string;
  name: string;
  campusName?: string | null;
  websiteUrl?: string | null;
}) {
  const pipeline = useUserPipeline();
  const startup = pipeline.state.startups.find((row) => row.id === entityId);
  const link = pipeline.state.links.find((row) => row.entityType === entityType && row.entityId === entityId);
  if (startup) {
    return (
      <label className="flex items-center gap-2 text-xs text-muted">
        Stage
        <select
          value={startup.stage}
          onChange={(event) => pipeline.setStartupStage(startup.id, event.target.value as PipelineStage)}
          className="rounded-md border border-black bg-white px-2 py-1 text-xs text-black"
        >
          {PIPELINE_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <Link href={`/startup/pipeline?edit=${startup.id}`} className="font-medium text-black underline">
          Edit entry
        </Link>
      </label>
    );
  }
  if (!link) {
    return (
      <button
        type="button"
        onClick={() => pipeline.star({ entityType, entityId, name, campusName: campusName ?? null, websiteUrl: websiteUrl ?? null })}
        className="rounded-md border border-black bg-white px-3 py-1.5 text-xs font-medium text-black"
      >
        Add to pipeline
      </button>
    );
  }
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
      Stage
      <select
        value={link.stage}
        onChange={(event) => pipeline.setLinkStage(link.id, event.target.value as PipelineStage)}
        className="rounded-md border border-black bg-white px-2 py-1 text-xs text-black"
      >
        {PIPELINE_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => pipeline.removeLink(link.id)} className="font-medium text-black underline">
        Remove from pipeline
      </button>
    </label>
  );
}
