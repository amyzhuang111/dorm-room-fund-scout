"use client";

import { useEffect, useState } from "react";
import type { WarmIntroView } from "@/lib/domain/warm-paths";

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
    return <p className="text-xs text-neutral-600">No DRF alum path within 3 hops.</p>;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Warm intro</h3>
      {data.alum && (
        <div className="rounded-md border border-black/15 bg-neutral-50 p-2 text-xs text-black">
          <p className="font-semibold">
            DRF alum · {data.alum.confidence}
          </p>
          <p className="mt-0.5">
            {data.alum.name}
            {data.alum.role || data.alum.firm ? ` · ${[data.alum.role, data.alum.firm].filter(Boolean).join(", ")}` : ""}
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
              <p>{path.sentence}</p>
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
