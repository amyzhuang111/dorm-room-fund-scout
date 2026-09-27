"use client";

import { useEffect, useState } from "react";
import { LinkedInIconButton } from "@/components/person-link";
import { linkedinActionFromStored } from "@/lib/domain/person-link";
import type { WarmIntroView } from "@/lib/domain/warm-paths";

function linkedInFor(name: string, url: string | null | undefined, confidence: "confirmed" | "likely" | null | undefined, school?: string | null, firm?: string | null) {
  if (!url) return null;
  return linkedinActionFromStored({
    name,
    linkedinUrl: url,
    linkedinStatus: confidence === "confirmed" ? "confirmed" : "unverified",
    school,
    company: firm,
  });
}

export function WarmIntroPaths({ entityId, initial }: { entityId?: string; initial?: WarmIntroView | null }) {
  const [data, setData] = useState<WarmIntroView | null>(initial ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initial || !entityId) return;
    let cancel = false;
    fetch(`/api/drf/paths?id=${encodeURIComponent(entityId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<WarmIntroView>) : null))
      .then((payload) => {
        if (!cancel) setData(payload);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [entityId, initial]);

  if (failed) return null;
  if (!data) return null;
  if (!data.alum && data.paths.length === 0) {
    return <p className="text-xs text-neutral-600">No strong or medium DRF alum path.</p>;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Warm intro</h3>
      {data.alum && (
        <div className="rounded-md border border-black/15 bg-neutral-50 p-2 text-xs text-black">
          <p className="font-semibold">
            DRF alum · {data.alum.confidence}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5">
            <span>
              {data.alum.name}
              {data.alum.role || data.alum.firm ? ` · ${[data.alum.role, data.alum.firm].filter(Boolean).join(", ")}` : ""}
            </span>
            {(() => {
              const action = linkedInFor(data.alum.name, data.alum.linkedinUrl, data.alum.linkedinConfidence, data.alum.school, data.alum.firm);
              return action ? <LinkedInIconButton action={action} name={data.alum.name} /> : null;
            })()}
          </p>
          <p className="mt-0.5 text-neutral-700">
            {[data.alum.school, data.alum.team ? `${data.alum.team} team` : null, data.alum.program, data.alum.years].filter(Boolean).join(" · ") || "Campus not stated on the source"}
          </p>
          <p className="mt-1">
            <a href={data.alum.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              DRF record
            </a>
            {data.alum.firmSourceUrl && data.alum.firmSourceUrl !== data.alum.sourceUrl && (
              <>
                {" · "}
                <a href={data.alum.firmSourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Current role
                </a>
              </>
            )}
          </p>
        </div>
      )}
      {data.paths.length > 0 && (
        <ul className="space-y-2">
          {data.paths.map((path) => (
            <li key={`${path.alumId}|${path.founderId}|${path.via}`} className="text-xs text-black">
              <p className="flex items-start gap-1.5">
                {(() => {
                  const action = linkedInFor(path.sentence, path.linkedinUrl, path.linkedinConfidence);
                  return action ? <LinkedInIconButton action={action} name={path.sentence} /> : null;
                })()}
                <span>{path.sentence}</span>
              </p>
              <p className="mt-0.5 text-neutral-600">
                {path.strengthLabel} · {path.hops} {path.hops === 1 ? "hop" : "hops"}
                {path.evidence.map((item) => (
                  <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="ml-1 underline">
                    {item.label}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
