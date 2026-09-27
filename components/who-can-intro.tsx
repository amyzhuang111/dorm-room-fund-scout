"use client";

import { useEffect, useState } from "react";
import { LinkedInIconButton } from "@/components/person-link";
import { linkedinActionFromStored } from "@/lib/domain/person-link";
import type { IntroPanel, IntroPath, IntroStrength } from "@/lib/domain/who-can-intro";

const STRENGTH_CLASS: Record<IntroStrength, string> = {
  strong: "border-ok/30 bg-ok-bg text-ok",
  medium: "border-warn/30 bg-warn-bg text-warn",
  weak: "border-border-c bg-surface-2 text-foreground",
};

function linkedInFor(path: IntroPath) {
  if (!path.linkedinUrl) return null;
  return linkedinActionFromStored({
    name: path.alumName,
    linkedinUrl: path.linkedinUrl,
    linkedinStatus: path.linkedinConfidence === "confirmed" || path.linkedinConfidence === "likely" ? path.linkedinConfidence : "unverified",
    school: path.school,
    company: path.firm,
  });
}

export function WhoCanIntro({ entityId }: { entityId: string }) {
  const [data, setData] = useState<IntroPanel | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/drf/intros?id=${encodeURIComponent(entityId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<IntroPanel>) : null))
      .then((payload) => {
        if (!cancel) setData(payload);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [entityId]);

  if (failed || (data && !data.target && data.paths.length === 0)) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Who can intro</h3>
      {!data && <p className="text-xs text-muted">Checking DRF alumni paths…</p>}
      {data && data.paths.length === 0 && <p className="text-xs text-muted">No DRF alum path on record for this one.</p>}
      {data && data.paths.length > 0 && (
        <ul className="space-y-2">
          {data.paths.map((path) => {
            const action = linkedInFor(path);
            const href = `/startup/pipeline?outreach=${encodeURIComponent(entityId)}&referrer=${encodeURIComponent(path.alumPersonId)}`;
            return (
              <li key={`${path.alumPersonId}|${path.reason}`} className="rounded-md border border-border-c bg-white p-2 text-xs text-foreground">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STRENGTH_CLASS[path.strength]}`}>{path.strength}</span>
                  <span className="font-semibold">{path.alumName}</span>
                  {action ? <LinkedInIconButton action={action} name={path.alumName} /> : <span className="text-muted">LinkedIn not on file</span>}
                </p>
                <p className="mt-1">{path.reason}{path.throughFounder ? `, with ${path.throughFounder}` : ""}</p>
                <p className="mt-0.5 text-muted">
                  {[path.role, path.firm, path.school].filter(Boolean).join(" · ") || "Role not on the DRF record"}
                  {path.evidenceUrl && (
                    <>
                      {" · "}
                      <a href={path.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-link underline">
                        Evidence
                      </a>
                    </>
                  )}
                </p>
                <p className="mt-1">
                  <a href={href} className="font-semibold text-link underline">
                    Request intro
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
