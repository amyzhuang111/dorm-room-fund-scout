"use client";

import { useEffect, useState } from "react";
import { FounderDirectory } from "@/components/founder-directory";
import type { FounderTableRow } from "@/lib/domain/founder-table";

export function FoundersDesk({
  campusId,
  campusLocked = false,
  initialCount,
}: {
  campusId?: string;
  campusLocked?: boolean;
  /** SSR count so the masthead does not flash empty. */
  initialCount?: number;
}) {
  const [founders, setFounders] = useState<FounderTableRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const qs = campusId ? `?campus=${encodeURIComponent(campusId)}` : "";
    void fetch(`/api/founder-table${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`founder-table ${res.status}`);
        return (await res.json()) as { founderCount: number; founders: FounderTableRow[] };
      })
      .then((data) => {
        if (cancel) return;
        setFounders(data.founders);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancel = true;
    };
  }, [campusId]);

  return (
    <div data-founders-desk="" data-founders-loaded={founders ? "1" : "0"}>
      <div className="mt-2 sm:mt-3">
        {error ? <p className="text-[14px] text-[color:var(--ember,#D96B1C)]">Could not load the founder table.</p> : null}
        {!founders && !error ? (
          <p className="text-[14px] text-fg-3" data-founders-loading="">
            Loading founders…
          </p>
        ) : null}
        {founders ? <FounderDirectory founders={founders} campusLocked={campusLocked} /> : null}
        {founders && typeof initialCount === "number" ? (
          <span className="sr-only" data-count="founders-searchable">
            {initialCount.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
