"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PipelineStageEditor, UserAddedBadge, VerifiedByUserBadge } from "./entity-marks";
import { useUserPipeline } from "./user-pipeline-provider";
import { namedPersonPath } from "@/lib/domain/person-href";

export function UserStartupPage({ id }: { id: string }) {
  const router = useRouter();
  const pipeline = useUserPipeline();
  const startup = pipeline.state.startups.find((row) => row.id === id);
  const [confirm, setConfirm] = useState(false);
  if (pipeline.storage === "unknown") {
    return <p className="p-6 text-sm text-neutral-700">Loading this entry…</p>;
  }
  if (!startup) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-black">This user-added startup is not in this browser.</p>
        <Link href="/startup/pipeline" className="mt-2 inline-block text-sm font-medium underline">
          Back to pipeline
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="border-b border-black px-4 py-2">
        <Link href="/startup/pipeline" className="text-xs font-medium underline">
          Pipeline
        </Link>
      </div>
      <article className="space-y-4 p-4 text-black">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{startup.name}</h1>
          <UserAddedBadge />
          <VerifiedByUserBadge url={startup.verificationUrl} />
        </div>
        <p className="text-sm">{startup.campusName}</p>
        {startup.description && <p className="text-sm">{startup.description}</p>}
        {startup.fundingStage && <p className="text-sm">Stage / funding: {startup.fundingStage}</p>}
        <div className="flex flex-wrap gap-2">
          {startup.websiteUrl && (
            <a href={startup.websiteUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-black bg-black px-3 py-1.5 text-sm font-medium text-white">
              Visit website
            </a>
          )}
          <a href={startup.verificationUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-black bg-white px-3 py-1.5 text-sm font-medium text-black">
            Verification source
          </a>
        </div>
        {startup.verificationNotes && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Notes</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{startup.verificationNotes}</p>
          </section>
        )}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Founders</h2>
          <ul className="mt-1 space-y-1 text-sm">
            {startup.founders.length === 0 && <li>No founders recorded.</li>}
            {startup.founders.map((founder) => (
              <li key={founder.id} className="flex flex-wrap items-center gap-2">
                <Link href={namedPersonPath(founder.id)} className="underline">
                  {founder.name}
                </Link>
                {founder.role && <span className="text-neutral-700">{founder.role}</span>}
                {founder.classYear && <span className="text-neutral-700">Class of {founder.classYear}</span>}
                {founder.linkedinUrl && (
                  <a href={founder.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    LinkedIn
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
        <PipelineStageEditor entityType="project" entityId={startup.id} name={startup.name} campusName={startup.campusName} websiteUrl={startup.websiteUrl} />
        <div className="flex gap-3 text-sm">
          <Link href={`/startup/pipeline?edit=${startup.id}`} className="font-medium underline">
            Edit
          </Link>
          {confirm ? (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                pipeline.deleteStartup(startup.id);
                router.push("/startup/pipeline");
              }}
            >
              Confirm delete
            </button>
          ) : (
            <button type="button" className="underline" onClick={() => setConfirm(true)}>
              Delete
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
